// Auto-generated from @nb-corp/nb-speak-dsh src/{client-model.ts,client-ui.ts,client.css} — DO NOT HAND-EDIT
window.__ModuleLoader__.load({
  id: '@nb-corp/nb-speak-dsh',
  factory(require) {
    const React = require('react');
    const NB_SPEAK_CLIENT_CSS = ".nb-speak-turn-surface {\n  --nb-bubble-bg: #f2f4f8;\n  --nb-bubble-border: rgba(15, 23, 42, 0.085);\n  --nb-bubble-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);\n  --nb-bubble-fg: var(--dsw-alias-label-primary, #15181e);\n  --nb-bubble-muted: var(--dsw-alias-label-secondary, #5a6270);\n  --nb-bubble-caption: var(--dsw-alias-label-tertiary, #7b8391);\n  --nb-voice-accent: #1d5c4b;\n  --nb-voice-accent-soft: rgba(29, 92, 75, 0.12);\n  --nb-voice-bar-idle: rgba(29, 92, 75, 0.28);\n  --nb-artifact-bg: var(--dsw-alias-markdown-code-block, #f7f8fa);\n  --nb-artifact-header: var(--dsw-alias-markdown-code-block-banner, #eef1f5);\n  --nb-artifact-border: var(--dsw-alias-border-l2, rgba(15, 23, 42, 0.11));\n  display: flex;\n  flex-direction: column;\n  align-items: flex-start;\n  gap: 10px;\n  width: 100%;\n  margin: 4px 0 6px;\n  font-family: var(--dsw-font-family, system-ui, -apple-system, sans-serif);\n}\n\nbody[data-ds-dark-theme] .nb-speak-turn-surface {\n  --nb-bubble-bg: var(--dsw-alias-bg-layer-2, #26282c);\n  --nb-bubble-border: rgba(255, 255, 255, 0.09);\n  --nb-bubble-shadow: 0 1px 3px rgba(0, 0, 0, 0.22);\n  --nb-voice-accent: #4cc39f;\n  --nb-voice-accent-soft: rgba(76, 195, 159, 0.15);\n  --nb-voice-bar-idle: rgba(76, 195, 159, 0.3);\n}\n\n.nb-speak-bubble-cluster {\n  display: flex;\n  flex-direction: column;\n  align-items: flex-start;\n  gap: 6px;\n  width: 100%;\n}\n\n.nb-speak-bubble {\n  max-width: min(72%, 560px);\n  width: fit-content;\n  padding: 9px 14px;\n  border-radius: 16px 16px 16px 6px;\n  background: var(--nb-bubble-bg);\n  border: 1px solid var(--nb-bubble-border);\n  box-shadow: var(--nb-bubble-shadow);\n  color: var(--nb-bubble-fg);\n  font-size: var(--dsh-content-font-size-primary, 14.5px);\n  line-height: 1.52;\n  letter-spacing: -0.004em;\n  word-break: break-word;\n  animation: nbSpeakBubbleRise 190ms cubic-bezier(0.22, 1, 0.36, 1) both;\n  animation-delay: calc(var(--nb-bubble-idx, 0) * 58ms);\n}\n\n.nb-speak-bubble[data-tail=\"true\"] {\n  border-radius: 16px 16px 16px 4px;\n}\n\n.nb-speak-reply-quote {\n  display: block;\n  margin-bottom: 5px;\n  padding-left: 8px;\n  border-left: 2px solid var(--nb-voice-accent);\n  color: var(--nb-bubble-caption);\n  font-size: 12px;\n  line-height: 1.38;\n}\n\n.nb-speak-voice-pill {\n  max-width: min(76%, 460px);\n  min-width: 248px;\n  padding: 9px 13px 8px;\n  border-radius: 16px 16px 16px 4px;\n  background: var(--nb-bubble-bg);\n  border: 1px solid var(--nb-bubble-border);\n  box-shadow: var(--nb-bubble-shadow);\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n  animation: nbSpeakBubbleRise 200ms cubic-bezier(0.22, 1, 0.36, 1) both;\n}\n\n.nb-speak-voice-top {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n}\n\n.nb-speak-voice-btn {\n  appearance: none;\n  width: 28px;\n  height: 28px;\n  border-radius: 999px;\n  border: none;\n  background: var(--nb-voice-accent);\n  color: #ffffff;\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  flex: none;\n  cursor: pointer;\n  padding: 0;\n  transition: transform 120ms ease, opacity 120ms ease;\n}\n\nbody[data-ds-dark-theme] .nb-speak-voice-btn {\n  color: #10241e;\n}\n\n.nb-speak-voice-btn:hover {\n  opacity: 0.9;\n}\n\n.nb-speak-voice-btn:active {\n  transform: scale(0.95);\n}\n\n.nb-speak-waveform {\n  display: flex;\n  align-items: center;\n  gap: 2.5px;\n  height: 22px;\n  flex: 1 1 auto;\n  min-width: 96px;\n}\n\n.nb-speak-wave-bar {\n  width: 3px;\n  border-radius: 999px;\n  background: var(--nb-voice-bar-idle);\n  transition: background-color 120ms linear, transform 120ms ease;\n}\n\n.nb-speak-wave-bar[data-active=\"true\"] {\n  background: var(--nb-voice-accent);\n}\n\n.nb-speak-voice-meta {\n  flex: none;\n  font-family: var(--ds-font-family-code, ui-monospace, SFMono-Regular, Consolas, monospace);\n  font-size: 11.5px;\n  font-variant-numeric: tabular-nums;\n  color: var(--nb-bubble-muted);\n  white-space: nowrap;\n}\n\n.nb-speak-voice-caption {\n  margin: 0;\n  padding-top: 5px;\n  border-top: 1px solid var(--nb-bubble-border);\n  font-size: 12.5px;\n  line-height: 1.45;\n  color: var(--nb-bubble-muted);\n}\n\n.nb-speak-artifact-card {\n  width: 100%;\n  border-radius: 12px;\n  border: 1px solid var(--nb-artifact-border);\n  background: var(--nb-artifact-bg);\n  overflow: hidden;\n  animation: nbSpeakBubbleRise 210ms cubic-bezier(0.22, 1, 0.36, 1) both;\n}\n\n.nb-speak-artifact-header {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 10px;\n  padding: 7px 12px;\n  background: var(--nb-artifact-header);\n  border-bottom: 1px solid var(--nb-artifact-border);\n}\n\n.nb-speak-artifact-title-wrap {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  min-width: 0;\n}\n\n.nb-speak-artifact-icon {\n  color: var(--nb-voice-accent);\n  display: inline-flex;\n  flex: none;\n}\n\n.nb-speak-artifact-title {\n  font-family: var(--ds-font-family-code, ui-monospace, SFMono-Regular, Consolas, monospace);\n  font-size: 12.5px;\n  font-weight: 600;\n  color: var(--nb-bubble-fg);\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n\n.nb-speak-artifact-badge {\n  font-family: var(--ds-font-family-code, ui-monospace, SFMono-Regular, Consolas, monospace);\n  font-size: 10.5px;\n  font-weight: 600;\n  text-transform: uppercase;\n  letter-spacing: 0.04em;\n  padding: 1px 6px;\n  border-radius: 5px;\n  background: var(--nb-voice-accent-soft);\n  color: var(--nb-voice-accent);\n  flex: none;\n}\n\n.nb-speak-artifact-actions {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  flex: none;\n}\n\n.nb-speak-chip-btn {\n  appearance: none;\n  border: 1px solid var(--nb-artifact-border);\n  background: var(--dsw-alias-bg-base, #ffffff);\n  color: var(--nb-bubble-muted);\n  font-family: inherit;\n  font-size: 11.5px;\n  font-weight: 500;\n  line-height: 1;\n  padding: 4px 8px;\n  border-radius: 6px;\n  display: inline-flex;\n  align-items: center;\n  gap: 4px;\n  cursor: pointer;\n}\n\n.nb-speak-chip-btn:hover {\n  color: var(--nb-bubble-fg);\n}\n\n.nb-speak-chip-btn[data-copied=\"true\"] {\n  border-color: var(--nb-voice-accent);\n  color: var(--nb-voice-accent);\n}\n\n.nb-speak-artifact-pre {\n  margin: 0;\n  padding: 12px 14px;\n  overflow-x: auto;\n  max-height: 360px;\n  overflow-y: auto;\n  font-family: var(--ds-font-family-code, ui-monospace, SFMono-Regular, Consolas, monospace);\n  font-size: 12.5px;\n  line-height: 1.54;\n  color: var(--nb-bubble-fg);\n  tab-size: 2;\n}\n\n.nb-speak-artifact-pre[data-expanded=\"true\"] {\n  max-height: none;\n}\n\n.nb-speak-diff-line {\n  display: block;\n  padding: 0 6px;\n  margin: 0 -6px;\n  border-radius: 3px;\n  white-space: pre;\n}\n\n.nb-speak-diff-line[data-diff=\"add\"] {\n  background: var(--dsw-alias-file-diff-added-bg, rgba(34, 197, 94, 0.12));\n}\n\n.nb-speak-diff-line[data-diff=\"del\"] {\n  background: var(--dsw-alias-file-diff-deleted-bg, rgba(239, 68, 68, 0.11));\n}\n\n.nb-speak-diff-line[data-diff=\"hunk\"] {\n  color: var(--nb-bubble-caption);\n}\n\n.nb-speak-table-wrap {\n  overflow-x: auto;\n  padding: 6px 10px 10px;\n}\n\n.nb-speak-table {\n  width: 100%;\n  border-collapse: collapse;\n  font-size: 12.5px;\n}\n\n.nb-speak-table th,\n.nb-speak-table td {\n  text-align: left;\n  padding: 6px 10px;\n  border-bottom: 1px solid var(--nb-artifact-border);\n}\n\n.nb-speak-table th {\n  font-weight: 600;\n  color: var(--nb-bubble-muted);\n}\n\n.nb-speak-toolrow {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  min-height: 24px;\n  font-size: var(--dsh-content-font-size-secondary, 13px);\n  color: var(--dsw-alias-label-tertiary, #7b8391);\n}\n\n.nb-speak-toolrow-dot {\n  width: 6px;\n  height: 6px;\n  border-radius: 999px;\n  background: #1d5c4b;\n  flex: none;\n}\n\n@keyframes nbSpeakBubbleRise {\n  from {\n    opacity: 0;\n    transform: translateY(4px);\n  }\n  to {\n    opacity: 1;\n    transform: translateY(0);\n  }\n}\n\n@media (prefers-reduced-motion: reduce) {\n  .nb-speak-bubble,\n  .nb-speak-voice-pill,\n  .nb-speak-artifact-card {\n    animation: none;\n  }\n}\n";

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
function cleanClientBubbleText(raw         )         {
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
function estimateClientVoiceSeconds(text        )         {
  const clean = text.trim();
  if (!clean) return 0;
  const cjk = (clean.match(CJK_RE) ?? []).length;
  const en = (clean.replace(CJK_RE, ' ').match(EN_WORD_RE) ?? []).length;
  return Math.max(2, Math.min(25, Math.round(cjk / 4.2 + en / 2.6 + 0.8)));
}
function stripClientOuterFence(content        )         {
  const trimmed = String(content ?? '').replace(/\r\n/g, '\n').trim();
  const match = /^```[A-Za-z0-9_+-]*\n([\s\S]*?)\n```$/.exec(trimmed);
  return match ? match[1] .trimEnd() : trimmed;
}
function safeParseJsonRecord(raw         )                                 {
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
function parseBubbleEntryFromArgs(
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
function parseArtifactEntryFromArgs(
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
function computeWaveformHeights(seedText        , barCount = 22)                    {
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
function formatShortDuration(seconds        )         {
  const safe = Math.max(1, Math.round(seconds));
  const mins = Math.floor(safe / 60);
  const secs = String(safe % 60).padStart(2, '0');
  return `${mins}:${secs}`;
}
function parsePipeTable(content        )   
                                      
                                                  
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
function createSpeechPlaybackController() {
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
const NB_SPEAK_TURN_DATA_KEY = 'nb-speak';
const nbSpeakTurnDefinition = {
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

const CLIENT_NS = 'nb-speak';
const CLIENT_ZH                                   = {
  'bubble.tool.running': '正在发送气泡…',
  'bubble.tool.done': '已发送 {count} 条气泡',
  'bubble.tool.voice': ' + 语音 {seconds}s',
  'artifact.tool.running': '正在生成卡片…',
  'artifact.tool.done': '产物卡片 · {title}（{lines} 行）',
  'artifact.copy': '复制',
  'artifact.copied': '已复制',
  'artifact.expand': '展开全部（{lines} 行）',
  'artifact.collapse': '收起',
  'voice.play': '播放语音条',
  'voice.stop': '停止播放',
};
const CLIENT_EN                                   = {
  'bubble.tool.running': 'Sending IM bubbles…',
  'bubble.tool.done': 'Sent {count} IM bubbles',
  'bubble.tool.voice': ' + {seconds}s voice note',
  'artifact.tool.running': 'Rendering artifact card…',
  'artifact.tool.done': 'Artifact card · {title} ({lines} lines)',
  'artifact.copy': 'Copy',
  'artifact.copied': 'Copied',
  'artifact.expand': 'Expand all ({lines} lines)',
  'artifact.collapse': 'Collapse',
  'voice.play': 'Play voice note',
  'voice.stop': 'Stop voice note',
};

function interpolateText(dict                                  , key        , vars                                  )         {
  const template = dict[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_m, k) => String(vars[k] ?? ''));
}

async function copyTextToClipboard(text        )                   {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall back to textarea copy
    }
  }
  if (typeof document === 'undefined') return false;
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(ta);
  return ok;
}
function createNbSpeakClientPlugin(React     , cssText        ) {
  const h = React.createElement;
  const speech = createSpeechPlaybackController();
  let activeAudioDispose                      = null;

  function stopGlobalAudio()       {
    if (activeAudioDispose) {
      const fn = activeAudioDispose;
      activeAudioDispose = null;
      fn();
    }
    speech.stopCurrent();
  }

  function PlayTriangleIcon() {
    return h(
      'svg',
      { width: 12, height: 12, viewBox: '0 0 12 12', fill: 'none', 'aria-hidden': 'true' },
      h('path', { d: 'M3.2 2.1L9.6 6L3.2 9.9V2.1Z', fill: 'currentColor' }),
    );
  }

  function StopSquareIcon() {
    return h(
      'svg',
      { width: 11, height: 11, viewBox: '0 0 12 12', fill: 'none', 'aria-hidden': 'true' },
      h('rect', { x: 2.5, y: 2.5, width: 7, height: 7, rx: 1.4, fill: 'currentColor' }),
    );
  }

  function ArtifactGlyphIcon() {
    return h(
      'svg',
      { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
      h('path', {
        d: 'M5.2 4.5L2.2 8L5.2 11.5M10.8 4.5L13.8 8L10.8 11.5M9.1 3L6.9 13',
        stroke: 'currentColor',
        strokeWidth: 1.45,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      }),
    );
  }

  function VoiceNotePill(props                                                                             ) {
    const { voiceNote } = props;
    const [playing, setPlaying] = React.useState(false);
    const [progress, setProgress] = React.useState(0);
    const [durationSeconds, setDurationSeconds] = React.useState(voiceNote.durationSeconds);
    const stopRef = React.useRef(null                       );
    const audioRef = React.useRef(null                           );
    const bars = React.useMemo(() => computeWaveformHeights(voiceNote.text, 22), [voiceNote.text]);

    React.useEffect(() => {
      setDurationSeconds(voiceNote.durationSeconds);
    }, [voiceNote.durationSeconds]);

    React.useEffect(() => {
      return () => {
        if (stopRef.current) stopRef.current();
      };
    }, []);

    const startSpeechFallback = () => {
      stopRef.current = speech.play(voiceNote.text, durationSeconds, (ratio, isPlaying) => {
        setProgress(ratio);
        setPlaying(isPlaying);
      });
    };

    const togglePlay = () => {
      if (playing) {
        if (stopRef.current) stopRef.current();
        stopRef.current = null;
        setPlaying(false);
        setProgress(0);
        return;
      }
      stopGlobalAudio();

      const audioEl = audioRef.current;
      if (voiceNote.audioSrc && audioEl && typeof audioEl.play === 'function') {
        let disposed = false;
        const stopHtmlAudio = () => {
          if (disposed) return;
          disposed = true;
          try {
            audioEl.pause();
            audioEl.currentTime = 0;
          } catch {
            // Ignore audio reset errors
          }
          if (activeAudioDispose === stopHtmlAudio) activeAudioDispose = null;
          setPlaying(false);
          setProgress(0);
        };
        stopRef.current = stopHtmlAudio;
        activeAudioDispose = stopHtmlAudio;
        setPlaying(true);
        setProgress(0.04);
        const playResult = audioEl.play();
        if (playResult && typeof playResult.catch === 'function') {
          playResult.catch(() => {
            stopHtmlAudio();
            startSpeechFallback();
          });
        }
        return;
      }

      startSpeechFallback();
    };

    const activeBars = playing ? Math.max(1, Math.round(progress * bars.length)) : 0;
    const label = playing
      ? props.t?.('voice.stop') ?? CLIENT_ZH['voice.stop']
      : props.t?.('voice.play') ?? CLIENT_ZH['voice.play'];

    return h(
      'div',
      {
        className: 'nb-speak-voice-pill',
        'data-nb-speak': 'voice-note',
        'data-emotion': voiceNote.emotion,
        'data-playing': playing ? 'true' : 'false',
        'data-audio-mode': voiceNote.audioSrc ? 'elevenlabs-audio' : 'web-speech',
      },
      voiceNote.audioSrc
        ? h('audio', {
            ref: audioRef,
            src: voiceNote.audioSrc,
            preload: 'metadata',
            hidden: true,
            'aria-hidden': 'true',
            'data-nb-speak-audio': 'true',
            onLoadedMetadata: (ev     ) => {
              const dur = ev?.currentTarget?.duration;
              if (typeof dur === 'number' && Number.isFinite(dur) && dur > 0) {
                setDurationSeconds(Math.max(1, Math.round(dur)));
              }
            },
            onTimeUpdate: (ev     ) => {
              const el = ev?.currentTarget;
              const dur = el?.duration > 0 ? el.duration : durationSeconds;
              if (el && dur > 0 && !el.paused) {
                setProgress(Math.max(0.04, Math.min(1, el.currentTime / dur)));
              }
            },
            onEnded: () => {
              if (stopRef.current) stopRef.current();
              stopRef.current = null;
            },
          })
        : null,
      h(
        'div',
        { className: 'nb-speak-voice-top' },
        h(
          'button',
          {
            type: 'button',
            className: 'nb-speak-voice-btn',
            'aria-label': label,
            onClick: togglePlay,
          },
          playing ? h(StopSquareIcon) : h(PlayTriangleIcon),
        ),
        h(
          'div',
          { className: 'nb-speak-waveform', 'aria-hidden': 'true' },
          bars.map((heightPx, idx) =>
            h('span', {
              key: idx,
              className: 'nb-speak-wave-bar',
              'data-active': idx < activeBars ? 'true' : 'false',
              style: { height: `${heightPx}px` },
            }),
          ),
        ),
        h(
          'span',
          { className: 'nb-speak-voice-meta' },
          `${formatShortDuration(durationSeconds)} · ${voiceNote.emotion}`,
        ),
      ),
      h('p', { className: 'nb-speak-voice-caption' }, voiceNote.text),
    );
  }

  function ArtifactCardView(props                                                                                         ) {
    const { artifact } = props;
    const [copied, setCopied] = React.useState(false);
    const [expanded, setExpanded] = React.useState(false);
    const collapsible = artifact.lineCount > 22;
    const badgeLabel = (artifact.language || artifact.artifactKind).toUpperCase();

    const handleCopy = async () => {
      const ok = await copyTextToClipboard(artifact.content);
      if (ok) {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }
    };

    const parsedTable =
      artifact.artifactKind === 'table' ? parsePipeTable(artifact.content) : null;

    let bodyNode     ;
    if (parsedTable) {
      bodyNode = h(
        'div',
        { className: 'nb-speak-table-wrap' },
        h(
          'table',
          { className: 'nb-speak-table' },
          h(
            'thead',
            null,
            h(
              'tr',
              null,
              parsedTable.headers.map((hd, i) => h('th', { key: i }, hd)),
            ),
          ),
          h(
            'tbody',
            null,
            parsedTable.rows.map((row, rIdx) =>
              h(
                'tr',
                { key: rIdx },
                row.map((cell, cIdx) => h('td', { key: cIdx }, cell)),
              ),
            ),
          ),
        ),
      );
    } else if (artifact.artifactKind === 'diff' || artifact.language === 'diff') {
      const lines = artifact.content.split('\n');
      bodyNode = h(
        'pre',
        {
          className: 'nb-speak-artifact-pre',
          'data-expanded': expanded ? 'true' : 'false',
        },
        h(
          'code',
          null,
          lines.map((line, idx) => {
            const diffKind =
              line.startsWith('+') && !line.startsWith('+++')
                ? 'add'
                : line.startsWith('-') && !line.startsWith('---')
                  ? 'del'
                  : line.startsWith('@@')
                    ? 'hunk'
                    : 'ctx';
            return h(
              'span',
              { key: idx, className: 'nb-speak-diff-line', 'data-diff': diffKind },
              line || ' ',
            );
          }),
        ),
      );
    } else {
      bodyNode = h(
        'pre',
        {
          className: 'nb-speak-artifact-pre',
          'data-expanded': expanded ? 'true' : 'false',
        },
        h('code', null, artifact.content),
      );
    }

    const copyText = copied
      ? props.t?.('artifact.copied') ?? CLIENT_ZH['artifact.copied']
      : props.t?.('artifact.copy') ?? CLIENT_ZH['artifact.copy'];
    const expandText = expanded
      ? props.t?.('artifact.collapse') ?? CLIENT_ZH['artifact.collapse']
      : interpolateText(CLIENT_ZH, 'artifact.expand', { lines: artifact.lineCount });

    return h(
      'section',
      {
        className: 'nb-speak-artifact-card',
        'data-nb-speak': 'artifact-card',
        'data-artifact-kind': artifact.artifactKind,
      },
      h(
        'header',
        { className: 'nb-speak-artifact-header' },
        h(
          'div',
          { className: 'nb-speak-artifact-title-wrap' },
          h('span', { className: 'nb-speak-artifact-icon' }, h(ArtifactGlyphIcon)),
          h('span', { className: 'nb-speak-artifact-title', title: artifact.title }, artifact.title),
          h('span', { className: 'nb-speak-artifact-badge' }, badgeLabel),
        ),
        h(
          'div',
          { className: 'nb-speak-artifact-actions' },
          collapsible
            ? h(
                'button',
                {
                  type: 'button',
                  className: 'nb-speak-chip-btn',
                  onClick: () => setExpanded((v         ) => !v),
                },
                expandText,
              )
            : null,
          h(
            'button',
            {
              type: 'button',
              className: 'nb-speak-chip-btn',
              'data-copied': copied ? 'true' : 'false',
              onClick: handleCopy,
            },
            copyText,
          ),
        ),
      ),
      bodyNode,
    );
  }

  function BubbleClusterView(props                                                                           ) {
    const { entry } = props;
    const lastIdx = entry.bubbles.length - 1;
    return h(
      'div',
      { className: 'nb-speak-bubble-cluster', 'data-nb-speak': 'bubble-cluster' },
      entry.bubbles.map((text, idx) =>
        h(
          'div',
          {
            key: `${entry.callId}:${idx}`,
            className: 'nb-speak-bubble',
            'data-nb-speak': 'bubble',
            'data-tail': idx === lastIdx && !entry.voiceNote ? 'true' : 'false',
            style: { '--nb-bubble-idx': idx },
          },
          idx === 0 && entry.replyTo
            ? h('span', { className: 'nb-speak-reply-quote' }, entry.replyTo)
            : null,
          text,
        ),
      ),
      entry.voiceNote ? h(VoiceNotePill, { voiceNote: entry.voiceNote, t: props.t }) : null,
    );
  }

  function SpeakTurnTail(props   
                                                                                                   
                                                
   ) {
    const payload = props.turn?.data?.get?.(NB_SPEAK_TURN_DATA_KEY);
    if (!payload || (payload.bubbles.length === 0 && payload.artifacts.length === 0)) {
      return null;
    }
    return h(
      'div',
      {
        className: 'nb-speak-turn-surface',
        'data-nb-speak': 'turn-surface',
      },
      payload.bubbles.map((entry) =>
        h(BubbleClusterView, { key: entry.callId, entry, t: props.t }),
      ),
      payload.artifacts.map((artifact) =>
        h(ArtifactCardView, { key: artifact.callId, artifact, t: props.t }),
      ),
    );
  }

  function SpeakBubbleToolRow(props     ) {
    if (props.phase === 'preparing') {
      return h(
        'div',
        { className: 'nb-speak-toolrow', 'data-tool': 'send_bubble', 'data-state': 'preparing' },
        h('span', { className: 'nb-speak-toolrow-dot' }),
        h('span', null, props.t?.('bubble.tool.running') ?? CLIENT_ZH['bubble.tool.running']),
      );
    }
    const settled = 'kind' in props.block;
    const rawArgs = settled ? props.block.call?.argsRaw : props.block.argsRaw;
    const parsed = parseBubbleEntryFromArgs(props.callId ?? 'call', 0, rawArgs ?? '');
    const count = parsed?.bubbles.length ?? 0;
    const voicePart = parsed?.voiceNote
      ? interpolateText(CLIENT_ZH, 'bubble.tool.voice', { seconds: parsed.voiceNote.durationSeconds })
      : '';
    const text = count > 0
      ? interpolateText(CLIENT_ZH, 'bubble.tool.done', { count }) + voicePart
      : props.t?.('bubble.tool.running') ?? CLIENT_ZH['bubble.tool.running'];
    return h(
      'div',
      { className: 'nb-speak-toolrow', 'data-tool': 'send_bubble', 'data-state': settled ? 'ok' : 'running' },
      h('span', { className: 'nb-speak-toolrow-dot' }),
      h('span', null, text),
    );
  }

  function SpeakArtifactToolRow(props     ) {
    if (props.phase === 'preparing') {
      return h(
        'div',
        { className: 'nb-speak-toolrow', 'data-tool': 'send_artifact', 'data-state': 'preparing' },
        h('span', { className: 'nb-speak-toolrow-dot' }),
        h('span', null, props.t?.('artifact.tool.running') ?? CLIENT_ZH['artifact.tool.running']),
      );
    }
    const settled = 'kind' in props.block;
    const rawArgs = settled ? props.block.call?.argsRaw : props.block.argsRaw;
    const parsed = parseArtifactEntryFromArgs(props.callId ?? 'call', 0, rawArgs ?? '');
    const text = parsed
      ? interpolateText(CLIENT_ZH, 'artifact.tool.done', { title: parsed.title, lines: parsed.lineCount })
      : props.t?.('artifact.tool.running') ?? CLIENT_ZH['artifact.tool.running'];
    return h(
      'div',
      { className: 'nb-speak-toolrow', 'data-tool': 'send_artifact', 'data-state': settled ? 'ok' : 'running' },
      h('span', { className: 'nb-speak-toolrow-dot' }),
      h('span', null, text),
    );
  }

  return {
    inject: ['slots', 'locale', 'uiConversation'],
    apply(ctx     ) {
      ctx.effect(() => {
        stopGlobalAudio();
        if (typeof document === 'undefined') return () => {};
        const tagId = '@nb-corp/nb-speak-dsh/client.css';
        let styleEl = document.querySelector(`style[data-plugin-css="${tagId}"]`)                           ;
        if (!styleEl) {
          styleEl = document.createElement('style');
          styleEl.dataset.plugin = '@nb-corp/nb-speak-dsh';
          styleEl.dataset.pluginCss = tagId;
          styleEl.textContent = cssText;
          document.head.appendChild(styleEl);
        } else {
          styleEl.textContent = cssText;
        }
        return () => {
          stopGlobalAudio();
          styleEl?.remove();
        };
      }, 'nb-speak: styles & speech cleanup');

      ctx.effect(
        () => ctx.locale.register(CLIENT_NS, { zh: CLIENT_ZH, en: CLIENT_EN }),
        'nb-speak: dictionaries',
      );

      ctx.effect(
        () => ctx.uiConversation.events.register(nbSpeakTurnDefinition),
        'nb-speak: turn definition',
      );

      ctx.slots.inject('conversation.chat.turnTail', () =>
        ctx.slots.register(
          {
            name: 'conversation.chat.turnTail',
            id: '@nb-corp/nb-speak-dsh',
            order: -10,
            locale: CLIENT_NS,
          },
          SpeakTurnTail,
        ),
      );

      ctx.slots.inject('tool.call.toolview', () =>
        ctx.slots.register(
          {
            name: 'tool.call.toolview',
            key: 'send_bubble',
            locale: CLIENT_NS,
          },
          SpeakBubbleToolRow,
        ),
      );

      ctx.slots.inject('tool.call.toolview', () =>
        ctx.slots.register(
          {
            name: 'tool.call.toolview',
            key: 'send_artifact',
            locale: CLIENT_NS,
          },
          SpeakArtifactToolRow,
        ),
      );
    },
  };
}

    return createNbSpeakClientPlugin(React, NB_SPEAK_CLIENT_CSS);
  },
});
