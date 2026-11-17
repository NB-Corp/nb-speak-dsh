import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { startDshOpenAiBridge, type RunningBridgeServer } from './http-bridge.ts';
import {
  parseEnvBoolean,
  registerSpeakToolsAndPrompt,
  type DshSystemPromptServiceLike,
  type DshToolsServiceLike,
} from './dsh-tools.ts';
import {
  createVoiceNoteSynthesizer,
  DEFAULT_TTS_KEY_REFS,
  TTS_PROVIDER_IDS,
  type TtsProviderId,
  type VoiceNoteSynthesizer,
} from './tts.ts';
import type { FetchLike, ResolvedUpstreamConnection } from './upstream.ts';
import {
  resolveUpstreamModelSpec,
  SLIDER_MAX,
  SLIDER_MIN,
  SLIDER_STEP,
  type BubbleJoinMode,
  type DshPersonaPresetId,
  type DshRuntimeMode,
  type StyleSliderConfig,
} from './weights.ts';

export interface VolatileLike<T> {
  get(): T;
}

export interface DshCredentialsLike {
  resolve(ref: string): Promise<{ readonly value: string; readonly source?: string } | undefined>;
}

export interface CordisContextLike {
  readonly credentials?: DshCredentialsLike;
  readonly tools?: DshToolsServiceLike;
  readonly systemPrompt?: DshSystemPromptServiceLike;
  provide(name: string, value: unknown): void;
  effect(factory: () => () => Promise<void> | void): void;
}

export const name = 'nb-speak';
export const inject = {
  credentials: { required: false },
  tools: { required: false },
  systemPrompt: { required: false },
};

export interface Config {
  readonly runtimeMode: VolatileLike<DshRuntimeMode> | DshRuntimeMode;
  readonly preset: VolatileLike<DshPersonaPresetId> | DshPersonaPresetId;
  readonly clarity: VolatileLike<number> | number;
  readonly warmth: VolatileLike<number> | number;
  readonly sharp_wit: VolatileLike<number> | number;
  readonly calm_grounding: VolatileLike<number> | number;
  readonly concise_cadence: VolatileLike<number> | number;
  readonly registerGlobalTools: boolean;
  readonly cloudBaseUrl: VolatileLike<string> | string;
  readonly defaultCloudModel: VolatileLike<string> | string;
  readonly voiceModelBaseUrl: VolatileLike<string> | string;
  readonly defaultVoiceModel: VolatileLike<string> | string;
  readonly apiKeyRef: VolatileLike<string> | string;
  readonly customSoul: VolatileLike<string> | string;
  readonly enableVoiceNotes: VolatileLike<boolean> | boolean;
  readonly ttsProvider: VolatileLike<TtsProviderId> | TtsProviderId;
  readonly ttsBaseUrl: VolatileLike<string> | string;
  readonly ttsApiKeyRef: VolatileLike<string> | string;
  readonly ttsVoice: VolatileLike<string> | string;
  readonly ttsModel: VolatileLike<string> | string;
  readonly ttsBridgeScript: VolatileLike<string> | string;
  readonly bubbleJoinMode: VolatileLike<BubbleJoinMode> | BubbleJoinMode;
  readonly bridgeEnabled: boolean;
  readonly bridgeHost: string;
  readonly bridgePort: number;
}

async function importSchemasteryModule(): Promise<{ default: any } | undefined> {
  try {
    return (await import('@deepseek-ai/schemastery')) as { default: any };
  } catch {
    const anchors = [process.argv[1], path.join(process.cwd(), 'package.json')].filter(
      (item): item is string => typeof item === 'string' && item.length > 0,
    );
    for (const anchor of anchors) {
      try {
        const req = createRequire(path.resolve(anchor));
        const resolved = req.resolve('@deepseek-ai/schemastery');
        return (await import(pathToFileURL(resolved).href)) as { default: any };
      } catch {
        // Continue trying next resolution anchor
      }
    }
    return undefined;
  }
}

/**
 * Native Schemastery config descriptor resolved from the hosting DSH installation
 * (including when `@nb-corp/nb-speak-dsh` is linked from a zero-dependency checkout),
 * while safely omitting schema validation in standalone Node unit-test runs.
 */
