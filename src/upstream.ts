import type { DshRuntimeMode } from './weights.ts';

export interface ResolvedUpstreamConnection {
  readonly mode: DshRuntimeMode;
  readonly cloudBaseUrl: string;
  readonly cloudApiKey: string;
  readonly defaultCloudModel: string;
  readonly voiceModelBaseUrl: string;
  readonly voiceModelApiKey: string;
  readonly defaultVoiceModel: string;
}

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

function trimUrl(url: string | undefined): string {
  return String(url ?? '').trim().replace(/\/+$/, '');
}

export function resolveCompletionsUrl(baseUrl: string): string {
  const clean = trimUrl(baseUrl);
  if (!clean) return '';
  if (clean.endsWith('/chat/completions')) return clean;
  if (clean.endsWith('/v1')) return `${clean}/chat/completions`;
  return `${clean}/v1/chat/completions`;
}

export function resolveActiveEndpointUrl(cfg: ResolvedUpstreamConnection): string {
  if (cfg.mode === 'voice-model' && cfg.voiceModelBaseUrl) {
    return resolveCompletionsUrl(cfg.voiceModelBaseUrl);
  }
  return resolveCompletionsUrl(cfg.cloudBaseUrl);
}

export async function queryUpstreamHealth(
  cfg: ResolvedUpstreamConnection,
  fetchImpl: FetchLike = fetch,
): Promise<{ readonly configured: boolean; readonly ok: boolean; readonly mode: DshRuntimeMode; readonly status: number }> {
  const base = cfg.mode === 'voice-model' && cfg.voiceModelBaseUrl ? cfg.voiceModelBaseUrl : cfg.cloudBaseUrl;
  const clean = trimUrl(base);
  if (!clean) {
    return { configured: false, ok: false, mode: cfg.mode, status: 0 };
  }
  const modelsUrl = clean.endsWith('/v1') ? `${clean}/models` : `${clean}/v1/models`;
  const apiKey = cfg.mode === 'voice-model' ? (cfg.voiceModelApiKey || cfg.cloudApiKey) : cfg.cloudApiKey;
  try {
    const headers: Record<string, string> = {};
    if (apiKey) headers.authorization = `Bearer ${apiKey}`;
    const res = await fetchImpl(modelsUrl, { method: 'GET', headers });
    return { configured: true, ok: res.ok, mode: cfg.mode, status: res.status };
  } catch {
    return { configured: true, ok: false, mode: cfg.mode, status: 0 };
  }
}

export async function dispatchUpstreamChatCompletions(options: {
  readonly cfg: ResolvedUpstreamConnection;
  readonly payload: Record<string, unknown>;
  readonly fetchImpl?: FetchLike;
  readonly signal?: AbortSignal;
}): Promise<Response> {
  const { cfg, payload, fetchImpl = fetch, signal } = options;
  const endpointUrl = resolveActiveEndpointUrl(cfg);
  if (!endpointUrl) {
    const err = new Error(
      'nb-speak DSH upstream endpoint is unconfigured: set cloudBaseUrl (Mode A: skill) or voiceModelBaseUrl (Mode B: voice-model).',
    );
    (err as Error & { code?: string }).code = 'UPSTREAM_UNCONFIGURED';
    throw err;
  }

  const apiKey = cfg.mode === 'voice-model' ? (cfg.voiceModelApiKey || cfg.cloudApiKey) : cfg.cloudApiKey;
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: payload.stream ? 'text/event-stream, application/json' : 'application/json',
  };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;

  return fetchImpl(endpointUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal,
  });
}
