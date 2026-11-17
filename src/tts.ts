import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { FetchLike } from './upstream.ts';

const execFileAsync = promisify(execFile);

export type TtsEmotionHint =
  | 'neutral'
  | 'warm'
  | 'calm'
  | 'dry'
  | 'relieved'
  | 'playful'
  | 'serious';

export interface SynthesizedVoiceClip {
  readonly audioSrc: string;
  readonly durationSeconds?: number;
}

export type VoiceNoteSynthesizer = (input: {
  readonly text: string;
  readonly emotion: TtsEmotionHint;
}) => Promise<SynthesizedVoiceClip | undefined>;

export const TTS_PROVIDER_IDS = ['auto', 'openai', 'bridge', 'elevenlabs', 'webspeech'] as const;
export type TtsProviderId = (typeof TTS_PROVIDER_IDS)[number];

export const DEFAULT_TTS_KEY_REFS = [
  'NB_SPEAK_TTS_API_KEY',
  'ELEVENLABS_API_KEY',
  'ELEVEN_API_KEY',
  'XI_API_KEY',
] as const;

export interface TtsSynthesisConfig {
  readonly getProvider?: () => string;
  readonly getBaseUrl?: () => string;
  readonly getBridgeScript?: () => string;
  readonly getApiKey?: () => Promise<string> | string;
  readonly getVoice?: () => string;
  readonly getModel?: () => string;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly fetchImpl?: FetchLike;
}

const ELEVENLABS_VOICE_ALIASES: Readonly<Record<string, string>> = {
  jessica: 'cgSgspJ2msm6clMCkdW9',
  sarah: 'EXAVITQu4vr4xnSDxMaL',
  ziyue: '5qr5FEpvZGzmVOPBS55W',
  bobo: 's2LjOZIlsH2Yu4p6MtAK',
  shanshan: 'ByhETIclHirOlWnWKhHc',
  julia: 'tOuLUAIdXShmWH7PEUrU',
};

const NON_MANDARIN_VOICES = new Set([
  'cgSgspJ2msm6clMCkdW9',
  'EXAVITQu4vr4xnSDxMaL',
]);

const CJK_TEST_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

export function resolveElevenLabsVoiceId(rawVoice: string | undefined, emotion: TtsEmotionHint): string {
  const cleaned = (rawVoice ?? '').trim();
  if (cleaned && cleaned.toLowerCase() !== 'auto') {
    return ELEVENLABS_VOICE_ALIASES[cleaned.toLowerCase()] ?? cleaned;
  }
  if (emotion === 'warm' || emotion === 'playful' || emotion === 'relieved') {
    return ELEVENLABS_VOICE_ALIASES.jessica!;
  }
  return ELEVENLABS_VOICE_ALIASES.julia!;
}

export function prepareElevenLabsMandarinText(rawText: string, voiceId: string): {
  readonly text: string;
  readonly languageCode?: string;
} {
  let text = rawText.trim();
  const isMandarin = CJK_TEST_RE.test(text);
  if (!isMandarin) {
    return { text };
  }
  if (text && !/[。！？!?…~”’」』）)\]]$/.test(text)) {
    text += /(?:吗|么|是不是|好不好|行不行|对不对|要不要|能不能)$/.test(text) ? '？' : '。';
  }
  if (NON_MANDARIN_VOICES.has(voiceId) && !text.slice(0, 40).toLowerCase().includes('mandarin')) {
    text = `[Standard Mandarin accent] ${text}`;
  }
  return { text, languageCode: 'zh' };
}

function estimateAudioDurationFromMp3Bytes(byteLength: number, kbps = 128): number | undefined {
  if (byteLength <= 512) return undefined;
  const seconds = (byteLength * 8) / (kbps * 1000);
  return Math.max(1, Math.min(30, Math.round(seconds)));
}

