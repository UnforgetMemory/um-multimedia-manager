#!/usr/bin/env node
/**
 * `npm run any:check` — the AGENTS.md ban on `as any`/explicit `any`, gated.
 *
 * Detection is AST-based (AnyKeyword nodes), so prose in comments, identifiers
 * like `anyway`, and `unknown` never trip it — a regex scan produced both false
 * positives and misses. `.vue` files are checked by parsing their <script>
 * blocks as virtual TS with original line numbers preserved, because oxlint's
 * typescript/no-explicit-any cannot read SFCs.
 *
 * The count may only shrink: `--self-test` proves the detector bites, and CI
 * fails on any explicit `any` in src/ or tests/.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');

const SCAN_TARGETS = [
  { dir: 'src', extensions: ['.ts', '.tsx', '.vue'] },
  { dir: 'tests', extensions: ['.ts', '.tsx'] },
];

const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '.output',
  '.wxt',
  'playwright-report',
  'test-results',
]);

function walk(dir, extensions, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), extensions, out);
      continue;
    }
    if (extensions.some((ext) => entry.name.endsWith(ext))) out.push(path.join(dir, entry.name));
  }
  return out;
}

/** AnyKeyword occurrences in one TS text, as {line, column} (1-based). */
function findAnyKeyword(text, fileName) {
  const source = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const found = [];
  const visit = (node) => {
    if (node.kind === ts.SyntaxKind.AnyKeyword) {
      const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source));
      found.push({ line: line + 1, column: character + 1 });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

const SCRIPT_BLOCK = /<script\b[^>]*>([\s\S]*?)<\/script>/g;

/**
 * SFCs keep line numbers by replacing every non-script region with the same
 * number of newlines, so one virtual document per file reports real positions.
 */
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
    // Everything outside a <script> block stays blank, so template markup can
    // never be parsed as TypeScript and cannot double-count.
  }
  return blanked.join('\n');
}

function checkFile(absolute) {
  const text = fs.readFileSync(absolute, 'utf8');
  const isVue = absolute.endsWith('.vue');
  if (isVue && !text.includes('<script')) return [];
  const probe = isVue ? scriptBlocksToVirtualTs(text) : text;
  if (!probe.includes('any')) return [];
  const relative = path.relative(ROOT, absolute).replace(/\\/g, '/');
  return findAnyKeyword(probe, isVue ? `${relative}.ts` : relative).map((hit) => ({
    file: relative,
    ...hit,
    snippet: probe.split('\n')[hit.line - 1].trim().slice(0, 100),
  }));
}

function collect() {
  const files = [];
  for (const target of SCAN_TARGETS) {
    const dir = path.join(ROOT, target.dir);
    if (!fs.existsSync(dir)) continue;
    walk(dir, target.extensions, files);
  }
  return files.sort();
}

function selfTest() {
  const cases = [
    { label: 'annotated parameter', text: 'function f(x: any) { return x; }', expected: 1 },
    { label: 'type assertion', text: 'const y = payload as any;', expected: 1 },
    { label: 'generic argument', text: 'const z: Array<any> = [];', expected: 1 },
    { label: 'index signature', text: 'interface I { [key: string]: any }', expected: 1 },
    {
      label: 'identifier that merely starts with any',
      text: 'const anyway = 1; anyway.valueOf();',
      expected: 0,
    },
    { label: 'unknown is fine', text: 'const ok: unknown = 1;', expected: 0 },
    {
      label: 'comment mention is fine',
      text: '// Fallback: any id^="dir_" element\nconst a = 1;',
      expected: 0,
    },
    {
      label: 'vue script block keeps line numbers',
      text: '<template>\n  <p>hi</p>\n</template>\n<script setup lang="ts">\nconst bad: any = 1;\n</script>\n',
      expected: 1,
      expectLine: 5,
    },
  ];
  let failed = 0;
  for (const c of cases) {
    const hits = c.text.includes('<script')
      ? findAnyKeyword(scriptBlocksToVirtualTs(c.text), 'probe.vue.ts')
      : findAnyKeyword(c.text, 'probe.ts');
    const okCount = hits.length === c.expected;
    const okLine = c.expectLine === undefined || hits[0]?.line === c.expectLine;
    const pass = okCount && okLine;
    if (!pass) failed += 1;
    console.log(
      `${pass ? 'ok  ' : 'FAIL'} ${c.label} (expected ${c.expected}${c.expectLine ? `@line ${c.expectLine}` : ''}, got ${hits.length}${hits[0] ? `@line ${hits[0].line}` : ''})`,
    );
  }
  if (failed > 0) {
    console.error(`self-test: ${failed} assertion(s) failed`);
    process.exit(1);
  }
  console.log(`self-test: ${cases.length}/${cases.length} passed`);
}

function main() {
  if (process.argv.includes('--self-test')) {
    selfTest();
    return;
  }
  const files = collect();
  const hits = [];
  for (const file of files) hits.push(...checkFile(file));

  console.log(`any:check — ${files.length} files scanned, ${hits.length} explicit any`);
  if (hits.length === 0) return;
  for (const hit of hits) console.log(`  ${hit.file}:${hit.line}:${hit.column}  ${hit.snippet}`);
  console.error(
    '\nExplicit `any` is banned (AGENTS.md 关键约定). Model the unknown instead: `unknown` + narrowing,\n' +
      'a real interface at the boundary, or `(...args: never[]) => void` for higher-order constraints.',
  );
  process.exit(1);
}

main();
