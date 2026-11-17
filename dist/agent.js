import {
  parseEnvBoolean,
  registerSpeakToolsAndPrompt,
                                  
                           
} from './dsh-tools.js';
import { createVoiceNoteSynthesizer,                           } from './tts.js';
                                                      

                                         
                                       
                          
                                  
                                                      
 

                                   
                                      
                                                    
                                            
                                          
 

export const name = 'nb-speak-agent';
export const inject = {
  tools: { required: true },
  systemPrompt: { required: true },
  nbSpeak: { required: false },
};

export function apply(ctx                  )       {
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
