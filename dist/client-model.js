                                
             
          
          
         
              
             
              

                                  
                        
                                       
                                   
                             
 

                                    
                          
                       
                                      
                                       
                            
 

                                                                        

                                      
                          
                       
                         
                                            
                             
                           
                             
 

                                           
                                                 
                                                     
 

                             
                        
                                                             
                                                                 
 

const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g;
const EN_WORD_RE = /[A-Za-z0-9]+(?:'[A-Za-z0-9]+)?/g;
const VALID_EMOTIONS = new Set                    ([
  'neutral',
  'warm',
  'calm',
  'dry',
  'relieved',
  'playful',
  'serious',
]);
const VALID_KINDS = new Set                    (['code', 'markdown', 'diff', 'table']);

export function cleanClientBubbleText(raw         )         {
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

export function estimateClientVoiceSeconds(text        )         {
  const clean = text.trim();
  if (!clean) return 0;
  const cjk = (clean.match(CJK_RE) ?? []).length;
  const en = (clean.replace(CJK_RE, ' ').match(EN_WORD_RE) ?? []).length;
  return Math.max(2, Math.min(25, Math.round(cjk / 4.2 + en / 2.6 + 0.8)));
}

export function stripClientOuterFence(content        )         {
  const trimmed = String(content ?? '').replace(/\r\n/g, '\n').trim();
  const match = /^```[A-Za-z0-9_+-]*\n([\s\S]*?)\n```$/.exec(trimmed);
  return match ? match[1] .trimEnd() : trimmed;
}

export function safeParseJsonRecord(raw         )                                 {
  if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw                           ;
  }
  if (typeof raw === 'string' && raw.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed                           ;
      }
    } catch {
      return null;
    }
  }
  return null;
}

export function parseBubbleEntryFromArgs(
  callId        ,
  seq        ,
  rawArgs         ,
)                           {
  const obj = safeParseJsonRecord(rawArgs);
  if (!obj || !Array.isArray(obj.bubbles)) return null;
  const bubbles = obj.bubbles.map((b) => cleanClientBubbleText(b)).filter((b) => b.length > 0);
  if (bubbles.length === 0) return null;

  let voiceNote                             ;
  const vnRaw = safeParseJsonRecord(obj.voice_note);
  if (vnRaw && typeof vnRaw.text === 'string' && vnRaw.text.trim()) {
    const text = vnRaw.text.trim();
    const rawEmotion = typeof vnRaw.emotion === 'string' ? (vnRaw.emotion                      ) : 'neutral';
    const emotion                     = VALID_EMOTIONS.has(rawEmotion) ? rawEmotion : 'neutral';
    const audioSrc =
      typeof vnRaw.audioSrc === 'string' && vnRaw.audioSrc.trim()
        ? vnRaw.audioSrc.trim()
        : typeof vnRaw.audio_url === 'string' && vnRaw.audio_url.trim()
          ? vnRaw.audio_url.trim()
          : undefined;
    voiceNote = {
      text,
      emotion,
      durationSeconds: estimateClientVoiceSeconds(text),
      ...(audioSrc ? { audioSrc } : {}),
    };
  }
  const replyTo = typeof obj.reply_to === 'string' && obj.reply_to.trim() ? obj.reply_to.trim() : undefined;
  return {
    callId,
    seq,
    bubbles,
    ...(voiceNote ? { voiceNote } : {}),
    ...(replyTo ? { replyTo } : {}),
  };
}

export function parseArtifactEntryFromArgs(
  callId        ,
  seq        ,
  rawArgs         ,
)                             {
  const obj = safeParseJsonRecord(rawArgs);
  if (!obj) return null;
  const title = typeof obj.title === 'string' && obj.title.trim() ? obj.title.trim() : '';
  const content = typeof obj.content === 'string' ? stripClientOuterFence(obj.content) : '';
  if (!title || !content) return null;
  const rawKind = typeof obj.kind === 'string' ? (obj.kind                      ) : 'code';
  const artifactKind                     = VALID_KINDS.has(rawKind) ? rawKind : 'code';
  const language = typeof obj.language === 'string' && obj.language.trim() ? obj.language.trim() : undefined;
  return {
    callId,
    seq,
    title,
    artifactKind,
    ...(language ? { language } : {}),
    content,
    lineCount: content.split('\n').length,
  };
}