async function buildSchemaIfAvailable(): Promise<unknown> {
  const mod = await importSchemasteryModule();
  if (!mod?.default) return undefined;
  const z = mod.default;
  const slider = (def: number, desc: string) =>
    z.number().min(SLIDER_MIN).max(SLIDER_MAX).step(SLIDER_STEP).default(def).description(desc).volatile();
  return z.object({
    runtimeMode: z
      .union(['native', 'skill', 'voice-model'] as const)
      .default('native')
      .description(
        'native: first-class DSH send_bubble + send_artifact tools & WebUI bubbles on any DSH provider; skill: OpenAI bridge Mode A; voice-model: 4B sidecar Mode B',
      )
      .volatile(),
    preset: z
      .union(['neutral_peer', 'sharp_lead', 'warm_companion', 'calm_sre', 'custom'] as const)
      .default('neutral_peer')
      .description('Persona preset (select custom to blend the 5 continuous style sliders below)')
      .volatile(),
    clarity: slider(1.0, 'Axis 0: Direct factual clarity (w0)'),
    warmth: slider(0.2, 'Axis 1: Conversational warmth (w1)'),
    sharp_wit: slider(0.1, 'Axis 2: Candid understatement & dry wit (w2)'),
    calm_grounding: slider(0.2, 'Axis 3: Calm incident grounding (w3)'),
    concise_cadence: slider(0.3, 'Axis 4: Mobile thumb-typed brevity bias (w4)'),
    registerGlobalTools: z
      .boolean()
      .default(true)
      .description('Register send_bubble + send_artifact across all DSH agent presets (including Standard mode)'),
    cloudBaseUrl: z.string().default('https://api.deepseek.com/v1').description('Bridge Mode A upstream OpenAI-compatible URL').volatile(),
    defaultCloudModel: z.string().default('deepseek-chat').description('Bridge Mode A upstream model ID').volatile(),
    voiceModelBaseUrl: z.string().default('http://127.0.0.1:18088/v1').description('Bridge Mode B Split-Phase / 4B voice-model URL').volatile(),
    defaultVoiceModel: z.string().default('nb-speak-voice-v1').description('Bridge Mode B base model prefix').volatile(),
    apiKeyRef: z.string().default('NB_SPEAK_API_KEY').description('Bridge upstream credential env/store key').volatile(),
    customSoul: z.string().default('').description('Optional custom SOUL.md / persona prompt override').volatile(),
    enableVoiceNotes: z
      .boolean()
      .default(false)
      .description('Enable optional complementary voice-note capsule on the final bubble (default: false — text bubbles & artifact cards only)')
      .volatile(),
    ttsProvider: z
      .union(TTS_PROVIDER_IDS)
      .default('auto')
      .description('Optional TTS provider when enableVoiceNotes is true (auto | openai | bridge | webspeech | custom)')
      .volatile(),
    ttsBaseUrl: z
      .string()
      .default('')
      .description('Optional OpenAI-compatible /v1/audio/speech base URL when enableVoiceNotes is true (or NB_SPEAK_TTS_BASE_URL)')
      .volatile(),
    ttsApiKeyRef: z
      .string()
      .default('NB_SPEAK_TTS_API_KEY')
      .description('Optional TTS API credential ref/env when enableVoiceNotes is true (falls back to Web Speech when unset)')
      .volatile(),
    ttsVoice: z
      .string()
      .default('auto')
      .description('Optional TTS voice alias or ID when enableVoiceNotes is true')
      .volatile(),
    ttsModel: z.string().default('auto').description('Optional TTS model ID (or NB_SPEAK_TTS_MODEL)').volatile(),
    ttsBridgeScript: z
      .string()
      .default('')
      .description('Optional local JSON TTS bridge script path (or set NB_SPEAK_TTS_BRIDGE)')
      .volatile(),
    bubbleJoinMode: z.union(['paragraph', 'newline'] as const).default('paragraph').volatile(),
    bridgeEnabled: z.boolean().default(false),
    bridgeHost: z.string().default('127.0.0.1'),
    bridgePort: z.number().min(0).max(65535).default(18091),
  });
}

export const Config = await buildSchemaIfAvailable();

function readVal<T>(field: T | VolatileLike<T> | undefined, fallback: T): T {
  if (field !== null && (typeof field === 'object' || typeof field === 'function') && 'get' in (field as object)) {
    const val = (field as VolatileLike<T>).get();
    return (val === undefined ? fallback : val) as T;
  }
  return (field as T | undefined) ?? fallback;
}

async function resolveCredentialValue(
  credentials: DshCredentialsLike | undefined,
  env: Readonly<Record<string, string | undefined>>,
  candidates: readonly string[],
): Promise<string> {
  const uniqueRefs = [...new Set(candidates.map((c) => c.trim()).filter(Boolean))];
  if (credentials && typeof credentials.resolve === 'function') {
    for (const ref of uniqueRefs) {
      try {
        const entry = await credentials.resolve(ref);
        if (entry?.value && entry.value.trim()) return entry.value.trim();
      } catch {
        // Ignore invalid ref format and try next candidate
      }
    }
  }
  for (const ref of uniqueRefs) {
    const val = env[ref];
    if (val && val.trim()) return val.trim();
  }
  return '';
}

