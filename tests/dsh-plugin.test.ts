import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  BUDGET_LIMIT,
  BubbleStreamFormatter,
  computeEffectiveWeights,
  formatCompleteBubbleText,
  resolveUpstreamModelSpec,
} from '../src/weights.ts';
import {
  buildToolRemapTable,
  remapMessagesToUpstream,
  restoreOpenAIToolCalls,
  restoreToolNameFromUpstream,
} from '../src/tool-remap.ts';
import { startDshOpenAiBridge } from '../src/http-bridge.ts';
import {
  createSendArtifactToolDefinition,
  createSendBubbleToolDefinition,
} from '../src/dsh-tools.ts';
import {
  createVoiceNoteSynthesizer,
  prepareElevenLabsMandarinText,
  resolveElevenLabsVoiceId,
} from '../src/tts.ts';
import {
  computeWaveformHeights,
  NB_SPEAK_TURN_DATA_KEY,
  nbSpeakTurnDefinition,
  parsePipeTable,
} from '../src/client-model.ts';
import { apply as applyPlugin } from '../src/plugin.ts';
import { parseCliArgs, PLUGIN_ROOT, runInstaller } from '../scripts/install-dsh.mjs';

test('5-axis universal weight normalization & skill vs voice-model resolution', () => {
  const projected = computeEffectiveWeights([1.0, 0.8, 0.8, 0.4, 0.3]);
  assert.equal(projected.isClamped, true);
  assert.equal(projected.weights[0], 1.0);
  const filterSum = projected.weights[1] + projected.weights[2] + projected.weights[3] + projected.weights[4];
  assert.ok(filterSum <= BUDGET_LIMIT + 1e-6);
  assert.ok(filterSum > 1.13);

  const cloudSpec = resolveUpstreamModelSpec('nb-speak:sre', {}, 'skill', 'deepseek-chat');
  assert.equal(cloudSpec.upstreamModel, 'deepseek-chat');
  assert.equal(cloudSpec.personaId, 'calm_sre');

  const voiceSpec = resolveUpstreamModelSpec(
    'nb-speak-voice-4b:warm',
    {},
    'voice-model',
    'deepseek-chat',
    'nb-speak-voice-v1',
  );
  assert.equal(voiceSpec.upstreamModel, 'nb-speak-voice-4b|1.000,0.750,0.200,0.150,0.050');
  assert.equal(voiceSpec.personaId, 'warm_companion');
});

test('BubbleStreamFormatter expands spoken newlines and preserves code fences intact', () => {
  const raw = [
    'Canary metrics held steady for 25m',
    'p99 latency dropped to 38ms',
    '```sql',
    'SELECT count(*) FROM active_sessions;',
    '```',
    'Ready to push 100%',
  ].join('\n');

  const fmt = new BubbleStreamFormatter('paragraph');
  let streamed = '';
  for (let i = 0; i < raw.length; i += 5) {
    streamed += fmt.push(raw.slice(i, i + 5));
  }
  assert.ok(streamed.includes('Canary metrics held steady for 25m\n\np99 latency dropped to 38ms'));
  assert.ok(streamed.includes('```sql\nSELECT count(*) FROM active_sessions;\n```'));
  assert.equal(formatCompleteBubbleText(raw, 'paragraph'), streamed.trim());
});

test('DSH subagent send_message <-> agent_send_message disambiguation leaves unrelated tools untouched', () => {
  const table = buildToolRemapTable([
    { type: 'function', function: { name: 'send_message', description: 'DSH Subagent message', parameters: { type: 'object' } } },
    { type: 'function', function: { name: 'nb_search', description: 'NB Search', parameters: { type: 'object' } } },
    { type: 'function', function: { name: 'web_fetch', description: 'Fetch URL', parameters: { type: 'object' } } },
  ]);
  assert.deepEqual(
    table.tools.map((t) => t.function.name),
    ['agent_send_message', 'nb_search', 'web_fetch'],
  );

  const remapped = remapMessagesToUpstream(
    [
      {
        role: 'assistant',
        content: null,
        tool_calls: [{ id: 'tc1', type: 'function', function: { name: 'send_message', arguments: '{"to":"worker_1"}' } }],
      },
    ],
    table,
  );
  assert.equal(remapped[0]?.tool_calls?.[0]?.function?.name, 'agent_send_message');
  assert.equal(restoreToolNameFromUpstream('agent_send_message', table), 'send_message');

  const restored = restoreOpenAIToolCalls(
    [{ index: 0, id: 'tc2', type: 'function', function: { name: 'agent_send_message', arguments: '{"to":"worker_1"}' } }],
    table,
  );
  assert.equal(restored?.[0]?.function?.name, 'send_message');
});

