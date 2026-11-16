export const BUDGET_LIMIT = 1.15;
export const SLIDER_MIN = 0.0;
export const SLIDER_MAX = 1.25;
export const SLIDER_STEP = 0.05;

export type StyleWeightTuple = readonly [number, number, number, number, number];

export type DshPersonaPresetId =
  | 'custom'
  | 'neutral_peer'
  | 'sharp_lead'
  | 'warm_companion'
  | 'calm_sre';

export interface StyleSliderConfig {
  readonly preset?: DshPersonaPresetId;
  readonly clarity?: number;
  readonly warmth?: number;
  readonly sharp_wit?: number;
  readonly calm_grounding?: number;
  readonly concise_cadence?: number;
}

export const STYLE_PRESETS: Readonly<
  Record<Exclude<DshPersonaPresetId, 'custom'>, { readonly label: string; readonly values: StyleWeightTuple }>
> = {
  neutral_peer: { label: 'Neutral Engineer Peer', values: [1.0, 0.2, 0.1, 0.2, 0.3] },
  sharp_lead: { label: 'Sharp Tech Lead', values: [1.0, 0.0, 0.65, 0.25, 0.25] },
  warm_companion: { label: 'Warm Companion', values: [1.0, 0.75, 0.2, 0.15, 0.05] },
  calm_sre: { label: 'Calm SRE Relay', values: [1.0, 0.05, 0.0, 0.65, 0.45] },
};

export const MODEL_PRESET_OVERRIDES: Readonly<Record<string, StyleWeightTuple>> = {
  'nb-speak:neutral': STYLE_PRESETS.neutral_peer.values,
  'nb-speak:sharp': STYLE_PRESETS.sharp_lead.values,
  'nb-speak:warm': STYLE_PRESETS.warm_companion.values,
  'nb-speak:sre': STYLE_PRESETS.calm_sre.values,
  'nb-speak-voice-4b:neutral': STYLE_PRESETS.neutral_peer.values,
  'nb-speak-voice-4b:sharp': STYLE_PRESETS.sharp_lead.values,
  'nb-speak-voice-4b:warm': STYLE_PRESETS.warm_companion.values,
  'nb-speak-voice-4b:sre': STYLE_PRESETS.calm_sre.values,
};

export const ADVERTISED_DSH_MODELS = [
  {
    id: 'nb-speak:neutral',
    name: 'nb-speak · Neutral Engineer Peer',
    description: 'Mode A (skill) or Mode B (voice-model) equal-footing teammate voice',
  },
  {
    id: 'nb-speak:sharp',
    name: 'nb-speak · Sharp Tech Lead',
    description: 'Crisp ship/hold verdicts + dry understatement + artifact offload',
  },
  {
    id: 'nb-speak:warm',
    name: 'nb-speak · Warm Companion',
    description: 'Natural 1-on-1 spoken rhythm without stage brackets or concierge clichés',
  },
  {
    id: 'nb-speak:sre',
    name: 'nb-speak · Calm SRE Relay',
    description: 'Zero-lecture live canary & incident telemetry beats',
  },
  {
    id: 'nb-speak-voice-4b',
    name: 'nb-speak · Split-Phase / 4B Voice Translator',
    description: 'Continuous 5-axis LoRA / style-vector sidecar endpoint',
  },
] as const;

export function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function clampSlider(value: unknown, fallback = 0): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return round3(Math.min(SLIDER_MAX, Math.max(SLIDER_MIN, num)));
}

export interface EffectiveWeightsResult {
  readonly raw: StyleWeightTuple;
  readonly weights: StyleWeightTuple;
  readonly filterSum: number;
  readonly budgetLimit: number;
  readonly isClamped: boolean;
  readonly scale: number;
}

export function computeEffectiveWeights(rawSliders: readonly number[]): EffectiveWeightsResult {
  const s0 = clampSlider(rawSliders[0], 1.0);
  const s1 = clampSlider(rawSliders[1], 0.0);
  const s2 = clampSlider(rawSliders[2], 0.0);
  const s3 = clampSlider(rawSliders[3], 0.0);
  const s4 = clampSlider(rawSliders[4], 0.0);
  const raw: StyleWeightTuple = [s0, s1, s2, s3, s4];
  const filterSum = s1 + s2 + s3 + s4;
  const scale = filterSum > BUDGET_LIMIT ? BUDGET_LIMIT / Math.max(filterSum, 1e-6) : 1.0;

  const weights: StyleWeightTuple = [
    round3(s0),
    round3(s1 * scale),
    round3(s2 * scale),
    round3(s3 * scale),
    round3(s4 * scale),
  ];

  return {
    raw,
    weights,
    filterSum: round3(filterSum),
    budgetLimit: BUDGET_LIMIT,
    isClamped: filterSum > BUDGET_LIMIT + 1e-9,
    scale: round3(scale),
  };
}

export function resolveRawSlidersFromConfig(cfg: StyleSliderConfig): StyleWeightTuple {
  if (cfg.preset && cfg.preset !== 'custom' && cfg.preset in STYLE_PRESETS) {
    return STYLE_PRESETS[cfg.preset].values;
  }
  return [
    clampSlider(cfg.clarity, 1.0),
    clampSlider(cfg.warmth, 0.2),
    clampSlider(cfg.sharp_wit, 0.1),
    clampSlider(cfg.calm_grounding, 0.2),
    clampSlider(cfg.concise_cadence, 0.3),
  ];
}

