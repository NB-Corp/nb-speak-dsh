import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { Socket } from 'node:net';
import {
  ADVERTISED_DSH_MODELS,
  BubbleStreamFormatter,
  formatCompleteBubbleText,
  resolveUpstreamModelSpec,
  type BubbleJoinMode,
  type DshPersonaPresetId,
  type StyleSliderConfig,
} from './weights.ts';
import {
  buildToolRemapTable,
  remapMessagesToUpstream,
  restoreOpenAIToolCalls,
  type OpenAIFunctionTool,
  type OpenAIMessage,
  type OpenAIToolCall,
} from './tool-remap.ts';
import {
  dispatchUpstreamChatCompletions,
  queryUpstreamHealth,
  type FetchLike,
  type ResolvedUpstreamConnection,
} from './upstream.ts';

const SPEAK_USER_TOOLS: readonly OpenAIFunctionTool[] = [
  {
    type: 'function',
    function: {
      name: 'send_message',
      description:
        'Deliver 1-4 short thumb-typed IM chat bubbles to the human user (with optional complementary voice_note on the final bubble). Always use this instead of raw Markdown prose when replying to the human user. Do NOT use this for subagents; use agent_send_message for subagents.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['bubbles'],
        properties: {
          bubbles: {
            type: 'array',
            minItems: 1,
            maxItems: 4,
            description:
              'Ordered 1-4 short chat bubbles (4-28 CJK chars or 4-22 English words each). Default to 1-2 crisp bubbles; omit trailing periods on short single-clause lines; never embed Markdown headers, bullet lists, tables, or code fences inside bubbles.',
            items: { type: 'string', minLength: 1 },
          },
          voice_note: {
            type: 'object',
            additionalProperties: false,
            required: ['text'],
            properties: {
              text: {
                type: 'string',
                description:
                  'Optional spoken aside after the final bubble (4-10s). Never read the text bubble aloud; spell numbers in spoken words.',
              },
              emotion: {
                type: 'string',
                enum: ['neutral', 'warm', 'calm', 'dry', 'relieved', 'playful', 'serious'],
              },
            },
          },
          reply_to: { type: 'string' },
          end_turn: { type: 'boolean', default: true },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_artifact',
      description:
        'Offload essential shell commands, multi-line code, SQL queries, unified diffs, or Markdown comparison tables as a clean copyable card outside narrow chat bubbles. Always call send_message alongside send_artifact in the same turn, and keep artifact content minimal and pure (no tutorial comment walls or unrequested variants).',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'kind', 'content'],
        properties: {
          title: {
            type: 'string',
            description: 'Concise filename or card title (e.g. "start-bridge.sh", "orders-keyset.sql", "ttl_lru_cache.py").',
          },
          kind: { type: 'string', enum: ['code', 'markdown', 'diff', 'table'] },
          language: {
            type: 'string',
            description: 'Language tag when kind is code or diff (e.g. "bash", "sql", "python", "ts").',
          },
          content: {
            type: 'string',
            description:
              'Minimal, clean runnable code, command, SQL query, unified diff, or Markdown table. Do NOT stuff prose explanations, multi-option tutorials, or comment walls inside code comments.',
          },
        },
      },
    },
  },
];

const PERSONA_LAYER_TEXT: Readonly<Record<Exclude<DshPersonaPresetId, 'custom'>, string>> = {
  neutral_peer:
    'Speak as an equal-footing engineering peer: concise, direct, relaxed, concrete live facts, zero corporate servility or unsolicited lectures.',
  sharp_lead:
    'Speak as a sharp, candid tech lead: lead with the ship/hold verdict or root cause, keep wit dry, and push all commands/patches to send_artifact.',
  warm_companion:
    'Speak as an attentive everyday companion texting from a phone: natural spoken rhythm, genuine care, zero RPG stage brackets (*sighs*) or robotic nanny checklists.',
  calm_sre:
    'Speak as a calm on-call SRE peer: state root cause, live impact, and immediate safe action in 1-2 short bubbles and put exact SQL/commands in send_artifact.',
};