test('DSH bridge supports Mode A (JSON + multi-chunk SSE unwrapping + pure artifact fences) and Mode B (voice-model)', async () => {
  const capturedBodies: Array<Record<string, unknown>> = [];
  let currentMode: 'skill' | 'voice-model' = 'skill';
  let sseModeVariant: 'speak-only' | 'mixed-dsh-tools' = 'speak-only';

  const mockFetch = async (_url: string | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
    capturedBodies.push(body);

    if (currentMode === 'skill' && !body.stream) {
      return new Response(
        JSON.stringify({
          id: 'cmpl-skill',
          choices: [
            {
              index: 0,
              finish_reason: 'tool_calls',
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'call_sub',
                    type: 'function',
                    function: { name: 'agent_send_message', arguments: '{"to":"worker-a","text":"verify logs"}' },
                  },
                  {
                    id: 'call_user_art',
                    type: 'function',
                    function: {
                      name: 'send_artifact',
                      arguments: JSON.stringify({
                        title: 'canary.sql',
                        kind: 'code',
                        language: 'sql',
                        content: 'SELECT status, count(*) FROM canary_events GROUP BY 1;',
                      }),
                    },
                  },
                  {
                    id: 'call_user_msg',
                    type: 'function',
                    function: {
                      name: 'send_message',
                      arguments: JSON.stringify({
                        bubbles: ['Asked worker-a to double-check shard logs.', 'Canary SQL is in the card.'],
                        end_turn: false,
                      }),
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }

    if (currentMode === 'skill' && body.stream) {
      const sseChunks =
        sseModeVariant === 'speak-only'
          ? [
              {
                id: 'cmpl-sse-speak',
                model: 'cmd/deepseek-v4.1-flash',
                choices: [{ index: 0, delta: { reasoning_content: 'Checking package.json...' }, finish_reason: null }],
              },
              {
                id: 'cmpl-sse-speak',
                model: 'cmd/deepseek-v4.1-flash',
                choices: [
                  {
                    index: 0,
                    delta: {
                      tool_calls: [
                        { index: 0, id: 'call_msg_1', type: 'function', function: { name: 'send_', arguments: '' } },
                        { index: 1, id: 'call_art_1', type: 'function', function: { name: 'send_artifact', arguments: '' } },
                      ],
                    },
                    finish_reason: null,
                  },
                ],
              },
              {
                id: 'cmpl-sse-speak',
                model: 'cmd/deepseek-v4.1-flash',
                choices: [
                  {
                    index: 0,
                    delta: {
                      tool_calls: [
                        {
                          index: 0,
                          function: {
                            name: 'message',
                            arguments: JSON.stringify({ bubbles: ['零外部运行时依赖。', '桥接启动命令放下面了'] }),
                          },
                        },
                        {
                          index: 1,
                          function: {
                            arguments: JSON.stringify({
                              title: 'start-bridge.sh',
                              kind: 'code',
                              language: 'bash',
                              content: 'npx --yes github:NB-Corp/nb-speak serve --port 18090',
                            }),
                          },
                        },
                      ],
                    },
                    finish_reason: null,
                  },
                ],
              },
              {
                id: 'cmpl-sse-speak',
                model: 'cmd/deepseek-v4.1-flash',
                choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
                usage: { prompt_tokens: 120, completion_tokens: 48, total_tokens: 168 },
              },
            ]
          : [
              {
                id: 'cmpl-sse-mixed',
                model: 'cmd/deepseek-v4.1-flash',
                choices: [
                  {
                    index: 0,
                    delta: {
                      tool_calls: [
                        {
                          index: 0,
                          id: 'call_msg_pre',
                          type: 'function',
                          function: {
                            name: 'send_message',
                            arguments: JSON.stringify({ bubbles: ['我先读下 package.json'], end_turn: false }),
                          },
                        },
                        {
                          index: 1,
                          id: 'call_read_real',
                          type: 'function',
                          function: { name: 'read', arguments: '{"path":"package.json"}' },
                        },
                        {
                          index: 2,
                          id: 'call_sub_real',
                          type: 'function',
                          function: { name: 'agent_send_message', arguments: '{"to":"helper"}' },
                        },
                      ],
                    },
                    finish_reason: 'tool_calls',
                  },
                ],
              },
            ];

      const rawSse = sseChunks.map((c) => `data: ${JSON.stringify(c)}\n`).join('\n') + '\ndata: [DONE]\n';
      return new Response(rawSse, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    }

    const sse = [
      'data: ' +
        JSON.stringify({
          id: 'cmpl-voice',
          choices: [
            {
              index: 0,
              delta: {
                content: 'Error rate held at 0.02%\nPool is steady, good to ship',
                tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'agent_send_message', arguments: '{}' } }],
              },
              finish_reason: null,
            },
          ],
        }),
      '',
      'data: [DONE]',
      '',
    ].join('\n');
    return new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  };

  const bridge = await startDshOpenAiBridge({
    host: '127.0.0.1',
    port: 0,
    state: {
      getSliderConfig: () => ({ preset: 'calm_sre' }),
      getBubbleJoinMode: () => 'paragraph',
      fetchImpl: mockFetch,
      getUpstreamConnection: async () => ({
        mode: currentMode,
        cloudBaseUrl: 'http://127.0.0.1:19001/v1',
        cloudApiKey: 'sk-test',
        defaultCloudModel: 'deepseek-chat',
        voiceModelBaseUrl: 'http://127.0.0.1:19002/v1',
        voiceModelApiKey: '',
        defaultVoiceModel: 'nb-speak-voice-v1',
      }),
    },
  });

  try {
    const resSkill = await fetch(`${bridge.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stream: false,
        messages: [{ role: 'user', content: 'Check canary status' }],
        tools: [{ type: 'function', function: { name: 'send_message', parameters: { type: 'object' } } }],
      }),
    });
    const skillJson = (await resSkill.json()) as Record<string, any>;
    const sentToolNames = (capturedBodies[0]!.tools as Array<{ function: { name: string } }>).map((t) => t.function.name);
    assert.deepEqual(sentToolNames, ['agent_send_message', 'send_message', 'send_artifact']);
    const msgContent = String(skillJson.choices[0].message.content);
    assert.ok(msgContent.includes('Asked worker-a to double-check shard logs'));
    assert.ok(msgContent.includes('**`canary.sql`**'));
    assert.ok(msgContent.includes('```sql\nSELECT status, count(*) FROM canary_events GROUP BY 1;\n```'));
    assert.ok(!msgContent.includes('// canary.sql'));
    assert.equal(skillJson.choices[0].message.tool_calls.length, 1);
    assert.equal(skillJson.choices[0].message.tool_calls[0].function.name, 'send_message');

    const resSseSpeak = await fetch(`${bridge.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stream: true,
        model: 'cmd/deepseek-v4.1-flash',
        messages: [{ role: 'user', content: 'Inspect package.json' }],
        tools: [{ type: 'function', function: { name: 'read', parameters: { type: 'object' } } }],
      }),
    });
    const sseSpeakText = await resSseSpeak.text();
    const sseSpeakEvents = sseSpeakText
      .split(/\r?\n/)
      .filter((l) => l.startsWith('data:') && !l.includes('[DONE]'))
      .map((l) => JSON.parse(l.slice(5).trim()));
    assert.ok(!sseSpeakEvents.some((e) => e.choices?.[0]?.delta?.tool_calls));
    const fullStreamedContent = sseSpeakEvents.map((e) => e.choices?.[0]?.delta?.content ?? '').join('');
    assert.ok(fullStreamedContent.includes('零外部运行时依赖\n\n桥接启动命令放下面了'));
    assert.ok(fullStreamedContent.includes('```bash\nnpx --yes github:NB-Corp/nb-speak serve --port 18090\n```'));
    const lastSpeakEvent = sseSpeakEvents[sseSpeakEvents.length - 1]!;
    assert.equal(lastSpeakEvent.choices[0].finish_reason, 'stop');
    assert.equal(lastSpeakEvent.usage.total_tokens, 168);

    sseModeVariant = 'mixed-dsh-tools';
    const resSseMixed = await fetch(`${bridge.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stream: true,
        model: 'cmd/deepseek-v4.1-flash',
        messages: [{ role: 'user', content: 'Read package.json' }],
        tools: [
          { type: 'function', function: { name: 'read', parameters: { type: 'object' } } },
          { type: 'function', function: { name: 'send_message', parameters: { type: 'object' } } },
        ],
      }),
    });
    const sseMixedEvents = (await resSseMixed.text())
      .split(/\r?\n/)
      .filter((l) => l.startsWith('data:') && !l.includes('[DONE]'))
      .map((l) => JSON.parse(l.slice(5).trim()));
    const toolEvent = sseMixedEvents.find((e) => Array.isArray(e.choices?.[0]?.delta?.tool_calls));
    assert.ok(toolEvent);
    assert.deepEqual(
      toolEvent.choices[0].delta.tool_calls.map((t: any) => ({ index: t.index, name: t.function.name })),
      [
        { index: 0, name: 'read' },
        { index: 1, name: 'send_message' },
      ],
    );
    assert.equal(sseMixedEvents[sseMixedEvents.length - 1]!.choices[0].finish_reason, 'tool_calls');

    currentMode = 'voice-model';
    const resVoice = await fetch(`${bridge.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stream: true,
        messages: [{ role: 'user', content: 'Canary status?' }],
        tools: [{ type: 'function', function: { name: 'send_message', parameters: { type: 'object' } } }],
      }),
    });
    const voiceSse = await resVoice.text();
    assert.equal(capturedBodies[3]!.model, 'nb-speak-voice-v1|1.000,0.050,0.000,0.650,0.450');
    assert.ok(voiceSse.includes('Error rate held at 0.02%\\n\\nPool is steady, good to ship'));
    assert.ok(voiceSse.includes('"name":"send_message"'));
  } finally {
    await bridge.close();
  }
});

