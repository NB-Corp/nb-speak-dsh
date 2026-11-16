import {
  createVoiceNoteSynthesizer,
  type VoiceNoteSynthesizer,
} from './tts.ts';
import {
  computeEffectiveWeights,
  resolveRawSlidersFromConfig,
  type DshPersonaPresetId,
  type StyleSliderConfig,
  type StyleWeightTuple,
} from './weights.ts';

export const SEND_BUBBLE_TOOL_NAME = 'send_bubble';
export const SEND_ARTIFACT_TOOL_NAME = 'send_artifact';
export const NB_SPEAK_PROMPT_SECTION = 'nb-speak:protocol';
export const NB_SPEAK_PROMPT_ORDER = 9200;

export type VoiceNoteEmotion = 'neutral' | 'warm' | 'calm' | 'dry' | 'relieved' | 'playful' | 'serious';

export interface VoiceNoteInput {
  readonly text: string;
  readonly emotion?: VoiceNoteEmotion;
}

export interface SendBubbleArgs {
  readonly bubbles: readonly string[];
  readonly voice_note?: VoiceNoteInput;
  readonly reply_to?: string;
  readonly end_turn?: boolean;
}

export interface DshToolRunContextLike {
  concludeTurn?(): void;
}

export interface BubbleScheduleStep {
  readonly index: number;
  readonly text: string;
  readonly typingDelayMs: number;
  readonly cumulativeMs: number;
}

export interface NormalizedVoiceNote {
  readonly text: string;
  readonly emotion: VoiceNoteEmotion;
  readonly durationSeconds: number;
  readonly audioSrc?: string;
}

export interface SendBubbleMeta {
  readonly kind: 'nb-speak/bubbles';
  readonly bubbles: readonly string[];
  readonly schedule: readonly BubbleScheduleStep[];
  readonly voiceNote?: NormalizedVoiceNote;
  readonly replyTo?: string;
}

export interface SendBubbleOutput {
  readonly delivered: boolean;
  readonly bubbleCount: number;
  readonly hasVoiceNote: boolean;
  readonly status: string;
  readonly audioSrc?: string;
  readonly audioDurationSeconds?: number;
}

export type ArtifactKind = 'code' | 'markdown' | 'diff' | 'table';

export interface SendArtifactArgs {
  readonly title: string;
  readonly kind: ArtifactKind;
  readonly language?: string;
  readonly content: string;
}

export interface SendArtifactMeta {
  readonly kind: 'nb-speak/artifact';
  readonly title: string;
  readonly artifactKind: ArtifactKind;
  readonly language?: string;
  readonly content: string;
  readonly lineCount: number;
}

export interface SendArtifactOutput {
  readonly delivered: boolean;
  readonly title: string;
  readonly kind: ArtifactKind;
  readonly lineCount: number;
  readonly status: string;
}

export interface DshToolsServiceLike {
  register(definition: Record<string, unknown>): () => void;
}

export interface DshSystemPromptServiceLike {
  section(entry: {
    readonly name: string;
    readonly order: number;
    readonly interpolate?: boolean;
    readonly text: string | ((ctx: unknown) => string);
  }): () => void;
}

