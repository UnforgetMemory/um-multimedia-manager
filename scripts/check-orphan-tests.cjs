#!/usr/bin/env node
/**
 * Orphan-module ratchet: src modules with zero transitive imports from unit specs.
 *
 * Guard scope = all src .ts modules minus entrypoints/ minus .d.ts: entrypoints
 * are WXT runtime roots covered by tests/e2e (not unit-importable), .d.ts are
 * declarations not modules, and .vue SFCs are not graph-resolvable without the
 * sfc compiler so they are never scope members nor traversal nodes.
 *
 * Also exempt: pure re-export barrels (index.ts that only re-exports). They hold
 * no behavior, so "import the barrel" would be metric-gaming — the modules behind
 * them are measured individually. The exemption is intentionally conservative:
 * ANY local declaration, arrow function, or statement that is not an
 * import/export line keeps the file in scope. --self-test pins both directions.
 *
 * Uncovered list is baselined in orphan-tests-baseline.json; the set may only
 * shrink — a new uncovered module fails the gate. --baseline regenerates it.
 *
 * Usage: node scripts/check-orphan-tests.cjs [--baseline|--self-test]
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const BASELINE_FILE = path.join(__dirname, 'orphan-tests-baseline.json');

const ENTRYPOINT_PREFIX = 'src/entrypoints/';
const SPEC_SUFFIX = '.spec.ts';

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) walk(abs, out);
    else out.push(abs);
  }
  return out;
}

const relOf = (abs) => path.relative(ROOT, abs).split(path.sep).join('/');
const isFile = (rel) => {
  try {
    return fs.statSync(path.join(ROOT, rel)).isFile();
  } catch {
    return false;
  }
};

// Same specifier patterns as check-architecture.cjs (static/dynamic import, require).
function extractImports(code) {
  const specs = [];
  const patterns = [
    /(?:from|import)\s*(?:type\s*)?\(?\s*['"]([^'"]+)['"]/g,
    /(?:from|import)\s*(?:type\s*)?\(?\s*`([^`$]+)`/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const re of patterns) {
    for (const m of code.matchAll(re)) specs.push(m[1]);
  }
  return specs;
}

// Specifier -> repo-rel path with extension-elision + index.ts barrels; null if unresolvable.
function resolveSpecifier(spec, fromRel) {
  let s = spec.split(/[?#]/)[0];
  if (s.startsWith('@/')) s = 'src/' + s.slice(2);
  else if (s.startsWith('.')) {
    s = path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), s));
  } else return null; // bare package / URL
  // Explicit path wins (only traversable kinds; .vue stays a non-node leaf);
  // else extension-elision (.ts/.tsx/.js) and barrel (index.ts).
  if (/\.(ts|tsx|js)$/.test(s) && isFile(s)) return s;
  for (const cand of [`${s}.ts`, `${s}.tsx`, `${s}.js`, `${s}/index.ts`]) {
    if (isFile(cand)) return cand;
  }
  return null;
}

/**
 * Pure re-export barrel? Only import/export statements, no local declarations.
 * Deliberately string-based (this gate must stay dependency-free), and biased
 * toward keeping files IN scope: any doubt means it is measured.
 *
 * Split on `;` rather than by line: `export {` lists span several lines, and a
 * line-based rule reads their specifier rows as non-export statements.
 */
function isPureReexportBarrel(code) {
  const withoutComments = code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\n)\s*\/\/[^\n]*/g, '$1');
  const statements = withoutComments
    .split(';')
    .map((chunk) => chunk.replace(/\s+/g, ' ').trim())
    .filter((chunk) => chunk !== '');
  if (statements.length === 0) return false;
  return statements.every(
    (chunk) =>
      /^(import|export)\b/.test(chunk) &&
      !/\b(function|class|const|let|var|await)\b/.test(chunk) &&
      !chunk.includes('=>') &&
      // `export { default as Button } from './Button.vue'` is still a re-export;
      // only a default DEFINITION carries behavior.
      !/^export\s+default\b/.test(chunk),
  );
}