test('Cordis plugin apply() resolves DSH credentials service, mounts nbSpeak, and disposes cleanly', async () => {
  let provided: Record<string, unknown> | undefined;
  let cleanupFn: (() => Promise<void> | void) | undefined;
  let capturedAuthHeader = '';

  await applyPlugin(
    {
      credentials: {
        resolve: async (ref: string) => (ref === 'AXON_API_KEY' ? { value: 'sk-from-dsh-credentials-store', source: 'file' } : undefined),
      },
      provide: (_name, val) => {
        provided = val as Record<string, unknown>;
      },
      effect: (factory) => {
        cleanupFn = factory();
      },
    },
    {
      bridgeEnabled: true,
      bridgePort: 0,
      runtimeMode: 'skill',
      preset: 'sharp_lead',
      apiKeyRef: 'AXON_API_KEY',
      cloudBaseUrl: 'http://127.0.0.1:19999/v1',
      defaultCloudModel: 'cmd/deepseek-v4.1-flash',
    },
    {
      env: {},
      fetchImpl: async (_url, init) => {
        const headers = (init?.headers ?? {}) as Record<string, string>;
        capturedAuthHeader = headers.authorization ?? '';
        return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
      },
    },
  );
  assert.ok(provided?.bridgeBaseUrl);
  const statusUrl = String(provided.bridgeBaseUrl).replace(/\/v1$/, '/health');
  const healthRes = await fetch(statusUrl);
  const healthJson = (await healthRes.json()) as Record<string, any>;
  assert.equal(healthJson.status, 'ok');
  assert.equal(healthJson.activeModel, 'cmd/deepseek-v4.1-flash');
  assert.equal(capturedAuthHeader, 'Bearer sk-from-dsh-credentials-store');
  await cleanupFn?.();
});