const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g;
const EN_WORD_RE = /[A-Za-z0-9]+(?:'[A-Za-z0-9]+)?/g;
const VALID_EMOTIONS = new Set<VoiceNoteEmotion>([
  'neutral',
  'warm',
  'calm',
  'dry',
  'relieved',
  'playful',
  'serious',
]);
const VALID_ARTIFACT_KINDS = new Set<ArtifactKind>(['code', 'markdown', 'diff', 'table']);

const PERSONA_GUIDANCE: Readonly<Record<Exclude<DshPersonaPresetId, 'custom'>, string>> = {
  neutral_peer:
    'Default voice (when workspace AGENTS.md defines no specific character): equal-footing engineering teammate—concise, candid, relaxed, zero corporate servility or unsolicited lectures.',
  sharp_lead:
    'Default voice (when workspace AGENTS.md defines no specific character): sharp, candid tech lead—lead with the verdict or root cause, dry understatement, zero filler.',
  warm_companion:
    'Default voice (when workspace AGENTS.md defines no specific character): attentive everyday companion texting from a phone—genuine warmth, natural spoken cadence, zero robotic checklists.',
  calm_sre:
    'Default voice (when workspace AGENTS.md defines no specific character): calm on-call SRE peer—state root cause, live impact, and safe action in crisp beats and push SQL/commands to send_artifact.',
};

export function sanitizeSpokenBubble(raw: string): string {
  let s = String(raw ?? '')
    .trim()
    .replace(/^(?:Bubble|Beat|气泡)\s*[1-9]\s*[:：]\s*/i, '')
    .trim();
  if (!s) return '';
  const cjkCount = (s.match(CJK_RE) ?? []).length;
  const enCount = (s.replace(CJK_RE, ' ').match(EN_WORD_RE) ?? []).length;
  const hasInternalStop = /[。！？!?；;\n]/.test(s.slice(0, -1));
  if (!hasInternalStop) {
    if (s.endsWith('。') && cjkCount > 0 && cjkCount <= 28 && enCount <= 6) {
      s = s.slice(0, -1).trim();
    } else if (
      s.endsWith('.') &&
      !s.endsWith('..') &&
      !/\b(?:etc|e\.g|i\.e|vs|mr|mrs|ms|dr|st|a\.m|p\.m)\.$/i.test(s) &&
      cjkCount === 0 &&
      enCount > 0 &&
      enCount <= 16
    ) {
      s = s.slice(0, -1).trim();
    }
  }
  return s;
}

export function estimateVoiceNoteSeconds(text: string): number {
  const clean = text.trim();
  if (!clean) return 0;
  const cjkCount = (clean.match(CJK_RE) ?? []).length;
  const enCount = (clean.replace(CJK_RE, ' ').match(EN_WORD_RE) ?? []).length;
  const rawSeconds = cjkCount / 4.2 + enCount / 2.6 + 0.8;
  return Math.max(2, Math.min(25, Math.round(rawSeconds)));
}

export function buildBubbleSchedule(bubbles: readonly string[]): readonly BubbleScheduleStep[] {
  let cumulativeMs = 0;
  return bubbles.map((text, index) => {
    const typingDelayMs = index === 0 ? 0 : Math.min(1100, Math.max(220, 160 + text.length * 24));
    cumulativeMs += typingDelayMs;
    return { index, text, typingDelayMs, cumulativeMs };
  });
}

export function stripOuterFence(content: string): string {
  const trimmed = String(content ?? '').replace(/\r\n/g, '\n').trim();
  const match = /^```[A-Za-z0-9_+-]*\n([\s\S]*?)\n```$/.exec(trimmed);
  return match ? match[1]!.trimEnd() : trimmed;
}

function describeWeightBias(weights: StyleWeightTuple): string {
  const [, warmth, wit, calm, brevity] = weights;
  const notes: string[] = [];
  if (brevity >= 0.35) notes.push('favor 1-3 ultra-compact beats');
  if (warmth >= 0.45) notes.push('keep warm human care without syrupy clichés');
  if (wit >= 0.35) notes.push('allow dry, understated wit');
  if (calm >= 0.4) notes.push('maintain calm incident-response grounding');
  return notes.length > 0 ? `Style vector [${weights.join(', ')}]: ${notes.join('; ')}.` : `Style vector [${weights.join(', ')}].`;
}

export function buildNativeSpeakPromptSection(options: {
  readonly getSliderConfig: () => StyleSliderConfig;
  readonly getCustomSoul: () => string;
}): string {
  const sliderCfg = options.getSliderConfig();
  const customSoul = options.getCustomSoul().trim();
  const raw = resolveRawSlidersFromConfig(sliderCfg);
  const { weights } = computeEffectiveWeights(raw);
  const presetKey: Exclude<DshPersonaPresetId, 'custom'> =
    sliderCfg.preset && sliderCfg.preset !== 'custom' && sliderCfg.preset in PERSONA_GUIDANCE
      ? sliderCfg.preset
      : 'neutral_peer';

  const personaLine = customSoul ? `Custom voice directive: ${customSoul}` : PERSONA_GUIDANCE[presetKey];

  return [
    '# Human IM Delivery Protocol (`send_bubble` + `send_artifact`)',
    '',
    'You are connected to a real-time IM bubble UI inside DeepSeek Harness.',
    '1. **Work first, then finish with `send_bubble`**: Run all required workspace tools (`read`, `glob`, `grep`, `edit`, `write`, `pwsh`/`bash`, etc.) directly first. Keep intermediate `assistant.content` empty while running workspace tools.',
    '2. **Deliver every user-facing reply through a single `send_bubble` call at the end of the turn**:',
    '   - Pass `bubbles`: 1–4 short thumb-typed chat lines (4–28 CJK chars or 4–22 English words each).',
    '   - Omit trailing periods (`。` / `.`) on short single-clause lines.',
    '   - Never put `#` headers, bullet lists, Markdown tables, code fences, stage brackets (`（叹气）`, `*sighs*`), or decorative UI emojis inside `bubbles`.',
    '   - Optionally attach `voice_note: { text, emotion }` when a short mic-side spoken aside (15–38 CJK chars or 10–25 English words, ~4–9s; break every 2 short clauses with `。` or `？`, spell numbers naturally, zero `[giggles]` tags, complementing rather than repeating the text bubbles) adds genuine warmth or emphasis.',
    '   - Calling `send_bubble` automatically concludes your turn once all tool calls in that step finish—do not call `send_bubble` mid-turn while you still have workspace tools left to run.',
    '3. **Offload structured material to `send_artifact`**:',
    '   - Whenever sharing shell commands, runnable code, SQL queries, unified diffs, or Markdown comparison tables, call `send_artifact` alongside `send_bubble` in the same step.',
    '   - Keep `send_artifact.content` clean, minimal, and directly copy-runnable (no 40-line tutorial essays inside comments).',
    '4. **Subagent separation**: `send_bubble` is ONLY for the human user. If communicating with child subagents, continue using `send_message` with `agent_id`. If you are running inside a delegated subagent reporting to a parent agent, return concise plain text without calling `send_bubble`.',
    '5. **Persona harmony**: If the workspace `AGENTS.md` or user prompt specifies a character/relationship persona (such as a tsundere girlfriend or domain role), stay 100% in that character inside `send_bubble` while obeying all short-bubble rules above. ' +
      personaLine +
      ' ' +
      describeWeightBias(weights),
    '6. **Never write duplicate prose alongside `send_bubble`**: In the step where you call `send_bubble`, keep `assistant.content` empty—your bubbles and artifact cards render directly in the chat stream.',
  ].join('\n');
}

export function createSendBubbleToolDefinition(options: {
  readonly synthesizeVoiceNote?: VoiceNoteSynthesizer;
} = {}): Record<string, unknown> {
  const synthesizeVoiceNote = options.synthesizeVoiceNote ?? createVoiceNoteSynthesizer();
  return {
    name: SEND_BUBBLE_TOOL_NAME,
    description:
      'Render 1-4 short thumb-typed IM chat bubbles (and an optional playable voice_note pill) directly in the human user\'s chat UI and conclude the assistant turn. Call this ONCE at the end of your turn (alongside send_artifact if sharing code/SQL/diffs/tables) after all workspace reads/edits/tests are complete. Do NOT use for subagents (use send_message with agent_id for subagents).',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['bubbles'],
      properties: {
        bubbles: {
          type: 'array',
          description:
            'Ordered 1-4 short IM chat bubbles (4-28 CJK chars or 4-22 English words each). Omit trailing periods on single-clause lines; no Markdown headers, lists, tables, stage brackets, or code fences.',
          items: { type: 'string' },
        },
        voice_note: {
          type: 'object',
          additionalProperties: false,
          required: ['text'],
          description:
            'Optional playable voice-note pill shown beneath the text bubbles (4-10s spoken aside complementing—never verbatim repeating—the text bubbles).',
          properties: {
            text: {
              type: 'string',
              description: 'Natural spoken transcript for the voice note (spell out numbers naturally).',
            },
            emotion: {
              type: 'string',
              enum: ['neutral', 'warm', 'calm', 'dry', 'relieved', 'playful', 'serious'],
              description: 'Spoken tone label.',
            },
          },
        },
        reply_to: {
          type: 'string',
          description: 'Optional short quote or message anchor being replied to.',
        },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['delivered', 'bubbleCount', 'hasVoiceNote', 'status'],
        properties: {
          delivered: { type: 'boolean' },
          bubbleCount: { type: 'integer' },
          hasVoiceNote: { type: 'boolean' },
          status: { type: 'string' },
          audioSrc: { type: 'string' },
          audioDurationSeconds: { type: 'number' },
        },
      },
      render(_args: SendBubbleArgs, value: SendBubbleOutput) {
        return [
          {
            type: 'text',
            text: JSON.stringify({
              delivered: value.delivered,
              bubbleCount: value.bubbleCount,
              hasVoiceNote: value.hasVoiceNote,
              status: value.status,
            }),
          },
        ];
      },
      presentationMeta(args: SendBubbleArgs, value: SendBubbleOutput): SendBubbleMeta {
        const cleaned = (Array.isArray(args?.bubbles) ? args.bubbles : [])
          .map((item) => sanitizeSpokenBubble(item))
          .filter((item) => item.length > 0);
        const vnText = typeof args?.voice_note?.text === 'string' ? args.voice_note.text.trim() : '';
        const rawEmotion = args?.voice_note?.emotion;
        const emotion: VoiceNoteEmotion =
          rawEmotion && VALID_EMOTIONS.has(rawEmotion) ? rawEmotion : 'neutral';
        const audioSrc = typeof value?.audioSrc === 'string' && value.audioSrc.trim() ? value.audioSrc.trim() : undefined;
        const durationSeconds =
          typeof value?.audioDurationSeconds === 'number' && Number.isFinite(value.audioDurationSeconds) && value.audioDurationSeconds > 0
            ? Math.max(1, Math.round(value.audioDurationSeconds))
            : estimateVoiceNoteSeconds(vnText);
        const voiceNote: NormalizedVoiceNote | undefined = vnText
          ? {
              text: vnText,
              emotion,
              durationSeconds,
              ...(audioSrc ? { audioSrc } : {}),
            }
          : undefined;
        const replyTo = typeof args?.reply_to === 'string' && args.reply_to.trim() ? args.reply_to.trim() : undefined;
        return {
          kind: 'nb-speak/bubbles',
          bubbles: cleaned,
          schedule: buildBubbleSchedule(cleaned),
          ...(voiceNote ? { voiceNote } : {}),
          ...(replyTo ? { replyTo } : {}),
        };
      },
    },
    isConcurrencySafe: () => true,
    async execute(args: SendBubbleArgs, exec?: DshToolRunContextLike): Promise<SendBubbleOutput> {
      if (!Array.isArray(args?.bubbles)) {
        throw new Error('send_bubble requires a non-empty bubbles string array');
      }
      const cleaned = args.bubbles.map((item) => sanitizeSpokenBubble(item)).filter((item) => item.length > 0);
      if (cleaned.length === 0) {
        throw new Error('send_bubble requires at least 1 non-empty bubble string');
      }
      if (cleaned.length > 6) {
        throw new Error('send_bubble accepts at most 6 bubbles per turn; offload dense material to send_artifact');
      }
      const vnText = typeof args.voice_note?.text === 'string' ? args.voice_note.text.trim() : '';
      const rawEmotion = args.voice_note?.emotion;
      const emotion: VoiceNoteEmotion =
        rawEmotion && VALID_EMOTIONS.has(rawEmotion) ? rawEmotion : 'neutral';
      const synthesized = vnText
        ? await synthesizeVoiceNote({ text: vnText, emotion })
        : undefined;
      const concludes = args.end_turn !== false;
      if (concludes && exec && typeof exec.concludeTurn === 'function') {
        exec.concludeTurn();
      }
      return {
        delivered: true,
        bubbleCount: cleaned.length,
        hasVoiceNote: vnText.length > 0,
        status: concludes
          ? 'BUBBLES_RENDERED_AND_TURN_CONCLUDED'
          : 'PROGRESS_BUBBLES_RENDERED — Continue running your remaining workspace tools, then call send_bubble with end_turn: true for the final reply.',
        ...(synthesized?.audioSrc ? { audioSrc: synthesized.audioSrc } : {}),
        ...(typeof synthesized?.durationSeconds === 'number' ? { audioDurationSeconds: synthesized.durationSeconds } : {}),
      };
    },
  };
}