function isBarrelFile(rel) {
  try {
    return isPureReexportBarrel(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  } catch {
    return false;
  }
}

function collectScope() {
  return walk(path.join(ROOT, 'src'))
    .map(relOf)
    .filter(
      (rel) => rel.endsWith('.ts') && !rel.endsWith('.d.ts') && !rel.startsWith(ENTRYPOINT_PREFIX),
    )
    .filter((rel) => !isBarrelFile(rel))
    .sort();
}

/** Seeds for both directions: a guard that cannot fail is not a guard. */
function selfTest() {
  const barrel = [
    "import type { Foo } from './types';",
    "export * from './api';",
    'export {',
    '  makeThing,',
    '  type ThingConfig,',
    "} from './thing';",
  ].join('\n');
  const withConst = `${barrel}\nexport const DEFAULT_TIMEOUT = 5000;\n`;
  const withFn = "export * from './api';\nexport function setup(): void {}\n";
  const withDefault = "export { a } from './x';\nexport default { a };\n";
  const withArrow = 'export const helper = (n: number) => n + 1;\n';
  const withCommentOnlyLogic = `// re-exports only\n${barrel}\n`;
  const shadcnStyle = [
    "export { default as UmmButton } from './UmmButton.vue';",
    "export { rootClasses } from './root-classes';",
  ].join('\n');
  const empty = '\n';
  const cases = [
    ['pure barrel is exempt', isPureReexportBarrel(barrel), true],
    ['comment text does not block exemption', isPureReexportBarrel(withCommentOnlyLogic), true],
    ['`export { default as X } from` is still a barrel', isPureReexportBarrel(shadcnStyle), true],
    ['exported const is NOT exempt', isPureReexportBarrel(withConst), false],
    ['exported function is NOT exempt', isPureReexportBarrel(withFn), false],
    ['export default is NOT exempt', isPureReexportBarrel(withDefault), false],
    ['exported arrow helper is NOT exempt', isPureReexportBarrel(withArrow), false],
    ['empty file is NOT exempt', isPureReexportBarrel(empty), false],
  ];
  let failed = 0;
  for (const [name, actual, want] of cases) {
    if (actual === want) {
      console.log(`  ok  ${name}`);
    } else {
      failed++;
      console.error(`  FAIL ${name}: got ${actual}, want ${want}`);
    }
  }
  console.log(
    failed === 0
      ? `✅ orphan-tests self-test: ${cases.length}/${cases.length} seeds behave`
      : `❌ orphan-tests self-test: ${failed} seed(s) broken`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

function collectSpecs() {
  return walk(path.join(ROOT, 'tests', 'unit'))
    .map(relOf)
    .filter((rel) => rel.endsWith(SPEC_SUFFIX))
    .sort();
}

/** BFS from every unit spec through the static-import graph; returns reached repo-rel files. */
function reachableFromSpecs(specs) {
  const seen = new Set();
  const queue = [...specs];
  while (queue.length) {
    const rel = queue.shift();
    if (seen.has(rel)) continue;
    seen.add(rel);
    let code;
    try {
      code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    } catch {
      continue;
    }
    for (const spec of extractImports(code)) {
      const target = resolveSpecifier(spec, rel);
      if (target && !seen.has(target)) queue.push(target);
    }
  }
  return seen;
}

function readBaseline() {
  if (!fs.existsSync(BASELINE_FILE)) return null;
  let data;
  try {
    data = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
  } catch {
    // A corrupt baseline must read as a clear gate error, not a JSON stack trace.
    console.error('❌ orphan-tests: baseline is not valid JSON — rerun with --baseline.');
    process.exit(1);
  }
  return new Set(Array.isArray(data.uncovered) ? data.uncovered : []);
}

function writeBaseline(uncovered) {
  const json = JSON.stringify({ uncovered: [...uncovered].sort() }, null, 2) + '\n';
  fs.writeFileSync(BASELINE_FILE, json.replace(/\r\n/g, '\n'), 'utf8');
}

function main() {
  if (process.argv.includes('--self-test')) selfTest();
  const scope = collectScope();
  const specs = collectSpecs();
  const reached = reachableFromSpecs(specs);
  const uncovered = scope.filter((rel) => !reached.has(rel));

  if (process.argv.includes('--baseline')) {
    writeBaseline(uncovered);
    console.log(
      `✅ orphan-tests baseline written: ${uncovered.length} uncovered / ${scope.length} in scope`,
    );
    process.exit(0);
  }

  const baseline = readBaseline();
  if (!baseline) {
    console.error('❌ orphan-tests: scripts/orphan-tests-baseline.json missing.');
    console.error('   Generate it: node scripts/check-orphan-tests.cjs --baseline');
    process.exit(1);
  }

  const fresh = uncovered.filter((rel) => !baseline.has(rel));
  const stale = [...baseline].filter((rel) => !uncovered.includes(rel));

  if (stale.length) {
    console.log(`ℹ️  ${stale.length} baselined module(s) are now covered — prune via --baseline:`);
    for (const rel of stale) console.log(`   - ${rel}`);
  }
  if (fresh.length) {
    console.error(
      `❌ orphan-tests ratchet: ${fresh.length} new uncovered module(s) ` +
        `(${uncovered.length}/${scope.length} uncovered in scope)`,
    );
    for (const rel of fresh) console.error(`   - ${rel}`);
    console.error('   Fix: add a unit spec importing them, or — to lower the ratchet,');
    console.error('   delete the entry once the module is covered (then run --baseline).');
    process.exit(1);
  }
  console.log(
    `✅ orphan-tests ratchet: PASS (${scope.length - uncovered.length} covered, ` +
      `${uncovered.length}/${scope.length} uncovered, baseline holds)`,
  );
}

main();