test('install-dsh.mjs supports zero-clone ephemeral npx cache persistence, survives npx cache wipe, and uninstalls byte-for-byte without touching credentials', async () => {
  const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'nb-speak-dsh-home-'));
  const fakeNpxCache = fs.mkdtempSync(path.join(os.tmpdir(), 'npx-ephemeral-'));
  try {
    // Populate simulated `_npx/<hash>/node_modules/@nb-corp/nb-speak-dsh`
    const ephemeralPluginDir = path.join(fakeNpxCache, '_npx', 'a1b2c3', 'node_modules', '@nb-corp', 'nb-speak-dsh');
    for (const item of ['package.json', 'cordis.patch.yml', 'icon.svg', 'LICENSE', 'dist', 'src', 'presets', 'locale', 'scripts']) {
      const srcPath = path.join(PLUGIN_ROOT, item);
      if (fs.existsSync(srcPath)) {
        fs.cpSync(srcPath, path.join(ephemeralPluginDir, item), { recursive: true });
      }
    }

    const credPath = path.join(fakeHome, '.credentials.yaml');
    fs.writeFileSync(credPath, 'DEEPSEEK_API_KEY: keep_untouched\n', 'utf8');

    const webDir = path.join(fakeHome, 'profiles', 'web');
    fs.mkdirSync(webDir, { recursive: true });
    const origPkg =
      JSON.stringify(
        {
          name: 'dsh-profile-web',
          dependencies: { 'nb-search-dsh': '^0.1.0' },
          dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', 'nb-search-dsh'] } },
        },
        null,
        2,
      ) + '\n';
    const origPatch = '[]\n';
    fs.writeFileSync(path.join(webDir, 'package.json'), origPkg, 'utf8');
    fs.writeFileSync(path.join(webDir, 'cordis.patch.yml'), origPatch, 'utf8');

    // 1. Dry-run makes zero filesystem mutations
    const parsedHelp = parseCliArgs(['--help']);
    assert.equal(parsedHelp.mode, 'help');
    runInstaller({ mode: 'dry-run', dshHome: fakeHome, profile: 'web', pluginRoot: ephemeralPluginDir });
    assert.equal(fs.readFileSync(path.join(webDir, 'package.json'), 'utf8'), origPkg);
    assert.equal(fs.existsSync(path.join(fakeHome, 'plugins', 'nb-speak-dsh')), false);

    // 2. Apply from ephemeral npx cache persists runtime bundle into <DSH_HOME>/plugins/nb-speak-dsh
    runInstaller({
      mode: 'apply',
      dshHome: fakeHome,
      profile: 'web',
      pluginRoot: ephemeralPluginDir,
      runtimeMode: 'skill',
      preset: 'sharp_lead',
      bridgePort: 18095,
      upstreamUrl: 'https://api.example.test/v1',
      cloudModel: 'cmd/deepseek-v4.1-flash',
      apiKeyRef: 'AXON_API_KEY',
      wireProvider: true,
    });

    // Wipe the ephemeral npx cache completely to prove zero dangling references!
    fs.rmSync(fakeNpxCache, { recursive: true, force: true });

    const installedPkg = JSON.parse(fs.readFileSync(path.join(webDir, 'package.json'), 'utf8'));
    assert.ok(installedPkg.dsh.profile.bundles.includes('@nb-corp/nb-speak-dsh'));
    assert.ok(!String(installedPkg.dependencies['@nb-corp/nb-speak-dsh']).includes('_npx'));
    const linkedEntry = path.join(webDir, 'node_modules', '@nb-corp', 'nb-speak-dsh', 'dist', 'plugin.js');
    const linkedClient = path.join(webDir, 'node_modules', '@nb-corp', 'nb-speak-dsh', 'dist', 'client.js');
    assert.ok(fs.existsSync(linkedEntry), 'Persisted dist/plugin.js remains resolvable after npx cache wipe');
    assert.ok(fs.existsSync(linkedClient), 'Persisted dist/client.js remains resolvable after npx cache wipe');

    const importedPersisted = await import(pathToFileURL(linkedEntry).href);
    assert.equal(typeof importedPersisted.apply, 'function');

    const patchContent = fs.readFileSync(path.join(webDir, 'cordis.patch.yml'), 'utf8');
    assert.ok(patchContent.includes('cmd/deepseek-v4.1-flash'));
    assert.ok(patchContent.includes('http://127.0.0.1:18095/v1'));
    assert.ok(fs.existsSync(path.join(fakeHome, '.agent-presets', 'nb-speak', 'agent.cordis.yml')));

    // 3. Byte-for-byte uninstall removes persisted plugin dir and leaves .credentials.yaml untouched
    runInstaller({ mode: 'uninstall', dshHome: fakeHome, profile: 'web' });
    assert.equal(fs.readFileSync(path.join(webDir, 'package.json'), 'utf8'), origPkg);
    assert.equal(fs.readFileSync(path.join(webDir, 'cordis.patch.yml'), 'utf8'), origPatch);
    assert.equal(fs.existsSync(path.join(fakeHome, 'plugins', 'nb-speak-dsh')), false);
    assert.equal(fs.readFileSync(credPath, 'utf8'), 'DEEPSEEK_API_KEY: keep_untouched\n');
  } finally {
    fs.rmSync(fakeHome, { recursive: true, force: true });
    if (fs.existsSync(fakeNpxCache)) {
      fs.rmSync(fakeNpxCache, { recursive: true, force: true });
    }
  }
});