async function runBridgeScript(
  bridgeScript: string,
  text: string,
  voice: string,
  model: string,
  pythonBin: string,
): Promise<SynthesizedVoiceClip | undefined> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nb-speak-tts-'));
  try {
    const reqPath = path.join(tmpDir, 'request.json');
    const resPath = path.join(tmpDir, 'result.json');
    const outPath = path.join(tmpDir, 'voice.mp3');
    const payload = {
      action: 'submit',
      input: {
        model,
        request: {
          kind: 'tts',
          voice,
          format: 'mp3',
          text,
          options: {
            model,
          },
        },
      },
      output: outPath,
      resultFile: resPath,
    };
    fs.writeFileSync(reqPath, JSON.stringify(payload), 'utf8');
    await execFileAsync(pythonBin, [bridgeScript, reqPath], {
      timeout: 45_000,
      windowsHide: true,
    });
    if (!fs.existsSync(resPath)) return undefined;
    const outcome = JSON.parse(fs.readFileSync(resPath, 'utf8')) as {
      state?: string;
      artifacts?: Array<{ path?: string; mime?: string }>;
    };
    const artifact = outcome.artifacts?.[0];
    if (outcome.state !== 'complete' || !artifact?.path || !fs.existsSync(artifact.path)) {
      return undefined;
    }
    const audioBytes = fs.readFileSync(artifact.path);
    if (audioBytes.byteLength <= 256) return undefined;
    const mime = artifact.mime || (artifact.path.endsWith('.ogg') ? 'audio/ogg' : 'audio/mpeg');
    const kbps = artifact.path.endsWith('.ogg') ? 128 : 192;
    return {
      audioSrc: `data:${mime};base64,${audioBytes.toString('base64')}`,
      durationSeconds: estimateAudioDurationFromMp3Bytes(audioBytes.byteLength, kbps),
    };
  } catch {
    return undefined;
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore temp cleanup failure
    }
  }
}

export function resolveOpenAiSpeechEndpoint(baseUrl: string): string {
  const clean = baseUrl.trim().replace(/\/+$/, '');
  if (!clean) return '';
  if (clean.endsWith('/audio/speech')) return clean;
  if (clean.endsWith('/v1')) return `${clean}/audio/speech`;
  return `${clean}/v1/audio/speech`;
}

async function runOpenAiCompatibleSpeech(
  baseUrl: string,
  apiKey: string,
  text: string,
  rawVoice: string | undefined,
  rawModel: string | undefined,
  fetchImpl: FetchLike,
): Promise<SynthesizedVoiceClip | undefined> {
  try {
    const url = resolveOpenAiSpeechEndpoint(baseUrl);
    if (!url) return undefined;
    const model = rawModel && rawModel.toLowerCase() !== 'auto' ? rawModel : 'tts-1';
    const voice = rawVoice && rawVoice.toLowerCase() !== 'auto' ? rawVoice : 'alloy';
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };
    if (apiKey) {
      headers.authorization = `Bearer ${apiKey}`;
    }
    const resp = await fetchImpl(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        input: text,
        voice,
        response_format: 'mp3',
      }),
    });
    if (!resp.ok) return undefined;
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.byteLength <= 256) return undefined;
    return {
      audioSrc: `data:audio/mpeg;base64,${buf.toString('base64')}`,
      durationSeconds: estimateAudioDurationFromMp3Bytes(buf.byteLength, 128),
    };
  } catch {
    return undefined;
  }
}

