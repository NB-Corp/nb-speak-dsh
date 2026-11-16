import {
  computeEffectiveWeights,
  computeWaveformHeights,
  createSpeechPlaybackController,
  formatShortDuration,
  resolveRawSlidersFromConfig,
} from './dsh-runtime-browser.js';
import { SCENARIOS } from './scenarios.js';

const LANG = document.documentElement.lang.startsWith('zh') ? 'zh' : 'en';
const ASSET_PREFIX = LANG === 'zh' ? '../assets' : './assets';

const COPY = {
  en: {
    copy: 'Copy',
    copied: 'Copied',
    expand: (n) => `Expand all (${n} lines)`,
    collapse: 'Collapse',
    playVoice: 'Play voice note',
    stopVoice: 'Stop voice note',
    toolSummary: (b, v, a) =>
      `send_bubble (${b} bubbles${v ? ` + ${v}s voice` : ''})${a ? ` · send_artifact (${a})` : ''} · exec.concludeTurn()`,
    footStat: (b, a) => `${b} bubbles${a ? ` · ${a} card` : ' · 0 cards'} · 0 EMPTY_RESPONSE retries`,
    heroShowcaseTitle: 'Overview · Casual Friday & 4.2M-Row SQL (:19081 vs :19082)',
    vectorLabel: '5-axis style vector',
  },
  zh: {
    copy: '复制',
    copied: '已复制',
    expand: (n) => `展开全部（${n} 行）`,
    collapse: '收起',
    playVoice: '播放语音条',
    stopVoice: '停止播放',
    toolSummary: (b, v, a) =>
      `send_bubble（${b} 条气泡${v ? ` + ${v}s 语音` : ''}）${a ? ` · send_artifact（${a}）` : ''} · exec.concludeTurn()`,
    footStat: (b, a) => `${b} 条短气泡${a ? ` · ${a} 张制品卡` : ' · 零代码卡'} · 0 次 EMPTY_RESPONSE 重试`,
    heroShowcaseTitle: '全局总览 · 周五闲聊与 420 万行慢 SQL (:19081 vs :19082)',
    vectorLabel: '五维风格向量',
  },
}[LANG];

const speech = createSpeechPlaybackController();
let activeAudioStop = null;
let currentIdx = 0;

function stopActiveAudio() {
  if (activeAudioStop) {
    const fn = activeAudioStop;
    activeAudioStop = null;
    fn();
  }
  speech.stopCurrent();
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback below
    }
  }
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

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined) continue;
    if (k === 'className') node.className = v;
    else if (k === 'textContent') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else {
      node.setAttribute(k, String(v));
    }
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

function makePlaySvg(isPlaying) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', '12');
  svg.setAttribute('height', '12');
  svg.setAttribute('viewBox', '0 0 12 12');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');
  if (isPlaying) {
    const rect = document.createElementNS(ns, 'rect');
    rect.setAttribute('x', '2.5');
    rect.setAttribute('y', '2.5');
    rect.setAttribute('width', '7');
    rect.setAttribute('height', '7');
    rect.setAttribute('rx', '1.4');
    rect.setAttribute('fill', 'currentColor');
    svg.appendChild(rect);
  } else {
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', 'M3.2 2.1L9.6 6L3.2 9.9V2.1Z');
    path.setAttribute('fill', 'currentColor');
    svg.appendChild(path);
  }
  return svg;
}

