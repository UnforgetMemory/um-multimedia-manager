#!/usr/bin/env node
/**
 * `npm run console:check` — ratchet gate for direct `console.*` calls in src/.
 *
 * AGENTS.md routes diagnostics through `libraries/utils/logger` (level filters,
 * debug switch, structured prefixes). Raw `console.*` bypasses all of that, and
 * the earlier inventory was only ever visible through an ad-hoc grep. oxlint has
 * no `no-console` rule enabled, so nothing blocked growth.
 *
 * Detection is AST-based: comments and string literals that merely mention
 * `console.log` never count. `src/libraries/utils/logger.ts` is the sanctioned
 * outlet and is exempt.
 *
 * The count may only shrink: `--baseline` re-locks it after a deliberate
 * reduction, `--self-test` proves the detector both bites and does not
 * misfire.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const BASELINE_FILE = path.join(__dirname, 'console-baseline.json');
const SCAN_DIR = path.join(ROOT, 'src');
const SCAN_EXTENSIONS = ['.ts', '.tsx', '.vue'];
const EXEMPT = new Set(['src/libraries/utils/logger.ts']);
const SKIP_DIRS = new Set(['node_modules', 'dist', '.output', '.wxt', 'test-results']);
const CONSOLE_METHODS = new Set([
  'log',
  'info',
  'warn',
  'error',
  'debug',
  'trace',
  'group',
  'table',
]);

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name), out);
      continue;
    }
    if (SCAN_EXTENSIONS.some((ext) => entry.name.endsWith(ext)))
      out.push(path.join(dir, entry.name));
  }
  return out;
}

const SCRIPT_BLOCK = /<script\b[^>]*>([\s\S]*?)<\/script>/g;

/** SFCs keep line numbers by blanking every non-script region. */
function scriptBlocksToVirtualTs(text) {
  const lines = text.split('\n');
  const blanked = lines.map(() => '');
  SCRIPT_BLOCK.lastIndex = 0;
  let match;
  while ((match = SCRIPT_BLOCK.exec(text)) !== null) {
    const bodyStart = match.index + match[0].indexOf('>') + 1;
    const bodyStartLine = text.slice(0, bodyStart).split('\n').length - 1;
    const bodyLines = match[1].split('\n');
    for (let i = 0; i < bodyLines.length; i += 1) {
      const target = bodyStartLine + i;
      if (target < lines.length) blanked[target] = bodyLines[i];
    }
  }
  return blanked.join('\n');
}

/** `console.X(...)` including `window.console.X(...)` / `globalThis.console.X(...)`. */
function findConsoleCalls(text, fileName) {
  const source = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const found = [];
  const isConsoleRoot = (node) => {
    if (ts.isIdentifier(node)) return node.text === 'console';
    if (ts.isPropertyAccessExpression(node)) return node.name.text === 'console';
    return false;
  };
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const callee = node.expression;
      if (CONSOLE_METHODS.has(callee.name.text) && isConsoleRoot(callee.expression)) {
        const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source));
        found.push({ line: line + 1, column: character + 1, method: callee.name.text });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

function checkFile(absolute) {
  const relative = path.relative(ROOT, absolute).replace(/\\/g, '/');
  if (EXEMPT.has(relative)) return [];
  const text = fs.readFileSync(absolute, 'utf8');
  if (!text.includes('console')) return [];
  const isVue = absolute.endsWith('.vue');
  const probe = isVue ? scriptBlocksToVirtualTs(text) : text;
  const hits = findConsoleCalls(probe, isVue ? `${relative}.ts` : relative);
  const lines = probe.split('\n');
  return hits.map((hit) => ({
    file: relative,
    ...hit,
    snippet: (lines[hit.line - 1] ?? '').trim().slice(0, 90),
  }));
}

function collect() {
  const files = [];
  walk(SCAN_DIR, files);
  return files.sort();
}

function measure() {
  const files = collect();
  const hits = [];
  for (const file of files) hits.push(...checkFile(file));
  const byFile = {};
  for (const hit of hits) byFile[hit.file] = (byFile[hit.file] ?? 0) + 1;
  return { fileCount: files.length, hits, byFile };
}

function readBaseline() {
  if (!fs.existsSync(BASELINE_FILE)) return null;
  return JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
}

function selfTest() {
  const cases = [
    { label: 'bare log', text: 'console.log("x");', expected: 1 },
    { label: 'window.error', text: 'window.console.error(new Error("e"));', expected: 1 },
    { label: 'method on other object', text: 'logger.warn("x"); metrics.log();', expected: 0 },
    { label: 'string mention', text: 'const s = "console.log here"; void s;', expected: 0 },
    { label: 'comment mention', text: '// console.log was removed\nconst a = 1;', expected: 0 },
    {
      label: 'vue script keeps lines',
      text: '<template>\n  <p>hi</p>\n</template>\n<script setup lang="ts">\nconsole.info(1);\n</script>\n',
      expected: 1,
      expectLine: 5,
    },
  ];
  let failed = 0;
  for (const c of cases) {
    const probe = c.text.includes('<script') ? scriptBlocksToVirtualTs(c.text) : c.text;
    const hits = findConsoleCalls(probe, 'probe.ts');
    const okLine = c.expectLine === undefined || hits[0]?.line === c.expectLine;
    const pass = hits.length === c.expected && okLine;
    if (!pass) failed += 1;
    console.log(
      `${pass ? 'ok  ' : 'FAIL'} ${c.label} (expected ${c.expected}${c.expectLine ? `@line ${c.expectLine}` : ''}, got ${hits.length}${hits[0] ? `@line ${hits[0].line}` : ''})`,
    );
  }
  if (failed > 0) {
    console.error(`console self-test: ${failed} assertion(s) failed`);
    process.exit(1);
  }
  console.log(`console self-test: ${cases.length}/${cases.length} passed`);
}

function main() {
  if (process.argv.includes('--self-test')) {
    selfTest();
    return;
  }
  const { fileCount, hits, byFile } = measure();
  if (process.argv.includes('--baseline')) {
    fs.writeFileSync(
      BASELINE_FILE,
      `${JSON.stringify({ count: hits.length, files: Object.keys(byFile).length, byFile }, null, 2)}\n`,
    );
    console.log(
      `console baseline written: ${hits.length} calls in ${Object.keys(byFile).length} files`,
    );
    return;
  }
  const baseline = readBaseline();
  if (!baseline) {
    console.error('no scripts/console-baseline.json — run `npm run console:baseline`');
    process.exit(1);
  }
  console.log(
    `console:check — ${fileCount} files scanned, ${hits.length} direct console.* calls (baseline ${baseline.count})`,
  );
  if (hits.length > baseline.count) {
    for (const hit of hits.slice(0, 40)) console.log(`  ${hit.file}:${hit.line}  ${hit.snippet}`);
    console.error(
      `\nDirect console.* in src bypasses libraries/utils/logger (levels, debug switch, prefixes).\n` +
        `Route new diagnostics through the logger; the ratchet only allows the count to shrink.`,
    );
    process.exit(1);
  }
  if (hits.length < baseline.count) {
    console.log(
      `  ✓ shrunk by ${baseline.count - hits.length} — run \`npm run console:baseline\` to lock it in`,
    );
  }
  console.log('✅ console ratchet: PASS');
}

main();