const ALLOWED_DSH_SCHEMA_KEYS = new Set([
  'type',
  'oneOf',
  'properties',
  'required',
  'additionalProperties',
  'items',
  'enum',
  'const',
  'description',
  'title',
  'default',
  'examples',
]);

function assertStrictDshSchemaSubset(node: unknown, trail = 'root'): void {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return;
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    assert.ok(ALLOWED_DSH_SCHEMA_KEYS.has(k), `Forbidden DSH schema keyword "${k}" at ${trail}`);
    if (k === 'properties' && v && typeof v === 'object') {
      for (const [propName, propSchema] of Object.entries(v as Record<string, unknown>)) {
        assertStrictDshSchemaSubset(propSchema, `${trail}.properties.${propName}`);
      }
    } else if (k === 'items') {
      assertStrictDshSchemaSubset(v, `${trail}.items`);
    }
  }
}

test('Native DSH send_bubble + send_artifact obey strict DSH JSON Schema subset and register in native mode', async () => {
  const bubbleDef = createSendBubbleToolDefinition() as Record<string, any>;
  const artifactDef = createSendArtifactToolDefinition() as Record<string, any>;
  assertStrictDshSchemaSubset(bubbleDef.parameters, 'send_bubble.parameters');
  assertStrictDshSchemaSubset(bubbleDef.output.schema, 'send_bubble.output');
  assertStrictDshSchemaSubset(artifactDef.parameters, 'send_artifact.parameters');
  assertStrictDshSchemaSubset(artifactDef.output.schema, 'send_artifact.output');

  let concludeCalls = 0;
  const bubbleOut = await bubbleDef.execute(
    {
      bubbles: ['气泡 1：全仓库零第三方依赖。', '桥接命令放下面卡片了'],
      voice_note: { text: '直接用 Node 二十二以上就能跑起来', emotion: 'warm' },
    },
    {
      concludeTurn() {
        concludeCalls += 1;
      },
    },
  );
  assert.equal(bubbleOut.delivered, true);
  assert.equal(bubbleOut.bubbleCount, 2);
  assert.equal(bubbleOut.hasVoiceNote, true);
  assert.equal(concludeCalls, 1);

  await bubbleDef.execute(
    { bubbles: ['先扫一下目录'], end_turn: false },
    {
      concludeTurn() {
        concludeCalls += 1;
      },
    },
  );
  assert.equal(concludeCalls, 1);
  const bubbleMeta = bubbleDef.output.presentationMeta(
    {
      bubbles: ['气泡 1：全仓库零第三方依赖。', '桥接命令放下面卡片了'],
      voice_note: { text: '直接用 Node 二十二以上就能跑起来', emotion: 'warm' },
    },
    bubbleOut,
  );
  assert.deepEqual(bubbleMeta.bubbles, ['全仓库零第三方依赖', '桥接命令放下面卡片了']);
  assert.equal(bubbleMeta.voiceNote.emotion, 'warm');
  assert.ok(bubbleMeta.voiceNote.durationSeconds >= 2);

  const artOut = await artifactDef.execute({
    title: 'orders.sql',
    kind: 'code',
    language: 'sql',
    content: '```sql\nSELECT id FROM orders LIMIT 20;\n```',
  });
  assert.equal(artOut.lineCount, 1);
  const artMeta = artifactDef.output.presentationMeta(
    {
      title: 'orders.sql',
      kind: 'code',
      language: 'sql',
      content: '```sql\nSELECT id FROM orders LIMIT 20;\n```',
    },
    artOut,
  );
  assert.equal(artMeta.content, 'SELECT id FROM orders LIMIT 20;');

  const registeredTools: string[] = [];
  let promptTextFn: (() => string) | undefined;
  let cleanupNative: (() => Promise<void> | void) | undefined;
  let providedService: Record<string, unknown> | undefined;

  await applyPlugin(
    {
      tools: {
        register(def: Record<string, unknown>) {
          registeredTools.push(String(def.name));
          return () => {};
        },
      },
      systemPrompt: {
        section(entry) {
          promptTextFn = typeof entry.text === 'function' ? () => entry.text({}) : () => entry.text;
          return () => {};
        },
      },
      provide(_name, val) {
        providedService = val as Record<string, unknown>;
      },
      effect(factory) {
        cleanupNative = factory();
      },
    },
    {
      runtimeMode: 'native',
      preset: 'sharp_lead',
    },
  );
  assert.deepEqual(registeredTools, ['send_bubble', 'send_artifact']);
  assert.equal(providedService?.bridgeBaseUrl, undefined);
  assert.ok(promptTextFn?.().includes('send_bubble'));
  assert.ok(promptTextFn?.().includes('sharp, candid tech lead'));
  await cleanupNative?.();
});