function buildVoicePill(voiceNote, voiceAudio) {
  const bars = computeWaveformHeights(voiceNote.text, 22);
  const audioSrc = `${ASSET_PREFIX}/audio/${voiceAudio.file}`;
  const audio = el('audio', { src: audioSrc, preload: 'metadata', hidden: 'hidden' });

  const barNodes = bars.map((h) => {
    const bar = el('span', { className: 'nb-speak-wave-bar', 'data-active': 'false' });
    bar.style.height = `${h}px`;
    return bar;
  });

  const btn = el('button', {
    type: 'button',
    className: 'nb-speak-voice-btn',
    'aria-label': COPY.playVoice,
  });
  btn.appendChild(makePlaySvg(false));

  const metaSpan = el(
    'span',
    { className: 'nb-speak-voice-meta' },
    `${formatShortDuration(voiceAudio.durationSec)} · ${voiceAudio.voice}`,
  );

  let playing = false;
  const setVisualState = (isPlaying, ratio) => {
    playing = isPlaying;
    btn.replaceChildren(makePlaySvg(isPlaying));
    btn.setAttribute('aria-label', isPlaying ? COPY.stopVoice : COPY.playVoice);
    const lit = isPlaying ? Math.max(1, Math.round(ratio * barNodes.length)) : 0;
    barNodes.forEach((b, idx) => b.setAttribute('data-active', idx < lit ? 'true' : 'false'));
  };

  btn.addEventListener('click', () => {
    if (playing) {
      stopActiveAudio();
      return;
    }
    stopActiveAudio();
    let disposed = false;
    const stopThis = () => {
      if (disposed) return;
      disposed = true;
      audio.pause();
      audio.currentTime = 0;
      setVisualState(false, 0);
      if (activeAudioStop === stopThis) activeAudioStop = null;
    };
    activeAudioStop = stopThis;
    setVisualState(true, 0.06);
    audio.play().catch(() => {
      stopThis();
      activeAudioStop = speech.play(voiceNote.text, voiceAudio.durationSec, (r, p) => setVisualState(p, r));
    });
  });

  audio.addEventListener('timeupdate', () => {
    const dur = audio.duration > 0 ? audio.duration : voiceAudio.durationSec;
    if (!audio.paused && dur > 0) {
      setVisualState(true, Math.max(0.05, Math.min(1, audio.currentTime / dur)));
    }
  });
  audio.addEventListener('ended', () => stopActiveAudio());

  return el(
    'div',
    { className: 'nb-speak-voice-pill', 'data-nb-speak': 'voice-note' },
    audio,
    el('div', { className: 'nb-speak-voice-top' }, btn, el('div', { className: 'nb-speak-waveform' }, barNodes), metaSpan),
    el('p', { className: 'nb-speak-voice-caption' }, voiceNote.text),
  );
}

function buildArtifactCard(art) {
  const lineCount = art.content.split('\n').length;
  const collapsible = lineCount > 14;
  let expanded = false;

  const pre = el('pre', { className: 'nb-speak-artifact-pre', 'data-expanded': 'false' }, el('code', {}, art.content));
  const copyBtn = el('button', { type: 'button', className: 'nb-speak-chip-btn' }, COPY.copy);
  copyBtn.addEventListener('click', async () => {
    if (await copyText(art.content)) {
      copyBtn.textContent = COPY.copied;
      copyBtn.setAttribute('data-copied', 'true');
      setTimeout(() => {
        copyBtn.textContent = COPY.copy;
        copyBtn.setAttribute('data-copied', 'false');
      }, 1600);
    }
  });

  const actions = el('div', { className: 'nb-speak-artifact-actions' });
  if (collapsible) {
    const expBtn = el('button', { type: 'button', className: 'nb-speak-chip-btn' }, COPY.expand(lineCount));
    expBtn.addEventListener('click', () => {
      expanded = !expanded;
      pre.setAttribute('data-expanded', expanded ? 'true' : 'false');
      expBtn.textContent = expanded ? COPY.collapse : COPY.expand(lineCount);
    });
    actions.appendChild(expBtn);
  }
  actions.appendChild(copyBtn);

  return el(
    'section',
    { className: 'nb-speak-artifact-card', 'data-nb-speak': 'artifact-card' },
    el(
      'header',
      { className: 'nb-speak-artifact-header' },
      el(
        'div',
        { className: 'nb-speak-artifact-title-wrap' },
        el('span', { className: 'nb-speak-artifact-title' }, art.title),
        el('span', { className: 'nb-speak-artifact-badge' }, (art.language || art.kind).toUpperCase()),
      ),
      actions,
    ),
    pre,
  );
}