async function runDirectElevenLabs(
  apiKey: string,
  text: string,
  emotion: TtsEmotionHint,
  rawVoice: string | undefined,
  model: string,
  fetchImpl: FetchLike,
): Promise<SynthesizedVoiceClip | undefined> {
  try {
    const voiceId = resolveElevenLabsVoiceId(rawVoice, emotion);
    const prepared = prepareElevenLabsMandarinText(text, voiceId);
    const isMandarin = prepared.languageCode === 'zh';
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`;
    const body: Record<string, unknown> = {
      text: prepared.text,
      model_id: model,
      voice_settings: {
        stability: isMandarin ? 0.48 : 0.42,
        similarity_boost: 0.78,
      },
    };
    if (prepared.languageCode) {
      body.language_code = prepared.languageCode;
    }
    const resp = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) return undefined;
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.byteLength <= 256) return undefined;
    return {
      audioSrc: `data:audio/mpeg;base64,${buf.toString('base64')}`,
      durationSeconds: estimateAudioDurationFromMp3Bytes(buf.byteLength, 128),
    };
  } catch {
    return undefined;
  }
}

export function createVoiceNoteSynthesizer(config: TtsSynthesisConfig = {}): VoiceNoteSynthesizer {
  const env = config.env ?? process.env;
  const fetchImpl = config.fetchImpl ?? fetch;

  return async ({ text, emotion }) => {
    const cleanText = text.trim();
    if (!cleanText) return undefined;

    const provider = (config.getProvider?.() || env.NB_SPEAK_TTS_PROVIDER || 'auto').trim().toLowerCase();
    if (provider === 'webspeech') {
      return undefined;
    }

    const rawModel = (config.getModel?.() || env.NB_SPEAK_TTS_MODEL || 'auto').trim();
    const rawVoice = (config.getVoice?.() || env.NB_SPEAK_TTS_VOICE || 'auto').trim();
    const bridgeScript = (config.getBridgeScript?.() || env.NB_SPEAK_TTS_BRIDGE || '').trim();
    const baseUrl = (config.getBaseUrl?.() || env.NB_SPEAK_TTS_BASE_URL || '').trim();
    const explicitKey = config.getApiKey ? await config.getApiKey() : '';

    const tryBridge = async () => {
      if (!bridgeScript || !fs.existsSync(bridgeScript)) return undefined;
      const bridgeModel = rawModel && rawModel.toLowerCase() !== 'auto' ? rawModel : 'default';
      const voiceForBridge =
        rawVoice && rawVoice.toLowerCase() !== 'auto'
          ? rawVoice
          : emotion === 'warm' || emotion === 'playful' || emotion === 'relieved'
            ? 'warm'
            : 'calm';
      const pythonBin = (env.NB_SPEAK_PYTHON || 'python').trim();
      return runBridgeScript(bridgeScript, cleanText, voiceForBridge, bridgeModel, pythonBin);
    };

    if (provider === 'bridge') {
      return tryBridge();
    }

    if (provider === 'openai') {
      const openaiKey = (explicitKey || env.NB_SPEAK_TTS_API_KEY || env.OPENAI_API_KEY || '').trim();
      const targetBase = baseUrl || (openaiKey ? 'https://api.openai.com/v1' : '');
      if (!targetBase) return undefined;
      return runOpenAiCompatibleSpeech(targetBase, openaiKey, cleanText, rawVoice, rawModel, fetchImpl);
    }

    const elevenKey = (
      explicitKey ||
      env.ELEVENLABS_API_KEY ||
      env.ELEVEN_API_KEY ||
      env.XI_API_KEY ||
      ''
    ).trim();
    const elevenModel = rawModel && rawModel.toLowerCase() !== 'auto' ? rawModel : 'eleven_v4';

    if (provider === 'elevenlabs') {
      if (!elevenKey) return undefined;
      return runDirectElevenLabs(elevenKey, cleanText, emotion, rawVoice, elevenModel, fetchImpl);
    }

    const bridgeClip = await tryBridge();
    if (bridgeClip) return bridgeClip;

    if (baseUrl) {
      const openaiKey = (explicitKey || env.NB_SPEAK_TTS_API_KEY || env.OPENAI_API_KEY || '').trim();
      const openaiClip = await runOpenAiCompatibleSpeech(baseUrl, openaiKey, cleanText, rawVoice, rawModel, fetchImpl);
      if (openaiClip) return openaiClip;
    }

    if (!elevenKey) {
      return undefined;
    }

    return runDirectElevenLabs(elevenKey, cleanText, emotion, rawVoice, elevenModel, fetchImpl);
  };
}