test('WebUI client turn reducer + compiled dist/client.js ModuleLoader bundle render bubbles, voice note, and artifact card', () => {
  let state = nbSpeakTurnDefinition.start({}, { event: { type: 'turn/start', data: { turn: 3 } } });
  state = nbSpeakTurnDefinition.update(
    { state },
    {
      event: {
        type: 'tool/call',
        seq: 10,
        data: {
          turn: 3,
          callId: 'call_art_1',
          name: 'send_artifact',
          arguments: {
            title: 'ttl_lru.py',
            kind: 'code',
            language: 'python',
            content: 'class TtlLru:\n    pass',
          },
        },
      },
    },
  );
  state = nbSpeakTurnDefinition.update(
    { state },
    {
      event: {
        type: 'tool/call',
        seq: 11,
        data: {
          turn: 3,
          callId: 'call_bub_1',
          name: 'send_bubble',
          arguments: JSON.stringify({
            bubbles: ['八成是在锁里调了回调。', '无死锁版本放下面了'],
            voice_note: { text: '先把伞买了别吹冷风', emotion: 'warm' },
          }),
        },
      },
    },
  );
  const loc = nbSpeakTurnDefinition.buildLocationData({ state }, 'turn', null);
  assert.ok(loc);
  assert.equal(loc.key, NB_SPEAK_TURN_DATA_KEY);
  assert.deepEqual(loc.value.bubbles[0]!.bubbles, ['八成是在锁里调了回调', '无死锁版本放下面了']);
  assert.equal(loc.value.artifacts[0]!.title, 'ttl_lru.py');
  assert.equal(computeWaveformHeights('先把伞买了别吹冷风', 22).length, 22);
  assert.equal(parsePipeTable('| col | val |\n| --- | --- |\n| a | 1 |')?.rows[0]?.[0], 'a');

  const clientJsPath = path.resolve(import.meta.dirname, '..', 'dist', 'client.js');
  assert.ok(fs.existsSync(clientJsPath), 'Expected dist/client.js to be built by scripts/build.mjs');
  const clientCode = fs.readFileSync(clientJsPath, 'utf8');

  let loadedModule: { id: string; factory: (req: (id: string) => unknown) => any } | undefined;
  const fakeWindow = {
    __ModuleLoader__: {
      load(entry: { id: string; factory: (req: (id: string) => unknown) => any }) {
        loadedModule = entry;
      },
    },
  };
  new Function('window', clientCode)(fakeWindow);
  assert.equal(loadedModule?.id, '@nb-corp/nb-speak-dsh');

  const fakeReact = {
    createElement: (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]): unknown =>
      typeof type === 'function'
        ? (type as (p: Record<string, unknown>) => unknown)({ ...(props ?? {}), children: children.flat() })
        : { type, props: props ?? {}, children: children.flat() },
    useState: <T>(init: T): [T, (v: T) => void] => [init, () => {}],
    useRef: <T>(init: T) => ({ current: init }),
    useMemo: <T>(fn: () => T) => fn(),
    useEffect: () => {},
  };
  const clientPlugin = loadedModule!.factory((modId: string) => {
    assert.equal(modId, 'react');
    return fakeReact;
  });

  const registeredSlots: Array<{ meta: Record<string, unknown>; component: (props: any) => any }> = [];
  let registeredTurnDef: unknown;
  clientPlugin.apply({
    effect(fn: () => unknown) {
      fn();
    },
    locale: { register: () => () => {} },
    uiConversation: {
      events: {
        register(def: unknown) {
          registeredTurnDef = def;
          return () => {};
        },
      },
    },
    slots: {
      inject(_name: string, cb: () => unknown) {
        cb();
      },
      register(meta: Record<string, unknown>, component: (props: any) => any) {
        registeredSlots.push({ meta, component });
        return () => {};
      },
    },
  });

  assert.ok(registeredTurnDef);
  const turnTailSlot = registeredSlots.find((s) => s.meta.name === 'conversation.chat.turnTail');
  assert.ok(turnTailSlot);
  assert.equal(turnTailSlot.meta.order, -10);
  const renderedTree = JSON.stringify(
    turnTailSlot.component({
      turn: {
        data: new Map([[NB_SPEAK_TURN_DATA_KEY, loc.value]]),
      },
    }),
  );
  assert.ok(renderedTree.includes('nb-speak-bubble'));
  assert.ok(renderedTree.includes('nb-speak-voice-pill'));
  assert.ok(renderedTree.includes('nb-speak-artifact-card'));
  assert.ok(renderedTree.includes('web-speech'));

  const stateWithAudio = nbSpeakTurnDefinition.update(
    { state },
    {
      event: {
        type: 'tool/result',
        seq: 12,
        data: {
          turn: 3,
          message: { source: { callId: 'call_bub_1' }, isError: false },
          meta: {
            kind: 'nb-speak/bubbles',
            bubbles: ['八成是在锁里调了回调', '无死锁版本放下面了'],
            voiceNote: {
              text: '先把伞买了别吹冷风',
              emotion: 'warm',
              durationSeconds: 5,
              audioSrc: 'data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0U=',
            },
          },
        },
      },
    },
  );
  const locWithAudio = nbSpeakTurnDefinition.buildLocationData({ state: stateWithAudio }, 'turn', loc);
  assert.equal(
    locWithAudio?.value.bubbles[0]?.voiceNote?.audioSrc,
    'data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0U=',
  );
  const renderedWithAudio = JSON.stringify(
    turnTailSlot.component({
      turn: {
        data: new Map([[NB_SPEAK_TURN_DATA_KEY, locWithAudio!.value]]),
      },
    }),
  );
  assert.ok(renderedWithAudio.includes('elevenlabs-audio'));
  assert.ok(renderedWithAudio.includes('data-nb-speak-audio'));
});

