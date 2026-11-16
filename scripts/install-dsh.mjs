#!/usr/bin/env node
/**
 * Zero-clone reversible installer/uninstaller for `@nb-corp/nb-speak-dsh` into a DeepSeek Harness (`DSH_HOME`) profile.
 * - Safe with `npx --yes github:NB-Corp/nb-speak-dsh --apply --profile web`: persists a self-contained runtime bundle
 *   under `<DSH_HOME>/plugins/nb-speak-dsh` so ephemeral `_npx` cache cleanup never breaks DSH.
 * - Zero external runtime dependencies; never reads, modifies, or deletes `.credentials.yaml`.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const PLUGIN_ROOT = path.resolve(SCRIPT_DIR, '..');
const PACKAGE_NAME = '@nb-corp/nb-speak-dsh';

const RUNTIME_ENTRIES = [
  'package.json',
  'cordis.patch.yml',
  'icon.svg',
  'LICENSE',
  'README.md',
  'README.zh-CN.md',
  'dist',
  'src',
  'presets',
  'locale',
  'scripts',
];

const PROFILE_TEMPLATES = {
  web: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'],
  desktop: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'],
  acp: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-acp-app'],
  headless: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-headless'],
  sdk: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-sdk-app'],
};

const DEFAULT_PATCH_TEMPLATE = `# DSH profile patch layer\n[]\n`;

function readPackageVersion(pluginRoot = PLUGIN_ROOT) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'package.json'), 'utf8'));
    return String(pkg.version || '0.3.1');
  } catch {
    return '0.3.1';
  }
}

export function formatHelpText() {
  return [
    `${PACKAGE_NAME} v${readPackageVersion()} — Reversible DeepSeek Harness (DSH) Bubble Plugin Installer`,
    '',
    'Usage:',
    '  npx --yes github:NB-Corp/nb-speak-dsh --dry-run --profile web',
    '  npx --yes github:NB-Corp/nb-speak-dsh --apply --profile web [--preset neutral_peer]',
    '  npx --yes github:NB-Corp/nb-speak-dsh --uninstall --profile web',
    '',
    'Options:',
    '  --dry-run                Preview planned profile changes with zero filesystem writes (default)',
    '  --apply                  Persist plugin to <DSH_HOME>/plugins/nb-speak-dsh & mount into profile',
    '  --uninstall              Restore profile byte-for-byte from backup & remove persisted plugin',
    '  --profile <name>         Target DSH profile: web (default), desktop, acp, headless, sdk',
    '  --dsh-home <dir>         Override DSH_HOME (defaults to $DSH_HOME or ~/.dsh)',
    '  --preset <id>            Persona preset: neutral_peer (default), sharp_lead, warm_companion, calm_sre',
    '  --runtime-mode <mode>    native (default), skill, or voice-model',
    '  --link                   Link directly to current checkout instead of copying to <DSH_HOME>/plugins',
    '  -v, --version            Print package version',
    '  -h, --help               Show this help message',
  ].join('\n');
}

export function parseCliArgs(argv) {
  let mode = 'dry-run';
  let dshHome = '';
  let profile = 'web';
  let bridgePort = 18091;
  let runtimeMode = 'native';
  let preset = 'neutral_peer';
  let upstreamUrl = '';
  let cloudModel = '';
  let apiKeyRef = '';
  let wireProvider = false;
  let linkSource = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') mode = 'help';
    else if (arg === '--version' || arg === '-v') mode = 'version';
    else if (arg === '--dry-run') mode = 'dry-run';
    else if (arg === '--apply') mode = 'apply';
    else if (arg === '--uninstall') mode = 'uninstall';
    else if (arg === '--link') linkSource = true;
    else if (arg === '--dsh-home' && argv[i + 1]) dshHome = argv[++i];
    else if (arg === '--profile' && argv[i + 1]) profile = argv[++i];
    else if (arg === '--bridge-port' && argv[i + 1]) bridgePort = Number(argv[++i]);
    else if (arg === '--runtime-mode' && argv[i + 1]) runtimeMode = argv[++i];
    else if (arg === '--preset' && argv[i + 1]) preset = argv[++i];
    else if (arg === '--upstream-url' && argv[i + 1]) upstreamUrl = argv[++i];
    else if (arg === '--cloud-model' && argv[i + 1]) cloudModel = argv[++i];
    else if (arg === '--api-key-ref' && argv[i + 1]) apiKeyRef = argv[++i];
    else if (arg === '--wire-provider') wireProvider = true;
  }

  const resolvedHome = path.resolve(
    dshHome || (process.env.DSH_HOME && process.env.DSH_HOME.trim()) || path.join(os.homedir(), '.dsh'),
  );
  if (!profile || profile.includes('/') || profile.includes('\\') || profile === '.' || profile === '..') {
    throw new Error(`Invalid profile name: ${JSON.stringify(profile)}`);
  }
  return {
    mode,
    dshHome: resolvedHome,
    profile,
    bridgePort: Number.isFinite(bridgePort) && bridgePort >= 0 ? bridgePort : 18091,
    runtimeMode:
      runtimeMode === 'voice-model' ? 'voice-model' : runtimeMode === 'skill' ? 'skill' : 'native',
    preset,
    upstreamUrl: upstreamUrl.trim(),
    cloudModel: cloudModel.trim(),
    apiKeyRef: apiKeyRef.trim(),
    wireProvider,
    linkSource,
    pluginRoot: PLUGIN_ROOT,
  };
}

function readOptionalUtf8(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') return null;
    throw err;
  }
}

function copyEntryRecursive(srcPath, destPath) {
  const st = fs.statSync(srcPath);
  if (st.isDirectory()) {
    fs.mkdirSync(destPath, { recursive: true });
    for (const entry of fs.readdirSync(srcPath, { withFileTypes: true })) {
      copyEntryRecursive(path.join(srcPath, entry.name), path.join(destPath, entry.name));
    }
  } else {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.copyFileSync(srcPath, destPath);
  }
}

function syncRuntimeBundle(sourceRoot, persistedDir) {
  const srcResolved = path.resolve(sourceRoot);
  const dstResolved = path.resolve(persistedDir);
  if (srcResolved === dstResolved) return;
  fs.rmSync(dstResolved, { recursive: true, force: true });
  fs.mkdirSync(dstResolved, { recursive: true });
  for (const rel of RUNTIME_ENTRIES) {
    const srcItem = path.join(srcResolved, rel);
    if (!fs.existsSync(srcItem)) continue;
    copyEntryRecursive(srcItem, path.join(dstResolved, rel));
  }
}

function createDirLink(targetDir, linkPath) {
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });
  try {
    const st = fs.lstatSync(linkPath);
    if (st.isSymbolicLink() || st.isDirectory() || st.isFile()) {
      fs.rmSync(linkPath, { recursive: true, force: true });
    }
  } catch (err) {
    if (!err || err.code !== 'ENOENT') throw err;
  }
  try {
    fs.symlinkSync(targetDir, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
  } catch {
    copyEntryRecursive(targetDir, linkPath);
  }
}

function removeEmptyParents(dirPath, stopAt) {
  let cur = path.resolve(dirPath);
  const root = path.resolve(stopAt);
  while (cur.startsWith(root) && cur !== root) {
    try {
      if (fs.readdirSync(cur).length > 0) break;
      fs.rmdirSync(cur);
      cur = path.dirname(cur);
    } catch {
      break;
    }
  }
}

export function runInstaller(options) {
  const {
    mode,
    dshHome,
    profile,
    bridgePort = 18091,
    runtimeMode = 'native',
    preset = 'neutral_peer',
    upstreamUrl = '',
    cloudModel = '',
    apiKeyRef = '',
    wireProvider = false,
    linkSource = false,
    pluginRoot = PLUGIN_ROOT,
  } = options;

  const profileDir = path.join(dshHome, 'profiles', profile);
  const manifestPath = path.join(profileDir, 'package.json');
  const patchPath = path.join(profileDir, 'cordis.patch.yml');
  const nodeModulesLink = path.join(profileDir, 'node_modules', '@nb-corp', 'nb-speak-dsh');
  const persistedPluginDir = path.join(dshHome, 'plugins', 'nb-speak-dsh');
  const effectiveTargetRoot = linkSource ? path.resolve(pluginRoot) : persistedPluginDir;
  const presetDestDir = path.join(dshHome, '.agent-presets', 'nb-speak');
  const presetYmlDest = path.join(presetDestDir, 'preset.yml');
  const agentCordisDest = path.join(presetDestDir, 'agent.cordis.yml');
  const backupDir = path.join(dshHome, '.nb-speak-backup');
  const backupFile = path.join(backupDir, `${profile}.json`);

  const actions = [];

  if (mode === 'uninstall') {
    const rawBackup = readOptionalUtf8(backupFile);
    if (rawBackup !== null) {
      const backup = JSON.parse(rawBackup);
      for (const [relPath, prevContent] of Object.entries(backup.files || {})) {
        const absPath = path.join(dshHome, relPath);
        if (prevContent === null) {
          if (fs.existsSync(absPath)) {
            fs.rmSync(absPath, { recursive: true, force: true });
            removeEmptyParents(path.dirname(absPath), dshHome);
          }
        } else {
          fs.mkdirSync(path.dirname(absPath), { recursive: true });
          fs.writeFileSync(absPath, prevContent, 'utf8');
        }
      }
      try {
        fs.lstatSync(nodeModulesLink);
        fs.rmSync(nodeModulesLink, { recursive: true, force: true });
        removeEmptyParents(path.dirname(nodeModulesLink), profileDir);
      } catch {
        // already absent
      }
      fs.rmSync(backupFile, { force: true });

      let remainingBackups = 0;
      try {
        remainingBackups = fs.readdirSync(backupDir).filter((f) => f.endsWith('.json')).length;
      } catch {
        remainingBackups = 0;
      }

      if (remainingBackups === 0 && backup.createdPersistedPlugin !== false && fs.existsSync(persistedPluginDir)) {
        try {
          fs.rmSync(persistedPluginDir, { recursive: true, force: true });
          removeEmptyParents(path.dirname(persistedPluginDir), dshHome);
          actions.push({ op: 'remove_persisted_plugin', dir: persistedPluginDir });
        } catch {
          // ignore if active working dir holds handle
        }
      }

      removeEmptyParents(backupDir, dshHome);
      removeEmptyParents(profileDir, dshHome);
      actions.push({ op: 'restore_from_backup', backupFile });
      return { mode, dshHome, profile, profileDir, actions };
    }
    return { mode, dshHome, profile, profileDir, actions };
  }

  const origManifest = readOptionalUtf8(manifestPath);
  const origPatch = readOptionalUtf8(patchPath);
  const manifest = origManifest
    ? JSON.parse(origManifest)
    : {
        name: `dsh-profile-${profile}`,
        private: true,
        dependencies: {},
        dsh: { profile: { bundles: [...(PROFILE_TEMPLATES[profile] || ['@deepseek-ai/dsh-base'])] } },
      };

  manifest.dependencies = manifest.dependencies || {};
  manifest.dependencies[PACKAGE_NAME] = `file:${effectiveTargetRoot.replace(/\\/g, '/')}`;
  manifest.dsh = manifest.dsh || {};
  manifest.dsh.profile = manifest.dsh.profile || {};
  const bundles = Array.isArray(manifest.dsh.profile.bundles)
    ? [...manifest.dsh.profile.bundles]
    : [...(PROFILE_TEMPLATES[profile] || ['@deepseek-ai/dsh-base'])];
  if (!bundles.includes(PACKAGE_NAME)) bundles.push(PACKAGE_NAME);
  manifest.dsh.profile.bundles = bundles;
  const nextManifestText = JSON.stringify(manifest, null, 2) + '\n';

  let nextPatchText = origPatch ?? DEFAULT_PATCH_TEMPLATE;
  if (
    upstreamUrl ||
    cloudModel ||
    apiKeyRef ||
    wireProvider ||
    bridgePort !== 18091 ||
    runtimeMode !== 'native' ||
    preset !== 'neutral_peer'
  ) {
    const bridgeBaseUrl = `http://127.0.0.1:${bridgePort}/v1`;
    const effectiveModel = cloudModel || 'deepseek-chat';
    const effectiveKeyRef = apiKeyRef || 'NB_SPEAK_API_KEY';
    const bridgeNeeded = wireProvider || runtimeMode !== 'native';
    const lines = [
      '- id: nb-speak',
      '  config:',
      `    runtimeMode: ${JSON.stringify(runtimeMode)}`,
      `    preset: ${JSON.stringify(preset)}`,
      `    bridgeEnabled: ${bridgeNeeded ? 'true' : 'false'}`,
      `    bridgePort: ${bridgePort}`,
    ];
    if (upstreamUrl) {
      lines.push(
        runtimeMode === 'voice-model'
          ? `    voiceModelBaseUrl: ${JSON.stringify(upstreamUrl)}`
          : `    cloudBaseUrl: ${JSON.stringify(upstreamUrl)}`,
      );
    }
    if (cloudModel) {
      lines.push(`    defaultCloudModel: ${JSON.stringify(cloudModel)}`);
    }
    if (apiKeyRef) {
      lines.push(`    apiKeyRef: ${JSON.stringify(apiKeyRef)}`);
    }
    if (wireProvider) {
      lines.push(
        '- id: llm-pi-ai',
        '  config:',
        '    providers:',
        '      nb-speak:',
        '        displayName: "nb-speak Bridge"',
        `        apiKeyEnv: ${JSON.stringify(effectiveKeyRef)}`,
        '        api: "openai-completions"',
        `        baseURL: ${JSON.stringify(bridgeBaseUrl)}`,
        '        defaultMaxTokens: 32768',
        '        compat:',
        '          supportsStore: false',
        '          supportsDeveloperRole: false',
        '          maxTokensField: "max_tokens"',
        '          requiresReasoningContentOnAssistantMessages: true',
        '          supportsStrictMode: false',
        '        models:',
        `          - id: ${JSON.stringify(effectiveModel)}`,
        `            name: ${JSON.stringify(effectiveModel)}`,
        '            contextWindow: 500000',
        '            input:',
        '              - text',
        '          - id: "nb-speak:neutral"',
        '            name: "nb-speak · Neutral Peer"',
        '            contextWindow: 500000',
        '            input:',
        '              - text',
        '          - id: "nb-speak:sharp"',
        '            name: "nb-speak · Sharp Tech Lead"',
        '            contextWindow: 500000',
        '            input:',
        '              - text',
        '          - id: "nb-speak:warm"',
        '            name: "nb-speak · Warm Companion"',
        '            contextWindow: 500000',
        '            input:',
        '              - text',
        '          - id: "nb-speak:sre"',
        '            name: "nb-speak · Calm SRE Relay"',
        '            contextWindow: 500000',
        '            input:',
        '              - text',
        '- id: agent-default-model',
        '  config:',
        '    provider: "nb-speak"',
        `    model: ${JSON.stringify(effectiveModel)}`,
      );
      if (profile === 'web' || profile === 'desktop') {
        lines.push(
          '- id: agent-preset-registry',
          '  config:',
          '    default: "nb-speak"',
        );
      }
    }
    nextPatchText = `${lines.join('\n')}\n`;
  }

  const srcPresetYml = fs.readFileSync(path.join(pluginRoot, 'presets', 'nb-speak', 'preset.yml'), 'utf8');
  const srcAgentCordis = fs.readFileSync(path.join(pluginRoot, 'presets', 'nb-speak', 'agent.cordis.yml'), 'utf8');

  if (!linkSource) {
    actions.push({ op: 'persist_plugin_bundle', source: pluginRoot, target: persistedPluginDir });
  }
  actions.push(
    { op: origManifest === null ? 'create_manifest' : 'update_manifest', path: manifestPath, bundles },
    { op: origPatch === null ? 'create_patch' : 'update_patch', path: patchPath },
    { op: 'link_plugin_package', link: nodeModulesLink, target: effectiveTargetRoot },
    { op: 'sync_agent_preset', dir: presetDestDir },
  );

  if (mode === 'apply') {
    const persistedAlreadyExisted = fs.existsSync(persistedPluginDir);
    if (!fs.existsSync(backupFile)) {
      fs.mkdirSync(backupDir, { recursive: true });
      const tracked = [
        path.relative(dshHome, manifestPath),
        path.relative(dshHome, patchPath),
        path.relative(dshHome, presetYmlDest),
        path.relative(dshHome, agentCordisDest),
      ];
      const filesSnapshot = {};
      for (const rel of tracked) filesSnapshot[rel] = readOptionalUtf8(path.join(dshHome, rel));
      fs.writeFileSync(
        backupFile,
        JSON.stringify(
          {
            createdAt: new Date().toISOString(),
            profile,
            pluginRoot: effectiveTargetRoot,
            createdPersistedPlugin: !linkSource && !persistedAlreadyExisted,
            files: filesSnapshot,
          },
          null,
          2,
        ) + '\n',
        'utf8',
      );
    }

    if (!linkSource) {
      syncRuntimeBundle(pluginRoot, persistedPluginDir);
    }

    fs.mkdirSync(profileDir, { recursive: true });
    fs.writeFileSync(manifestPath, nextManifestText, 'utf8');
    fs.writeFileSync(patchPath, nextPatchText, 'utf8');
    createDirLink(effectiveTargetRoot, nodeModulesLink);
    fs.mkdirSync(presetDestDir, { recursive: true });
    fs.writeFileSync(presetYmlDest, srcPresetYml, 'utf8');
    fs.writeFileSync(agentCordisDest, srcAgentCordis, 'utf8');
  }

  return {
    mode,
    dshHome,
    profile,
    profileDir,
    pluginDir: effectiveTargetRoot,
    bundles,
    bridgeUrl: `http://127.0.0.1:${bridgePort}/v1`,
    actions,
  };
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const parsed = parseCliArgs(process.argv.slice(2));
  if (parsed.mode === 'help') {
    console.log(formatHelpText());
  } else if (parsed.mode === 'version') {
    console.log(readPackageVersion());
  } else {
    console.log(JSON.stringify(runInstaller(parsed), null, 2));
  }
}