export function computeWaveformHeights(seedText        , barCount = 22)                    {
  let hash = 2166136261;
  for (let i = 0; i < seedText.length; i += 1) {
    hash ^= seedText.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const heights           = [];
  for (let i = 0; i < barCount; i += 1) {
    hash ^= (i + 1) * 2654435761;
    hash = Math.imul(hash, 1597334677);
    const unit = ((hash >>> 0) % 1000) / 1000;
    const envelope = Math.sin(((i + 0.5) / barCount) * Math.PI);
    const px = Math.round(5 + (0.35 + 0.65 * envelope) * unit * 14);
    heights.push(Math.max(4, Math.min(20, px)));
  }
  return heights;
}

export function formatShortDuration(seconds        )         {
  const safe = Math.max(1, Math.round(seconds));
  const mins = Math.floor(safe / 60);
  const secs = String(safe % 60).padStart(2, '0');
  return `${mins}:${secs}`;
}

export function parsePipeTable(content        )   
                                      
                                                  
         {
  const lines = content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2 || !lines[0] .includes('|')) return null;
  const splitRow = (line        )           => {
    const stripped = line.replace(/^\|/, '').replace(/\|$/, '');
    return stripped.split('|').map((cell) => cell.trim());
  };
  const headers = splitRow(lines[0] );
  const sep = lines[1] ;
  const startRow = /^[\s|:-]+$/.test(sep) ? 2 : 1;
  const rows = lines.slice(startRow).map(splitRow);
  return headers.length > 0 && rows.length > 0 ? { headers, rows } : null;
}

export function createSpeechPlaybackController() {
  let activeDispose                      = null;

  function stopCurrent()       {
    if (activeDispose) {
      const fn = activeDispose;
      activeDispose = null;
      fn();
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore synthesis cancel errors in headless browsers
      }
    }
  }

  function play(
    text        ,
    durationSeconds        ,
    onProgress                                           ,
  )             {
    stopCurrent();
    let stopped = false;
    const totalMs = Math.max(1500, durationSeconds * 1000);
    const startedAt = Date.now();

    onProgress(0.04, true);
    const timer = setInterval(() => {
      if (stopped) return;
      const ratio = Math.min(1, (Date.now() - startedAt) / totalMs);
      if (ratio >= 1) {
        finish();
      } else {
        onProgress(ratio, true);
      }
    }, 90);

    const finish = () => {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      if (activeDispose === finish) activeDispose = null;
      onProgress(0, false);
    };

    activeDispose = finish;

    if (typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined') {
      try {
        const utter = new SpeechSynthesisUtterance(text);
        const hasCjk = CJK_RE.test(text);
        CJK_RE.lastIndex = 0;
        utter.lang = hasCjk ? 'zh-CN' : 'en-US';
        utter.rate = 1.03;
        const voices = window.speechSynthesis.getVoices?.() ?? [];
        const matchedVoice = voices.find((v) =>
          hasCjk ? /zh|chinese/i.test(`${v.lang} ${v.name}`) : /en/i.test(v.lang),
        );
        if (matchedVoice) utter.voice = matchedVoice;
        utter.onend = () => finish();
        utter.onerror = () => finish();
        window.speechSynthesis.speak(utter);
      } catch {
        // Fallback timer still drives visual playback cleanly when audio output device is absent
      }
    }

    return finish;
  }

  return { play, stopCurrent };
}

export const NB_SPEAK_TURN_DATA_KEY = 'nb-speak';