test('Optional ElevenLabs TTS synthesizer produces DataURI audio when configured and falls back cleanly without keys', async () => {
  const noKeySynth = createVoiceNoteSynthesizer({ env: {} });
  const emptyRes = await noKeySynth({ text: '刚下班，先买瓶热乌龙茶缓一口气。', emotion: 'warm' });
  assert.equal(emptyRes, undefined);

  assert.equal(resolveElevenLabsVoiceId('auto', 'warm'), 'cgSgspJ2msm6clMCkdW9');
  assert.equal(resolveElevenLabsVoiceId('auto', 'calm'), 'tOuLUAIdXShmWH7PEUrU');
  const anchored = prepareElevenLabsMandarinText('外面起风了，顺手带件外套', 'cgSgspJ2msm6clMCkdW9');
  assert.equal(anchored.languageCode, 'zh');
  assert.equal(anchored.text, '[Standard Mandarin accent] 外面起风了，顺手带件外套。');

  let capturedUrl = '';
  let capturedBody: Record<string, unknown> = {};
  const fakeMp3 = Buffer.alloc(4096, 0x55);
  const directSynth = createVoiceNoteSynthesizer({
    env: { ELEVENLABS_API_KEY: 'YOUR_API_KEY' },
    fetchImpl: async (url, init) => {
      capturedUrl = String(url);
      capturedBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      return new Response(fakeMp3, { status: 200, headers: { 'content-type': 'audio/mpeg' } });
    },
  });

  const bubbleDef = createSendBubbleToolDefinition({ synthesizeVoiceNote: directSynth }) as Record<string, any>;
  const out = await bubbleDef.execute({
    bubbles: ['周五脑子宕机太正常了', '拿盒关东煮萝卜配热茶先垫垫'],
    voice_note: { text: '别盯着热量表算啦。挑个顺眼的结账回家瘫着去。', emotion: 'warm' },
  });
  assert.ok(capturedUrl.includes('/v1/text-to-speech/cgSgspJ2msm6clMCkdW9'));
  assert.equal(capturedBody.model_id, 'eleven_v4');
  assert.equal(capturedBody.language_code, 'zh');
  assert.ok(String(out.audioSrc).startsWith('data:audio/mpeg;base64,'));

  const llmRendered = JSON.stringify(bubbleDef.output.render({}, out));
  assert.ok(!llmRendered.includes('data:audio/mpeg;base64,'));

  const meta = bubbleDef.output.presentationMeta(
    {
      bubbles: ['周五脑子宕机太正常了', '拿盒关东煮萝卜配热茶先垫垫'],
      voice_note: { text: '别盯着热量表算啦。挑个顺眼的结账回家瘫着去。', emotion: 'warm' },
    },
    out,
  );
  assert.equal(meta.voiceNote.audioSrc, out.audioSrc);
});