const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g;
const EN_WORD_RE = /[A-Za-z0-9]+(?:'[A-Za-z0-9]+)?/g;

function sanitizeBubbleLine(raw: string): string {
  let s = raw.trim().replace(/^(?:Bubble|Beat|气泡)\s*[1-9]\s*[:：]\s*/i, '').trim();
  if (!s) return '';
  const cjkCount = (s.match(CJK_RE) ?? []).length;
  const enCount = (s.replace(CJK_RE, ' ').match(EN_WORD_RE) ?? []).length;
  const hasInternalSentenceStop = /[。！？!?；;\n]/.test(s.slice(0, -1));
  if (!hasInternalSentenceStop) {
    if (s.endsWith('。') && cjkCount > 0 && cjkCount <= 26 && enCount <= 6) {
      s = s.slice(0, -1).trim();
    } else if (
      s.endsWith('.') &&
      !s.endsWith('..') &&
      !/\b(?:etc|e\.g|i\.e|vs|mr|mrs|ms|dr|st|a\.m|p\.m)\.$/i.test(s) &&
      cjkCount === 0 &&
      enCount > 0 &&
      enCount <= 14
    ) {
      s = s.slice(0, -1).trim();
    }
  }
  return s;
}

function buildSkillSystemLayer(personaId: Exclude<DshPersonaPresetId, 'custom'>, customSoul?: string): string {
  const voice = customSoul?.trim() ? customSoul.trim() : PERSONA_LAYER_TEXT[personaId];
  return [
    '# nb-speak · DSH Mode A (chat-human + send_message)',
    '- When workspace inspection, file edits, or shell checks are needed (`read`, `glob`, `grep`, `edit`, `write`, `pwsh`, `todo_write`, etc.), invoke those workspace tools directly first without filler commentary.',
    '- Deliver EVERY reply to the human user by calling `send_message({ bubbles, voice_note, end_turn: true })` instead of raw assistant Markdown prose (earlier assistant messages in history appear already unwrapped as paragraphs — still call `send_message` on every new user-facing reply).',
    '- Bubble physics: default to 1-2 short thumb-typed IM bubbles (max 4; 4-28 CJK chars or 4-22 English words per bubble). Omit trailing periods (`。` / `.`) on short single-clause lines. Never put `###` headers, bullet/numbered lists, Markdown tables, or code fences inside `bubbles`.',
    '- Offload shell commands, multi-line code, SQL queries, unified diffs, or comparison tables via `send_artifact({ title, kind, language, content })` PAIRED with `send_message` in the same final response (never call `send_artifact` alone without `send_message`). Keep `send_artifact` content tight and essential — only the clean runnable command/SQL/code the user asked for, never 30-line comment essays or unrequested appendices.',
    '- Ban RPG stage brackets (`*sighs*`, `（叹气）`, `(笑)`), decorative emojis/kaomoji unless invited, subordinate concierge clichés (`向你汇报`, `希望这能帮到你`, `如有需要请随时告诉我`, `Let me know if you need anything`), and unrequested risk lectures.',
    '- Subagent safety: never call `send_message` for subagents; use `agent_send_message` for subagent orchestration.',
    `- Voice & Persona: If an explicit character or relationship persona is already defined above in the system prompt, stay 100% faithful to that character voice and relationship while strictly obeying the IM bubble & \`send_artifact\` rules; otherwise ${voice}`,
  ].join('\n');
}

function injectSkillSystemPrompt(
  messages: readonly OpenAIMessage[],
  personaId: Exclude<DshPersonaPresetId, 'custom'>,
  customSoul?: string,
): OpenAIMessage[] {
  const block = buildSkillSystemLayer(personaId, customSoul);
  const first = messages[0];
  if (
    first &&
    (first.role === 'system' || first.role === 'developer') &&
    typeof first.content === 'string'
  ) {
    if (first.content.includes('nb-speak · DSH Mode A')) return [...messages];
    return [{ ...first, content: `${first.content}\n\n${block}` }, ...messages.slice(1)];
  }
  return [{ role: 'system', content: block }, ...messages];
}

interface ExtractedUserSpeak {
  readonly hasSpeak: boolean;
  readonly renderedContent: string;
  readonly renderedParts: string[];
  readonly bubbles: string[];
  readonly artifacts: Array<{ title: string; kind: string; language?: string; content: string }>;
  readonly voiceNote?: { text: string; emotion?: string };
  readonly passthroughToolCalls: OpenAIToolCall[];
}

function formatArtifactBlock(art: { title: string; kind: string; language?: string; content: string }): string {
  const cleanTitle = art.title.trim() || 'artifact';
  if (art.kind === 'table' || art.kind === 'markdown') {
    return `**\`${cleanTitle}\`**\n\n${art.content}`;
  }
  const lang = art.language ?? (art.kind === 'diff' ? 'diff' : '');
  return `**\`${cleanTitle}\`**\n\`\`\`${lang}\n${art.content}\n\`\`\``;
}

function extractUserSpeakFromToolCalls(toolCalls: readonly OpenAIToolCall[] | undefined): ExtractedUserSpeak {
  const bubbles: string[] = [];
  const artifacts: Array<{ title: string; kind: string; language?: string; content: string }> = [];
  let voiceNote: { text: string; emotion?: string } | undefined;
  const passthroughToolCalls: OpenAIToolCall[] = [];

  for (const tc of toolCalls ?? []) {
    const fnName = tc.function?.name;
    const rawArgs = tc.function?.arguments ?? '';
    if (fnName === 'send_message') {
      try {
        const parsed = JSON.parse(rawArgs) as Record<string, unknown>;
        if (Array.isArray(parsed.bubbles)) {
          for (const b of parsed.bubbles) {
            const s = sanitizeBubbleLine(String(b ?? ''));
            if (s) bubbles.push(s);
          }
          if (typeof parsed.voice_note === 'object' && parsed.voice_note !== null) {
            const vn = parsed.voice_note as Record<string, unknown>;
            const vnText = String(vn.text ?? '').trim();
            if (vnText) {
              voiceNote = { text: vnText, ...(typeof vn.emotion === 'string' ? { emotion: vn.emotion } : {}) };
            }
          }
          continue;
        }
      } catch {
        // Not a valid nb-speak user bubble call; fall through
      }
    } else if (fnName === 'send_artifact') {
      try {
        const parsed = JSON.parse(rawArgs) as Record<string, unknown>;
        const content = String(parsed.content ?? '').replace(/^\r?\n+|\s+$/g, '');
        if (content) {
          artifacts.push({
            title: String(parsed.title ?? 'artifact'),
            kind: String(parsed.kind ?? 'code'),
            ...(typeof parsed.language === 'string' && parsed.language.trim() ? { language: parsed.language.trim() } : {}),
            content,
          });
          continue;
        }
      } catch {
        // Fall through
      }
    }
    passthroughToolCalls.push(tc);
  }

  const renderedParts: string[] = [];
  for (const b of bubbles) renderedParts.push(b);
  for (const art of artifacts) renderedParts.push(formatArtifactBlock(art));
  if (voiceNote) {
    renderedParts.push(`> [Voice Note${voiceNote.emotion ? ` · ${voiceNote.emotion}` : ''}] ${voiceNote.text}`);
  }

  return {
    hasSpeak: bubbles.length > 0 || artifacts.length > 0 || Boolean(voiceNote),
    renderedContent: renderedParts.join('\n\n'),
    renderedParts,
    bubbles,
    artifacts,
    voiceNote,
    passthroughToolCalls,
  };
}

function extractIncomingBearer(req: IncomingMessage): string {
  const auth = req.headers.authorization;
  if (typeof auth !== 'string') return '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim() ?? '';
  if (!token || token === 'unused' || token === 'nb-speak-local' || token === 'dummy' || token === 'none') {
    return '';
  }
  return token;
}

function normalizeRestoredStreamToolCalls(calls: readonly OpenAIToolCall[] | undefined): OpenAIToolCall[] | undefined {
  if (!calls || calls.length === 0) return undefined;
  return calls.map((tc, idx) => ({
    index: idx,
    id: tc.id && tc.id.trim() ? tc.id : `call_dsh_${idx + 1}`,
    type: tc.type || 'function',
    function: {
      name: tc.function?.name ?? '',
      arguments: tc.function?.arguments ?? '{}',
    },
  }));
}

export interface BridgeRuntimeStateProvider {
  readonly getSliderConfig: () => StyleSliderConfig;
  readonly getUpstreamConnection: () => Promise<ResolvedUpstreamConnection>;
  readonly getBubbleJoinMode: () => BubbleJoinMode;
  readonly getCustomSoul?: () => string | undefined;
  readonly fetchImpl?: FetchLike;
}

export interface RunningBridgeServer {
  readonly server: Server;
  readonly host: string;
  readonly port: number;
  readonly baseUrl: string;
  readonly close: () => Promise<void>;
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': String(body.byteLength),
  });
  res.end(body);
}

