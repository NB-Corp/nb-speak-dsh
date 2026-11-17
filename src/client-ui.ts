import {
  computeWaveformHeights,
  createSpeechPlaybackController,
  formatShortDuration,
  NB_SPEAK_TURN_DATA_KEY,
  nbSpeakTurnDefinition,
  parseArtifactEntryFromArgs,
  parseBubbleEntryFromArgs,
  parsePipeTable,
  type ClientArtifactEntry,
  type ClientBubbleEntry,
  type ClientVoiceNote,
  type NbSpeakTurnLocationValue,
} from './client-model.ts';

export const CLIENT_NS = 'nb-speak';

export const CLIENT_ZH: Readonly<Record<string, string>> = {
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

export const CLIENT_EN: Readonly<Record<string, string>> = {
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

function interpolateText(dict: Readonly<Record<string, string>>, key: string, vars?: Record<string, string | number>): string {
  const template = dict[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_m, k) => String(vars[k] ?? ''));
}

async function copyTextToClipboard(text: string): Promise<boolean> {
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

export function createNbSpeakClientPlugin(React: any, cssText: string) {
  const h = React.createElement;
  const speech = createSpeechPlaybackController();
  let activeAudioDispose: (() => void) | null = null;

  function stopGlobalAudio(): void {
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

  function VoiceNotePill(props: { readonly voiceNote: ClientVoiceNote; readonly t?: (k: string) => string }) {
    const { voiceNote } = props;
    const [playing, setPlaying] = React.useState(false);
    const [progress, setProgress] = React.useState(0);
    const [durationSeconds, setDurationSeconds] = React.useState(voiceNote.durationSeconds);
    const stopRef = React.useRef(null as (() => void) | null);
    const audioRef = React.useRef(null as HTMLAudioElement | null);
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
        'data-audio-mode': voiceNote.audioSrc ? 'audio-clip' : 'web-speech',
      },
      voiceNote.audioSrc
        ? h('audio', {
            ref: audioRef,
            src: voiceNote.audioSrc,
            preload: 'metadata',
            hidden: true,
            'aria-hidden': 'true',
            'data-nb-speak-audio': 'true',
            onLoadedMetadata: (ev: any) => {
              const dur = ev?.currentTarget?.duration;
              if (typeof dur === 'number' && Number.isFinite(dur) && dur > 0) {
                setDurationSeconds(Math.max(1, Math.round(dur)));
              }
            },
            onTimeUpdate: (ev: any) => {
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

  function ArtifactCardView(props: { readonly artifact: ClientArtifactEntry; readonly t?: (k: string, v?: any) => string }) {
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

    let bodyNode: any;
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
                  onClick: () => setExpanded((v: boolean) => !v),
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

  function BubbleClusterView(props: { readonly entry: ClientBubbleEntry; readonly t?: (k: string) => string }) {
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

  function SpeakTurnTail(props: {
    readonly turn?: { readonly data?: { get(key: string): NbSpeakTurnLocationValue | undefined } };
    readonly t?: (k: string, v?: any) => string;
  }) {
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

  function SpeakBubbleToolRow(props: any) {
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

  function SpeakArtifactToolRow(props: any) {
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
    apply(ctx: any) {
      ctx.effect(() => {
        stopGlobalAudio();
        if (typeof document === 'undefined') return () => {};
        const tagId = '@nb-corp/nb-speak-dsh/client.css';
        let styleEl = document.querySelector(`style[data-plugin-css="${tagId}"]`) as HTMLStyleElement | null;
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
