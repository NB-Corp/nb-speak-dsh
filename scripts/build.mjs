#!/usr/bin/env node
/**
 * Zero-dependency build script for `@nb-corp/nb-speak-dsh` using Node >= 22.19 `stripTypeScriptTypes`.
 * 1. Compiles `src/*.ts` -> `dist/*.js`
 * 2. Emits DSH WebUI ModuleLoader bundle `dist/client.js` from `src/{client-model.ts,client-ui.ts,client.css}`
 * 3. Emits browser-safe `docs/assets/dsh-runtime-browser.js` from `src/{client-model.ts,weights.ts}`
 * 4. Syncs root `llms.txt` & `llms-full.txt` -> `docs/` when present
 */
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function compileDir(srcDir, distDir) {
  if (!fs.existsSync(srcDir)) return 0;
  fs.mkdirSync(distDir, { recursive: true });
  let count = 0;
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.ts')) continue;
    const srcFile = path.join(srcDir, entry.name);
    const tsCode = fs.readFileSync(srcFile, 'utf8');
    const jsRaw = stripTypeScriptTypes(tsCode, { mode: 'strip' });
    const jsCode = jsRaw.replace(/(from\s+['"]\.\/[^'"]+)\.ts(['"])/g, '$1.js$2');
    const outFile = path.join(distDir, entry.name.replace(/\.ts$/, '.js'));
    fs.writeFileSync(outFile, jsCode, 'utf8');
    count += 1;
  }
  return count;
}

function buildDshClientBundle(srcDir, distDir) {
  fs.mkdirSync(distDir, { recursive: true });
  const cssText = fs.readFileSync(path.join(srcDir, 'client.css'), 'utf8');
  const stripForIIFE = (fileName) => {
    const raw = fs.readFileSync(path.join(srcDir, fileName), 'utf8');
    const stripped = stripTypeScriptTypes(raw, { mode: 'strip' });
    return stripped
      .replace(/^\s*import\s+[\s\S]*?from\s+['"]\.\/[^'"]+['"];?\s*$/gm, '')
      .replace(/^\s*export\s+(?=(?:async\s+)?(?:function|const|let|class)\b)/gm, '')
      .trim();
  };
  const modelBody = stripForIIFE('client-model.ts');
  const uiBody = stripForIIFE('client-ui.ts');
  const bundle = [
    '// Auto-generated from @nb-corp/nb-speak-dsh src/{client-model.ts,client-ui.ts,client.css} — DO NOT HAND-EDIT',
    'window.__ModuleLoader__.load({',
    "  id: '@nb-corp/nb-speak-dsh',",
    '  factory(require) {',
    "    const React = require('react');",
    `    const NB_SPEAK_CLIENT_CSS = ${JSON.stringify(cssText)};`,
    '',
    modelBody,
    '',
    uiBody,
    '',
    '    return createNbSpeakClientPlugin(React, NB_SPEAK_CLIENT_CSS);',
    '  },',
    '});',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(distDir, 'client.js'), bundle, 'utf8');
}

function buildDocsRuntime(srcDir, docsDir) {
  if (!fs.existsSync(docsDir)) return;
  const chunks = [
    '// Auto-generated from @nb-corp/nb-speak-dsh src/{client-model.ts,weights.ts} — DO NOT HAND-EDIT',
  ];
  for (const name of ['client-model.ts', 'weights.ts']) {
    const raw = fs.readFileSync(path.join(srcDir, name), 'utf8');
    const stripped = stripTypeScriptTypes(raw, { mode: 'strip' });
    const clean = stripped.replace(/^\s*import\s+[\s\S]*?from\s+['"]\.\/[^'"]+['"];?\s*$/gm, '').trim();
    chunks.push(`// --- ${name} ---\n${clean}`);
  }
  const outPath = path.join(docsDir, 'assets', 'dsh-runtime-browser.js');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, chunks.join('\n\n') + '\n', 'utf8');
}

const srcDir = path.join(ROOT, 'src');
const distDir = path.join(ROOT, 'dist');
const docsDir = path.join(ROOT, 'docs');
const fileCount = compileDir(srcDir, distDir);
buildDshClientBundle(srcDir, distDir);
buildDocsRuntime(srcDir, docsDir);

if (fs.existsSync(docsDir)) {
  for (const geoName of ['llms.txt', 'llms-full.txt']) {
    const rootGeo = path.join(ROOT, geoName);
    if (fs.existsSync(rootGeo)) {
      fs.copyFileSync(rootGeo, path.join(docsDir, geoName));
    }
  }
}

console.log(`Built @nb-corp/nb-speak-dsh (${fileCount} ESM modules + dist/client.js + docs runtime).`);