export const nbSpeakTurnDefinition = {
  kind: NB_SPEAK_TURN_DATA_KEY,
  match(event                                                                                     ) {
    if (event.type === 'turn/start' && typeof event.data?.turn === 'number') {
      return { id: String(event.data.turn), role: 'start'          };
    }
    if (event.type === 'tool/call' && typeof event.data?.turn === 'number') {
      const toolName = event.data?.name;
      if (toolName === 'send_bubble' || toolName === 'send_artifact') {
        return { id: String(event.data.turn), role: 'update'          };
      }
    }
    if (event.type === 'tool/result' && typeof event.data?.turn === 'number') {
      return { id: String(event.data.turn), role: 'update'          };
    }
    return null;
  },
  start(_context         , match                                                                                   )                    {
    return {
      turn: Number(match.event.data?.turn ?? 0),
      bubbleMap: new Map(),
      artifactMap: new Map(),
    };
  },
  update(
    context                                       ,
    match                                                                                                         ,
  )                    {
    const ev = match.event;
    const prev = context.state;

    if (ev.type === 'tool/call') {
      const callId = String(ev.data?.callId ?? '');
      if (!callId) return prev;
      if (ev.data?.name === 'send_bubble') {
        const entry = parseBubbleEntryFromArgs(callId, ev.seq, ev.data?.arguments);
        if (!entry) return prev;
        const nextMap = new Map(prev.bubbleMap);
        nextMap.set(callId, entry);
        return { ...prev, bubbleMap: nextMap };
      }
      if (ev.data?.name === 'send_artifact') {
        const entry = parseArtifactEntryFromArgs(callId, ev.seq, ev.data?.arguments);
        if (!entry) return prev;
        const nextMap = new Map(prev.artifactMap);
        nextMap.set(callId, entry);
        return { ...prev, artifactMap: nextMap };
      }
      return prev;
    }

    if (ev.type === 'tool/result') {
      const callId = String(ev.data?.message?.source?.callId ?? '');
      if (!callId) return prev;
      if (ev.data?.message?.isError === true) {
        if (!prev.bubbleMap.has(callId) && !prev.artifactMap.has(callId)) return prev;
        const nextBubbles = new Map(prev.bubbleMap);
        const nextArtifacts = new Map(prev.artifactMap);
        nextBubbles.delete(callId);
        nextArtifacts.delete(callId);
        return { ...prev, bubbleMap: nextBubbles, artifactMap: nextArtifacts };
      }
      const meta = safeParseJsonRecord(ev.data?.meta);
      if (meta?.kind === 'nb-speak/bubbles' && Array.isArray(meta.bubbles)) {
        const existing = prev.bubbleMap.get(callId);
        const bubbles = meta.bubbles.map((b) => String(b)).filter(Boolean);
        if (bubbles.length === 0) return prev;
        const vn = safeParseJsonRecord(meta.voiceNote);
        const audioSrc =
          vn && typeof vn.audioSrc === 'string' && vn.audioSrc.trim()
            ? vn.audioSrc.trim()
            : existing?.voiceNote?.audioSrc;
        const voiceNote                              =
          vn && typeof vn.text === 'string'
            ? {
                text: vn.text,
                emotion: VALID_EMOTIONS.has(vn.emotion                      )
                  ? (vn.emotion                      )
                  : 'neutral',
                durationSeconds:
                  typeof vn.durationSeconds === 'number'
                    ? vn.durationSeconds
                    : estimateClientVoiceSeconds(vn.text),
                ...(audioSrc ? { audioSrc } : {}),
              }
            : existing?.voiceNote;
        const nextMap = new Map(prev.bubbleMap);
        nextMap.set(callId, {
          callId,
          seq: existing?.seq ?? ev.seq,
          bubbles,
          ...(voiceNote ? { voiceNote } : {}),
          ...(typeof meta.replyTo === 'string' ? { replyTo: meta.replyTo } : existing?.replyTo ? { replyTo: existing.replyTo } : {}),
        });
        return { ...prev, bubbleMap: nextMap };
      }
      if (meta?.kind === 'nb-speak/artifact' && typeof meta.content === 'string') {
        const existing = prev.artifactMap.get(callId);
        const nextMap = new Map(prev.artifactMap);
        nextMap.set(callId, {
          callId,
          seq: existing?.seq ?? ev.seq,
          title: typeof meta.title === 'string' ? meta.title : existing?.title ?? 'artifact',
          artifactKind: VALID_KINDS.has(meta.artifactKind                      )
            ? (meta.artifactKind                      )
            : existing?.artifactKind ?? 'code',
          ...(typeof meta.language === 'string' ? { language: meta.language } : existing?.language ? { language: existing.language } : {}),
          content: meta.content,
          lineCount: typeof meta.lineCount === 'number' ? meta.lineCount : meta.content.split('\n').length,
        });
        return { ...prev, artifactMap: nextMap };
      }
    }

    return prev;
  },
  buildLocationData(
    context                                        ,
    scope        ,
    previous                                                                                                                          ,
  ) {
    if (scope !== 'turn' || !context.state) return null;
    const bubbles = [...context.state.bubbleMap.values()].sort((a, b) => a.seq - b.seq);
    const artifacts = [...context.state.artifactMap.values()].sort((a, b) => a.seq - b.seq);
    if (bubbles.length === 0 && artifacts.length === 0) return null;
    if (
      previous &&
      previous.kind === 'turn' &&
      previous.turn === context.state.turn &&
      previous.key === NB_SPEAK_TURN_DATA_KEY &&
      previous.value.bubbles.length === bubbles.length &&
      previous.value.artifacts.length === artifacts.length &&
      previous.value.bubbles.every((b, idx) => b === bubbles[idx]) &&
      previous.value.artifacts.every((a, idx) => a === artifacts[idx])
    ) {
      return previous;
    }
    return {
      kind: 'turn',
      turn: context.state.turn,
      key: NB_SPEAK_TURN_DATA_KEY,
      value: { bubbles, artifacts },
    };
  },
};