export function formatVoiceModelTag(weights: StyleWeightTuple, baseModel = 'nb-speak-voice-v1'): string {
  const cleanBase = baseModel.split('|')[0]?.split(':')[0]?.trim() || 'nb-speak-voice-v1';
  return `${cleanBase}|${weights.map((w) => Number(w).toFixed(3)).join(',')}`;
}

export type DshRuntimeMode = 'native' | 'skill' | 'voice-model';

export function resolveUpstreamModelSpec(
  requestedModel: string | undefined,
  sliderConfig: StyleSliderConfig,
  runtimeMode: DshRuntimeMode = 'native',
  defaultCloudModel = 'deepseek-chat',
  defaultVoiceModel = 'nb-speak-voice-v1',
): { readonly upstreamModel: string; readonly weights: StyleWeightTuple; readonly personaId: Exclude<DshPersonaPresetId, 'custom'> } {
  const trimmed = (requestedModel ?? '').trim();

  let personaId: Exclude<DshPersonaPresetId, 'custom'> =
    sliderConfig.preset && sliderConfig.preset !== 'custom' ? sliderConfig.preset : 'neutral_peer';
  if (trimmed.endsWith(':sharp')) personaId = 'sharp_lead';
  else if (trimmed.endsWith(':warm')) personaId = 'warm_companion';
  else if (trimmed.endsWith(':sre')) personaId = 'calm_sre';
  else if (trimmed.endsWith(':neutral')) personaId = 'neutral_peer';

  if (trimmed.includes('|')) {
    const [prefix, spec] = trimmed.split('|', 2);
    const parts = (spec ?? '').split(',').map((p) => Number(p.trim()));
    if (parts.length === 5 && parts.every((n) => Number.isFinite(n) && n >= 0 && n <= 2.0)) {
      const tuple: StyleWeightTuple = [
        round3(parts[0]!),
        round3(parts[1]!),
        round3(parts[2]!),
        round3(parts[3]!),
        round3(parts[4]!),
      ];
      return {
        upstreamModel: runtimeMode === 'voice-model' ? formatVoiceModelTag(tuple, prefix || defaultVoiceModel) : (prefix || defaultCloudModel),
        weights: tuple,
        personaId,
      };
    }
  }

  const presetOverride = MODEL_PRESET_OVERRIDES[trimmed];
  const raw = presetOverride ?? resolveRawSlidersFromConfig(sliderConfig);
  const { weights } = computeEffectiveWeights(raw);

  if (runtimeMode === 'voice-model' || trimmed.startsWith('nb-speak-voice')) {
    const basePrefix = trimmed.startsWith('nb-speak-voice') ? trimmed.split(':')[0]! : defaultVoiceModel;
    return {
      upstreamModel: formatVoiceModelTag(weights, basePrefix),
      weights,
      personaId,
    };
  }

  const cloudModel =
    !trimmed || trimmed.startsWith('nb-speak:') || trimmed === 'nb-speak'
      ? defaultCloudModel
      : trimmed;

  return {
    upstreamModel: cloudModel,
    weights,
    personaId,
  };
}

export type BubbleJoinMode = 'paragraph' | 'newline';

export class BubbleStreamFormatter {
  private readonly mode: BubbleJoinMode;
  private inFence = false;
  private currentLine = '';
  private prevEndedWithBlank = false;

  constructor(mode: BubbleJoinMode = 'paragraph') {
    this.mode = mode;
  }

  push(chunk: string): string {
    if (!chunk || this.mode === 'newline') return chunk;
    const normalized = chunk.replace(/\r\n/g, '\n');
    let out = '';

    for (let i = 0; i < normalized.length; i += 1) {
      const ch = normalized[i]!;
      if (ch !== '\n') {
        this.currentLine += ch;
        this.prevEndedWithBlank = false;
        out += ch;
        continue;
      }

      const trimmedLine = this.currentLine.trim();
      const isFenceDelimiter = trimmedLine.startsWith('```');
      if (!this.inFence && isFenceDelimiter) {
        this.inFence = true;
        out += '\n';
      } else if (this.inFence) {
        if (/^```\s*$/.test(trimmedLine)) {
          this.inFence = false;
          out += '\n\n';
          this.prevEndedWithBlank = true;
        } else {
          out += '\n';
        }
      } else if (this.prevEndedWithBlank || trimmedLine.length === 0) {
        if (!this.prevEndedWithBlank) {
          out += '\n';
          this.prevEndedWithBlank = true;
        }
      } else {
        out += '\n\n';
        this.prevEndedWithBlank = true;
      }
      this.currentLine = '';
    }

    return out;
  }
}

export function formatCompleteBubbleText(text: string, mode: BubbleJoinMode = 'paragraph'): string {
  if (!text || mode === 'newline') return text;
  const fmt = new BubbleStreamFormatter(mode);
  return fmt.push(text).replace(/\n{3,}/g, '\n\n').trimEnd();
}