function renderScenario(idx) {
  stopActiveAudio();
  const list = SCENARIOS[LANG];
  currentIdx = ((idx % list.length) + list.length) % list.length;
  const item = list[currentIdx];

  document.querySelectorAll('.scenario-tab').forEach((btn, i) => {
    btn.setAttribute('aria-selected', i === currentIdx ? 'true' : 'false');
  });

  const rawStream = document.getElementById('raw-stream');
  rawStream.replaceChildren(
    el('div', { className: 'user-prompt-bubble' }, item.userPrompt),
    el('div', { className: 'raw-wall-box' }, item.rawWall),
  );

  const speakStream = document.getElementById('speak-stream');
  const cluster = el(
    'div',
    { className: 'nb-speak-bubble-cluster' },
    item.sendBubbleCall.bubbles.map((text, bIdx) => {
      const b = el('div', { className: 'nb-speak-bubble', 'data-nb-speak': 'bubble' }, text);
      b.style.setProperty('--nb-bubble-idx', String(bIdx));
      return b;
    }),
    item.sendBubbleCall.voice_note ? buildVoicePill(item.sendBubbleCall.voice_note, item.voiceAudio) : null,
  );

  const turnSurface = el(
    'div',
    { className: 'nb-speak-turn-surface' },
    cluster,
    item.artifacts.map((a) => buildArtifactCard(a)),
  );

  const stepSummary = el(
    'div',
    { className: 'dsh-toolstep-pill' },
    el('span', { className: 'dsh-toolstep-dot' }),
    el(
      'span',
      { className: 'mono' },
      COPY.toolSummary(
        item.sendBubbleCall.bubbles.length,
        item.voiceAudio?.durationSec ?? 0,
        item.artifacts[0]?.title ?? '',
      ),
    ),
  );

  speakStream.replaceChildren(el('div', { className: 'user-prompt-bubble' }, item.userPrompt), stepSummary, turnSurface);

  document.getElementById('speak-foot-stat').textContent = COPY.footStat(
    item.sendBubbleCall.bubbles.length,
    item.artifacts.length,
  );
  document.getElementById('dsh-proof-badge').textContent = item.dshBadge;
  document.getElementById('dsh-proof-title').textContent = item.dshCapture.title;

  const jsonPreview = document.getElementById('stage-json-preview');
  jsonPreview.textContent = JSON.stringify(
    {
      send_bubble: item.sendBubbleCall,
      ...(item.artifacts.length ? { send_artifact: item.artifacts[0] } : {}),
    },
    null,
    2,
  );
}

function initScenarioStage() {
  const tabWrap = document.getElementById('scenario-tabs');
  SCENARIOS[LANG].forEach((sc, idx) => {
    const tab = el(
      'button',
      {
        type: 'button',
        role: 'tab',
        className: 'scenario-tab',
        'aria-selected': idx === 0 ? 'true' : 'false',
        onClick: () => renderScenario(idx),
      },
      `${idx + 1}. ${sc.label}`,
    );
    tabWrap.appendChild(tab);
  });

  document.getElementById('replay-stage-btn')?.addEventListener('click', () => renderScenario(currentIdx));
  document.getElementById('toggle-stage-json')?.addEventListener('click', () => {
    const drawer = document.getElementById('stage-json-drawer');
    if (drawer) drawer.hidden = !drawer.hidden;
  });

  renderScenario(0);
}