export async function apply(
  ctx: CordisContextLike,
  config: Partial<Config> = {},
  overrides: { readonly fetchImpl?: FetchLike; readonly env?: Readonly<Record<string, string | undefined>> } = {},
): Promise<void> {
  const env = overrides.env ?? process.env;

  const getSliderConfig = (): StyleSliderConfig => ({
    preset: readVal(config.preset, 'neutral_peer'),
    clarity: readVal(config.clarity, 1.0),
    warmth: readVal(config.warmth, 0.2),
    sharp_wit: readVal(config.sharp_wit, 0.1),
    calm_grounding: readVal(config.calm_grounding, 0.2),
    concise_cadence: readVal(config.concise_cadence, 0.3),
  });

  const getCustomSoul = (): string => readVal(config.customSoul, '');

  const getUpstreamConnection = async (): Promise<ResolvedUpstreamConnection> => {
    const keyName = readVal(config.apiKeyRef, 'NB_SPEAK_API_KEY');
    const resolvedKey = await resolveCredentialValue(ctx.credentials, env, [
      keyName,
      'NB_SPEAK_API_KEY',
      'AXON_API_KEY',
      'AXON_MESSAGE_API_KEY',
      'DEEPSEEK_API_KEY',
      'OPENAI_API_KEY',
    ]);
    const voiceKey = await resolveCredentialValue(ctx.credentials, env, ['NB_SPEAK_VOICE_API_KEY']);
    return {
      mode: readVal(config.runtimeMode, 'native'),
      cloudBaseUrl: readVal(config.cloudBaseUrl, env.NB_SPEAK_UPSTREAM_URL ?? 'https://api.deepseek.com/v1'),
      cloudApiKey: resolvedKey,
      defaultCloudModel: readVal(config.defaultCloudModel, env.NB_SPEAK_MODEL ?? 'deepseek-chat'),
      voiceModelBaseUrl: readVal(config.voiceModelBaseUrl, env.NB_SPEAK_VOICE_URL ?? 'http://127.0.0.1:18088/v1'),
      voiceModelApiKey: voiceKey || resolvedKey,
      defaultVoiceModel: readVal(config.defaultVoiceModel, 'nb-speak-voice-v1'),
    };
  };

  const isVoiceNotesEnabled = (): boolean =>
    readVal(config.enableVoiceNotes, parseEnvBoolean(env.NB_SPEAK_VOICE_NOTES));

  const synthesizeVoiceNote = createVoiceNoteSynthesizer({
    getProvider: () => readVal(config.ttsProvider, (env.NB_SPEAK_TTS_PROVIDER as TtsProviderId | undefined) ?? 'auto'),
    getBaseUrl: () => readVal(config.ttsBaseUrl, env.NB_SPEAK_TTS_BASE_URL ?? ''),
    getBridgeScript: () => readVal(config.ttsBridgeScript, env.NB_SPEAK_TTS_BRIDGE ?? ''),
    getVoice: () => readVal(config.ttsVoice, env.NB_SPEAK_TTS_VOICE ?? 'auto'),
    getModel: () => readVal(config.ttsModel, env.NB_SPEAK_TTS_MODEL ?? 'auto'),
    getApiKey: () =>
      resolveCredentialValue(ctx.credentials, env, [
        readVal(config.ttsApiKeyRef, 'NB_SPEAK_TTS_API_KEY'),
        ...DEFAULT_TTS_KEY_REFS,
      ]),
    env,
    fetchImpl: overrides.fetchImpl,
  });

  let disposeNativeTools: (() => void) | undefined;
  const shouldRegisterGlobal = config.registerGlobalTools ?? true;
  if (shouldRegisterGlobal && ctx.tools && ctx.systemPrompt && readVal(config.runtimeMode, 'native') === 'native') {
    disposeNativeTools = registerSpeakToolsAndPrompt(ctx.tools, ctx.systemPrompt, {
      getSliderConfig,
      getCustomSoul,
      synthesizeVoiceNote,
      enableVoiceNotes: isVoiceNotesEnabled,
    });
  }

  let bridgeServer: RunningBridgeServer | undefined;
  const currentMode = readVal(config.runtimeMode, 'native');
  const shouldStartBridge = config.bridgeEnabled ?? currentMode !== 'native';
  if (shouldStartBridge) {
    bridgeServer = await startDshOpenAiBridge({
      host: config.bridgeHost ?? '127.0.0.1',
      port: config.bridgePort ?? 18091,
      state: {
        getSliderConfig,
        getUpstreamConnection,
        getBubbleJoinMode: () => readVal(config.bubbleJoinMode, 'paragraph'),
        getCustomSoul,
        getEnableVoiceNotes: isVoiceNotesEnabled,
        fetchImpl: overrides.fetchImpl,
      },
    });
  }

  ctx.provide('nbSpeak', {
    ...(bridgeServer ? { bridgeBaseUrl: bridgeServer.baseUrl, bridgePort: bridgeServer.port } : {}),
    getSliderConfig,
    getCustomSoul,
    isVoiceNotesEnabled,
    synthesizeVoiceNote,
    currentSpec: () =>
      resolveUpstreamModelSpec(
        undefined,
        getSliderConfig(),
        readVal(config.runtimeMode, 'native'),
        readVal(config.defaultCloudModel, 'deepseek-chat'),
        readVal(config.defaultVoiceModel, 'nb-speak-voice-v1'),
      ),
  });

  ctx.effect(() => async () => {
    if (disposeNativeTools) {
      disposeNativeTools();
      disposeNativeTools = undefined;
    }
    if (bridgeServer) {
      await bridgeServer.close();
      bridgeServer = undefined;
    }
  });
}