export function createSendArtifactToolDefinition(): Record<string, unknown> {
  return {
    name: SEND_ARTIFACT_TOOL_NAME,
    description:
      'Render an interactive copyable artifact card (code, shell script, SQL query, unified diff, or Markdown table) directly in the human user\'s chat UI outside narrow text bubbles. Pair with send_bubble in the same turn, then finish your turn with empty text.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['title', 'kind', 'content'],
      properties: {
        title: {
          type: 'string',
          description: 'Concise filename or card title (e.g. "orders-keyset.sql", "ttl_lru.py", "triage-sla-fix.diff").',
        },
        kind: {
          type: 'string',
          enum: ['code', 'markdown', 'diff', 'table'],
          description: 'Artifact card presentation kind.',
        },
        language: {
          type: 'string',
          description: 'Syntax/language badge when kind is code or diff (e.g. "sql", "python", "powershell", "ts", "diff").',
        },
        content: {
          type: 'string',
          description: 'Clean, directly runnable code, command, SQL query, unified diff, or GFM pipe table.',
        },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['delivered', 'title', 'kind', 'lineCount', 'status'],
        properties: {
          delivered: { type: 'boolean' },
          title: { type: 'string' },
          kind: { type: 'string', enum: ['code', 'markdown', 'diff', 'table'] },
          lineCount: { type: 'integer' },
          status: { type: 'string' },
        },
      },
      render(_args: SendArtifactArgs, value: SendArtifactOutput) {
        return [
          {
            type: 'text',
            text: JSON.stringify(value),
          },
        ];
      },
      presentationMeta(args: SendArtifactArgs, _value: SendArtifactOutput): SendArtifactMeta {
        const cleanBody = stripOuterFence(args?.content ?? '');
        const kind: ArtifactKind = VALID_ARTIFACT_KINDS.has(args?.kind) ? args.kind : 'code';
        const language = typeof args?.language === 'string' && args.language.trim() ? args.language.trim() : undefined;
        return {
          kind: 'nb-speak/artifact',
          title: String(args?.title ?? 'artifact').trim() || 'artifact',
          artifactKind: kind,
          ...(language ? { language } : {}),
          content: cleanBody,
          lineCount: cleanBody ? cleanBody.split('\n').length : 0,
        };
      },
    },
    isConcurrencySafe: () => true,
    async execute(args: SendArtifactArgs): Promise<SendArtifactOutput> {
      const title = String(args?.title ?? '').trim();
      if (!title) throw new Error('send_artifact requires a non-empty title');
      const kind: ArtifactKind = VALID_ARTIFACT_KINDS.has(args?.kind) ? args.kind : 'code';
      const cleanBody = stripOuterFence(args?.content ?? '');
      if (!cleanBody) throw new Error('send_artifact requires non-empty content');
      const lineCount = cleanBody.split('\n').length;
      return {
        delivered: true,
        title,
        kind,
        lineCount,
        status:
          'ARTIFACT_CARD_RENDERED_IN_UI — Pair with send_bubble if you have not spoken yet; otherwise end your turn immediately with empty text ("").',
      };
    },
  };
}

export function registerSpeakToolsAndPrompt(
  tools: DshToolsServiceLike,
  systemPrompt: DshSystemPromptServiceLike,
  options: {
    readonly getSliderConfig: () => StyleSliderConfig;
    readonly getCustomSoul: () => string;
    readonly synthesizeVoiceNote?: VoiceNoteSynthesizer;
  },
): () => void {
  const disposeBubble = tools.register(
    createSendBubbleToolDefinition({ synthesizeVoiceNote: options.synthesizeVoiceNote }),
  );
  const disposeArtifact = tools.register(createSendArtifactToolDefinition());
  const disposePrompt = systemPrompt.section({
    name: NB_SPEAK_PROMPT_SECTION,
    order: NB_SPEAK_PROMPT_ORDER,
    interpolate: false,
    text: () => buildNativeSpeakPromptSection(options),
  });
  return () => {
    disposePrompt();
    disposeArtifact();
    disposeBubble();
  };
}