function initCliBuilder() {
  const actionSel = document.getElementById('cli-action');
  const profileSel = document.getElementById('cli-profile');
  const presetSel = document.getElementById('cli-preset');
  const ttsSel = document.getElementById('cli-tts');
  const preEl = document.getElementById('cli-output-code');
  const vectorEl = document.getElementById('cli-vector-stat');
  const copyBtn = document.getElementById('cli-copy-btn');

  const updateCli = () => {
    const action = actionSel.value;
    const profile = profileSel.value;
    const preset = presetSel.value;
    const tts = ttsSel.value;

    const lines = [];
    const presetArg = action === 'apply' && preset !== 'neutral_peer' ? ` --preset ${preset}` : '';
    lines.push(`npx --yes github:NB-Corp/nb-speak-dsh --${action} --profile ${profile}${presetArg}`);
    if (action === 'apply') {
      lines.push(tts === 'elevenlabs' ? `ELEVENLABS_API_KEY="xi-..." dsh ${profile}` : `dsh ${profile}`);
    }
    preEl.textContent = lines.join('\n');

    const raw = resolveRawSlidersFromConfig({ preset });
    const { weights } = computeEffectiveWeights(raw);
    vectorEl.textContent = `${COPY.vectorLabel} [${weights.map((n) => n.toFixed(2)).join(', ')}]`;
  };

  [actionSel, profileSel, presetSel, ttsSel].forEach((s) => s?.addEventListener('change', updateCli));
  copyBtn?.addEventListener('click', async () => {
    if (await copyText(preEl.textContent)) {
      copyBtn.textContent = COPY.copied;
      copyBtn.setAttribute('data-copied', 'true');
      setTimeout(() => {
        copyBtn.textContent = COPY.copy;
        copyBtn.setAttribute('data-copied', 'false');
      }, 1600);
    }
  });
  updateCli();
}

function initHeroCopy() {
  const btn = document.getElementById('hero-copy-btn');
  const cmdEl = document.getElementById('hero-cmd-text');
  btn?.addEventListener('click', async () => {
    if (await copyText(cmdEl.textContent.trim())) {
      const labelEl = btn.querySelector('[data-copy-label]');
      if (labelEl) labelEl.textContent = COPY.copied;
      btn.setAttribute('data-copied', 'true');
      setTimeout(() => {
        if (labelEl) labelEl.textContent = COPY.copy;
        btn.setAttribute('data-copied', 'false');
      }, 1600);
    }
  });
}

function initLightbox() {
  const backdrop = document.getElementById('dsh-lightbox');
  const imgEl = document.getElementById('lightbox-img');
  const titleEl = document.getElementById('lightbox-title');
  const tabsEl = document.getElementById('lightbox-tabs');
  const closeBtn = document.getElementById('lightbox-close');

  const shots = [
    {
      file: LANG === 'zh' ? 'dsh-hero-showcase-zh.png' : 'dsh-hero-showcase.png',
      label: LANG === 'zh' ? '全局双实例总览' : 'Dual-Instance Overview',
      title: COPY.heroShowcaseTitle,
    },
    ...SCENARIOS[LANG].map((s) => ({
      file: s.dshCapture.file,
      label: s.label,
      title: s.dshCapture.title,
    })),
  ];

  const showShot = (sIdx) => {
    const shot = shots[sIdx] || shots[0];
    imgEl.src = `${ASSET_PREFIX}/${shot.file}`;
    imgEl.alt = shot.title;
    titleEl.textContent = shot.title;
    tabsEl.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-selected', i === sIdx ? 'true' : 'false'));
  };

  shots.forEach((shot, i) => {
    tabsEl.appendChild(
      el(
        'button',
        {
          type: 'button',
          className: 'scenario-tab',
          'aria-selected': i === 0 ? 'true' : 'false',
          onClick: () => showShot(i),
        },
        shot.label,
      ),
    );
  });

  const openAt = (shotIdx) => {
    showShot(shotIdx);
    backdrop.hidden = false;
    closeBtn.focus();
  };

  document.getElementById('open-stage-dsh-btn')?.addEventListener('click', () => openAt(currentIdx + 1));
  document.getElementById('dsh-proof-open-btn')?.addEventListener('click', () => openAt(0));
  closeBtn?.addEventListener('click', () => {
    backdrop.hidden = true;
  });
  backdrop?.addEventListener('click', (ev) => {
    if (ev.target === backdrop) backdrop.hidden = true;
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && backdrop && !backdrop.hidden) backdrop.hidden = true;
  });
}

initHeroCopy();
initScenarioStage();
initCliBuilder();
initLightbox();
