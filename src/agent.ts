import {
  parseEnvBoolean,
  registerSpeakToolsAndPrompt,
  type DshSystemPromptServiceLike,
  type DshToolsServiceLike,
} from './dsh-tools.ts';
import { createVoiceNoteSynthesizer, type VoiceNoteSynthesizer } from './tts.ts';
import type { StyleSliderConfig } from './weights.ts';

export interface NbSpeakHostServiceLike {
  getSliderConfig(): StyleSliderConfig;
  getCustomSoul(): string;
  isVoiceNotesEnabled?(): boolean;
  readonly synthesizeVoiceNote?: VoiceNoteSynthesizer;
}

export interface AgentContextLike {
  readonly tools: DshToolsServiceLike;
  readonly systemPrompt: DshSystemPromptServiceLike;
  readonly nbSpeak?: NbSpeakHostServiceLike;
  effect(factory: () => () => void): void;
}

export const name = 'nb-speak-agent';
export const inject = {
  tools: { required: true },
  systemPrompt: { required: true },
  nbSpeak: { required: false },
};

export function apply(ctx: AgentContextLike): void {
  const fallbackSynthesizer = createVoiceNoteSynthesizer();
  ctx.effect(() =>
    registerSpeakToolsAndPrompt(ctx.tools, ctx.systemPrompt, {
      getSliderConfig: () => ctx.nbSpeak?.getSliderConfig() ?? { preset: 'neutral_peer' },
      getCustomSoul: () => ctx.nbSpeak?.getCustomSoul() ?? '',
      enableVoiceNotes: () =>
        ctx.nbSpeak?.isVoiceNotesEnabled
          ? ctx.nbSpeak.isVoiceNotesEnabled()
          : parseEnvBoolean(process.env.NB_SPEAK_VOICE_NOTES),
      synthesizeVoiceNote: (input) =>
        ctx.nbSpeak?.synthesizeVoiceNote
          ? ctx.nbSpeak.synthesizeVoiceNote(input)
          : fallbackSynthesizer(input),
    }),
  );
}