async function readJsonBody(req: IncomingMessage, maxBytes = 8 * 1024 * 1024): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.byteLength;
    if (total > maxBytes) {
      const err = new Error('Request body exceeds 8 MiB limit');
      (err as Error & { status?: number }).status = 413;
      throw err;
    }
    chunks.push(buf);
  }
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Request JSON body must be an object');
  }
  return parsed as Record<string, unknown>;
}

export async function startDshOpenAiBridge(options: {
  readonly host?: string;
  readonly port: number;
  readonly state: BridgeRuntimeStateProvider;
}): Promise<RunningBridgeServer> {
  const host = options.host ?? '127.0.0.1';
  const { state } = options;
  const sockets = new Set<Socket>();

  const server = createServer(async (req, res) => {
    const urlPath = (req.url ?? '/').split('?', 1)[0] ?? '/';

    if (req.method === 'GET' && (urlPath === '/health' || urlPath === '/status')) {
      const sliderCfg = state.getSliderConfig();
      const conn = await state.getUpstreamConnection();
      const resolved = resolveUpstreamModelSpec(
        undefined,
        sliderCfg,
        conn.mode,
        conn.defaultCloudModel,
        conn.defaultVoiceModel,
      );
      const health = await queryUpstreamHealth(conn, state.fetchImpl);
      sendJson(res, 200, {
        status: 'ok',
        runtimeMode: conn.mode,
        activeModel: resolved.upstreamModel,
        persona: resolved.personaId,
        weights: resolved.weights,
        upstream: health,
      });
      return;
    }

    if (req.method === 'GET' && urlPath === '/v1/models') {
      sendJson(res, 200, {
        object: 'list',
        data: ADVERTISED_DSH_MODELS.map((m) => ({
          id: m.id,
          object: 'model',
          created: 1763200000,
          owned_by: 'nb-corp',
          description: m.description,
        })),
      });
      return;
    }

    if (req.method !== 'POST' || urlPath !== '/v1/chat/completions') {
      sendJson(res, 404, { error: { message: `Unsupported endpoint: ${urlPath}`, code: 'not_found' } });
      return;
    }

    let reqBody: Record<string, unknown>;
    try {
      reqBody = await readJsonBody(req);
    } catch (err) {
      sendJson(res, (err as { status?: number })?.status ?? 400, {
        error: { message: err instanceof Error ? err.message : String(err), code: 'bad_request' },
      });
      return;
    }

    const reqAbort = new AbortController();
    const onClose = () => {
      if (!res.writableEnded) reqAbort.abort(new Error('client_disconnected'));
    };
    res.on('close', onClose);

    try {
      const sliderCfg = state.getSliderConfig();
      const bubbleMode = state.getBubbleJoinMode();
      const rawConn = await state.getUpstreamConnection();
      const incomingBearer = extractIncomingBearer(req);
      const conn: ResolvedUpstreamConnection =
        !rawConn.cloudApiKey && incomingBearer
          ? { ...rawConn, cloudApiKey: incomingBearer, voiceModelApiKey: rawConn.voiceModelApiKey || incomingBearer }
          : rawConn;

      const requestedModel = typeof reqBody.model === 'string' ? reqBody.model : undefined;
      const { upstreamModel, personaId } = resolveUpstreamModelSpec(
        requestedModel,
        sliderCfg,
        conn.mode,
        conn.defaultCloudModel,
        conn.defaultVoiceModel,
      );

      // Step 1: Remap DSH internal colliding tools (`send_message` -> `agent_send_message`)
      const rawTools = Array.isArray(reqBody.tools) ? reqBody.tools : undefined;
      const remapTable = buildToolRemapTable(rawTools);
      const rawMessages = Array.isArray(reqBody.messages) ? (reqBody.messages as OpenAIMessage[]) : [];
      let mappedMessages = remapMessagesToUpstream(rawMessages, remapTable);

      // Step 2: In Mode A (`skill`), inject `chat-human` system layer + `send_message` & `send_artifact` user tools
      let outgoingTools: readonly OpenAIFunctionTool[] | undefined =
        rawTools !== undefined ? remapTable.tools : undefined;
      if (conn.mode === 'skill') {
        mappedMessages = injectSkillSystemPrompt(mappedMessages, personaId, state.getCustomSoul?.());
        outgoingTools = [...remapTable.tools, ...SPEAK_USER_TOOLS];
      }

      const stream = Boolean(reqBody.stream);
      const upstreamPayload: Record<string, unknown> = {
        ...reqBody,
        model: upstreamModel,
        messages: mappedMessages,
        stream,
      };
      if (outgoingTools !== undefined && outgoingTools.length > 0) {
        upstreamPayload.tools = outgoingTools;
      }

      const upstreamRes = await dispatchUpstreamChatCompletions({
        cfg: conn,
        payload: upstreamPayload,
        fetchImpl: state.fetchImpl,
        signal: reqAbort.signal,
      });

      if (!upstreamRes.ok) {
        const errText = await upstreamRes.text().catch(() => '');
        sendJson(res, upstreamRes.status, {
          error: { message: `Upstream returned HTTP ${upstreamRes.status}: ${errText.slice(0, 260)}` },
        });
        return;
      }

      const contentType = String(upstreamRes.headers.get('content-type') ?? '').toLowerCase();
      if (!stream || !contentType.includes('text/event-stream') || !upstreamRes.body) {
        const json = (await upstreamRes.json()) as Record<string, unknown>;
        const choices = Array.isArray(json.choices) ? json.choices : [];
        let speakMeta: Record<string, unknown> | undefined;

        const rewrittenChoices = choices.map((c) => {
          if (typeof c !== 'object' || c === null) return c;
          const choice = c as Record<string, unknown>;
          const message =
            typeof choice.message === 'object' && choice.message !== null
              ? { ...(choice.message as Record<string, unknown>) }
              : undefined;
          if (message) {
            const existingContent = typeof message.content === 'string'
              ? formatCompleteBubbleText(message.content, bubbleMode)
              : '';
            const rawCalls = Array.isArray(message.tool_calls) ? (message.tool_calls as OpenAIToolCall[]) : undefined;

            if (conn.mode === 'skill' && rawCalls && rawCalls.length > 0) {
              const extracted = extractUserSpeakFromToolCalls(rawCalls);
              if (extracted.hasSpeak) {
                message.content = [existingContent, extracted.renderedContent].filter(Boolean).join('\n\n');
                speakMeta = {
                  bubbles: extracted.bubbles,
                  artifacts: extracted.artifacts,
                  ...(extracted.voiceNote ? { voice_note: extracted.voiceNote } : {}),
                };
              }
              const restoredSubagent = restoreOpenAIToolCalls(extracted.passthroughToolCalls, remapTable);
              if (restoredSubagent && restoredSubagent.length > 0) {
                message.tool_calls = restoredSubagent;
              } else {
                delete message.tool_calls;
                if (choice.finish_reason === 'tool_calls') {
                  return { ...choice, finish_reason: 'stop', message };
                }
              }
            } else {
              if (typeof message.content === 'string') {
                message.content = existingContent;
              }
              if (rawCalls) {
                message.tool_calls = restoreOpenAIToolCalls(rawCalls, remapTable);
              }
            }
          }
          return { ...choice, ...(message ? { message } : {}) };
        });

        sendJson(res, 200, {
          ...json,
          choices: rewrittenChoices,
          ...(speakMeta ? { nb_speak: speakMeta } : {}),
        });
        return;
      }

      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });

      const reader = upstreamRes.body.getReader();
      const decoder = new TextDecoder();
      const bubbleFormatter = new BubbleStreamFormatter(bubbleMode);
      const bufferedSkillCalls = new Map<number, { id: string; name: string; arguments: string }>();
      let sseBuffer = '';
      let streamId = 'chatcmpl-nb-speak';
      let streamModel = requestedModel ?? upstreamModel;
      let streamCreated = Math.floor(Date.now() / 1000);
      let upstreamFinishReason: string | null = null;
      let lastUsage: unknown;
      let streamedPlainContent = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split(/\r?\n/);
        sseBuffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (trimmed.startsWith(':')) {
            res.write(`${trimmed}\n\n`);
            continue;
          }
          if (!trimmed.startsWith('data:')) continue;
          const dataStr = trimmed.slice(5).trim();
          if (dataStr === '[DONE]') continue;

          try {
            const chunkObj = JSON.parse(dataStr) as Record<string, unknown>;
            if (typeof chunkObj.id === 'string' && chunkObj.id) streamId = chunkObj.id;
            if (typeof chunkObj.model === 'string' && chunkObj.model) streamModel = chunkObj.model;
            if (typeof chunkObj.created === 'number') streamCreated = chunkObj.created;
            if (chunkObj.usage !== undefined && chunkObj.usage !== null) lastUsage = chunkObj.usage;

            if (conn.mode === 'skill') {
              let shouldEmitLiveChunk = false;
              if (Array.isArray(chunkObj.choices)) {
                chunkObj.choices = chunkObj.choices.map((c) => {
                  if (typeof c !== 'object' || c === null) return c;
                  const choice = { ...(c as Record<string, unknown>) };
                  if (typeof choice.finish_reason === 'string' && choice.finish_reason) {
                    upstreamFinishReason = choice.finish_reason;
                  }
                  choice.finish_reason = null;

                  if (typeof choice.delta === 'object' && choice.delta !== null) {
                    const delta = { ...(choice.delta as Record<string, unknown>) };
                    if (typeof delta.content === 'string' && delta.content.length > 0) {
                      delta.content = bubbleFormatter.push(delta.content);
                      streamedPlainContent += delta.content;
                      shouldEmitLiveChunk = true;
                    }
                    if (
                      (typeof delta.reasoning_content === 'string' && delta.reasoning_content.length > 0) ||
                      (typeof delta.reasoning === 'string' && delta.reasoning.length > 0) ||
                      (typeof delta.reasoning_text === 'string' && delta.reasoning_text.length > 0) ||
                      (Array.isArray(delta.reasoning_details) && delta.reasoning_details.length > 0)
                    ) {
                      shouldEmitLiveChunk = true;
                    }
                    if (Array.isArray(delta.tool_calls)) {
                      delta.tool_calls.forEach((rawTc, idx) => {
                        if (typeof rawTc !== 'object' || rawTc === null) return;
                        const tc = rawTc as OpenAIToolCall;
                        const slotIdx = typeof tc.index === 'number' ? tc.index : idx;
                        const cur = bufferedSkillCalls.get(slotIdx) ?? { id: '', name: '', arguments: '' };
                        if (tc.id) cur.id = tc.id;
                        if (tc.function?.name) cur.name += tc.function.name;
                        if (tc.function?.arguments) cur.arguments += tc.function.arguments;
                        bufferedSkillCalls.set(slotIdx, cur);
                      });
                      delete delta.tool_calls;
                    }
                    choice.delta = delta;
                  }
                  return choice;
                });
              }
              if (shouldEmitLiveChunk) {
                const liveChunk = { ...chunkObj };
                delete liveChunk.usage;
                res.write(`data: ${JSON.stringify(liveChunk)}\n\n`);
              }
              continue;
            }

            if (Array.isArray(chunkObj.choices)) {
              chunkObj.choices = chunkObj.choices.map((c) => {
                if (typeof c !== 'object' || c === null) return c;
                const choice = { ...(c as Record<string, unknown>) };
                if (typeof choice.delta === 'object' && choice.delta !== null) {
                  const delta = { ...(choice.delta as Record<string, unknown>) };
                  if (typeof delta.content === 'string' && delta.content.length > 0) {
                    delta.content = bubbleFormatter.push(delta.content);
                  }
                  if (Array.isArray(delta.tool_calls)) {
                    delta.tool_calls = restoreOpenAIToolCalls(delta.tool_calls as OpenAIToolCall[], remapTable);
                  }
                  choice.delta = delta;
                }
                return choice;
              });
            }
            res.write(`data: ${JSON.stringify(chunkObj)}\n\n`);
          } catch {
            res.write(`data: ${dataStr}\n\n`);
          }
        }
      }

      if (conn.mode === 'skill') {
        const assembled: OpenAIToolCall[] = [...bufferedSkillCalls.entries()]
          .sort(([a], [b]) => a - b)
          .map(([, slot], idx) => ({
            id: slot.id || `call_speak_${idx + 1}`,
            type: 'function',
            function: { name: slot.name, arguments: slot.arguments },
          }));
        const extracted = extractUserSpeakFromToolCalls(assembled);
        const restoredPassthrough = normalizeRestoredStreamToolCalls(
          restoreOpenAIToolCalls(extracted.passthroughToolCalls, remapTable),
        );

        if (extracted.renderedParts.length > 0) {
          extracted.renderedParts.forEach((part, idx) => {
            const prefix = idx === 0 ? (streamedPlainContent.trim().length > 0 ? '\n\n' : '') : '\n\n';
            const isLastPart = idx === extracted.renderedParts.length - 1;
            const contentChunk: Record<string, unknown> = {
              id: streamId,
              object: 'chat.completion.chunk',
              created: streamCreated,
              model: streamModel,
              choices: [
                {
                  index: 0,
                  delta: { ...(idx === 0 && !streamedPlainContent ? { role: 'assistant' } : {}), content: `${prefix}${part}` },
                  finish_reason: null,
                },
              ],
              ...(isLastPart
                ? {
                    nb_speak: {
                      bubbles: extracted.bubbles,
                      artifacts: extracted.artifacts,
                      ...(extracted.voiceNote ? { voice_note: extracted.voiceNote } : {}),
                    },
                  }
                : {}),
            };
            res.write(`data: ${JSON.stringify(contentChunk)}\n\n`);
          });
        }

        if (restoredPassthrough && restoredPassthrough.length > 0) {
          const toolChunk = {
            id: streamId,
            object: 'chat.completion.chunk',
            created: streamCreated,
            model: streamModel,
            choices: [
              {
                index: 0,
                delta: { tool_calls: restoredPassthrough },
                finish_reason: null,
              },
            ],
          };
          res.write(`data: ${JSON.stringify(toolChunk)}\n\n`);
        }

        const finalFinishReason =
          restoredPassthrough && restoredPassthrough.length > 0
            ? 'tool_calls'
            : extracted.hasSpeak
              ? 'stop'
              : (upstreamFinishReason ?? 'stop');

        const closingChunk: Record<string, unknown> = {
          id: streamId,
          object: 'chat.completion.chunk',
          created: streamCreated,
          model: streamModel,
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: finalFinishReason,
            },
          ],
          ...(lastUsage !== undefined ? { usage: lastUsage } : {}),
        };
        res.write(`data: ${JSON.stringify(closingChunk)}\n\n`);
      }

      res.write('data: [DONE]\n\n');
      res.end();
    } catch (err) {
      if (!res.headersSent) {
        sendJson(res, 502, { error: { message: err instanceof Error ? err.message : String(err) } });
      } else if (!res.writableEnded) {
        res.end();
      }
    } finally {
      res.off('close', onClose);
    }
  });

  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const addr = server.address();
  const actualPort = typeof addr === 'object' && addr !== null ? addr.port : options.port;
  let closed = false;
  return {
    server,
    host,
    port: actualPort,
    baseUrl: `http://${host}:${actualPort}/v1`,
    close: async () => {
      if (closed) return;
      closed = true;
      for (const s of sockets) s.destroy();
      sockets.clear();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
