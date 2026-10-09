#!/usr/bin/env node
/**
 * Test-global isolation guard (ADR-026 需求 14 · X19).
 *
 * Playwright reuses one worker for several spec files, so a spec that writes
 * `globalThis` (chrome / document / window / Storage / matchMedia …) without
 * restoring it leaks that stub into whatever file the worker runs next. The
 * combined suite then passes only by file→worker allocation luck: the same set
 * of specs fails when allocation changes (the committed baseline in
 * test-globals-baseline.json is the authoritative count, never this comment).
 *
 * Rule: every test-global write must be paired with an observable release —
 *  1. direct writes (`Object.defineProperty(globalThis, …)`, `globalThis.x = …`,
 *     `Reflect.set`, `delete globalThis.x`, including through `const g = globalThis`
 *     aliases) need a restore OPERATION inside an `afterAll` / `afterEach` /
 *     `finally` body; a cleanup body that merely mentions "saved"/"cleanup" does
 *     not count, because a word is not an action.
 *  2. sandbox helper calls (`defineGlobal` …) are only self-healing when the
 *     helper can register this file's hooks, i.e. the install runs at module
 *     scope or the file called `initFileSandbox()` at module scope. Local copies
 *     of the helper do not inherit that guarantee, so a helper-named call
 *     without the `global-sandbox` import is a leak.
 *  3. production modules exposing test injection APIs (`__bind…ForTests(x)`) hold
 *     a module-level singleton for the whole worker; the file must unbind
 *     (`__bind…ForTests(undefined)`) in a cleanup body.
 * Existing offenders are grandfathered in a baseline that may only SHRINK.
 *
 * Usage:
 *   node scripts/check-test-globals.cjs              # ratchet check
 *   node scripts/check-test-globals.cjs --baseline   # regenerate baseline
 *   node scripts/check-test-globals.cjs --self-test   # fixture assertions
 *   node scripts/check-test-globals.cjs --json        # machine-readable report
 */
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const SCAN_DIRS = [path.join(ROOT, 'tests')];
const EXTS = ['.ts', '.tsx'];
const SKIP_DIRS = new Set([
  'node_modules',
  'test-results',
  'playwright-report',
  'fixtures',
  'helpers',
]);
const BASELINE_FILE = path.join(__dirname, 'test-globals-baseline.json');

const GLOBAL_OBJECTS = new Set(['globalThis', 'global', 'window', 'self']);
const GLOBAL_SETTER_HELPERS = new Set(['defineGlobal', 'setGlobal', 'installGlobal', 'withGlobal']);
const GLOBAL_RESTORE_HELPERS = new Set(['restoreGlobals', 'resetGlobals', 'deleteGlobal']);
/** Callbacks handed to Playwright run in the PAGE, not in the spec worker, so a
 *  `globalThis` write there cannot leak into another spec file. */
const BROWSER_SIDE_CALLS = new Set([
  'evaluate',
  'evaluateHandle',
  'addInitScript',
  'waitForFunction',
  'exposeFunction',
]);
const CLEANUP_CALL_RE = /^after(All|Each|Suite)$/;
const TEST_BINDING_RE = /ForTests$/;

function listSpecFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(path.join(d, entry.name));
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name);
      if (!EXTS.includes(ext)) continue;
      if (entry.name.endsWith('.d.ts')) continue;
      out.push(path.join(d, entry.name));
    }
  };
  walk(dir);
  return out;
}

/**
 * True when an expression ultimately addresses a global holder, following
 * `const g = globalThis` aliases collected for the file (alias writes were a
 * measured blind spot: `g.chrome = {}` is the same leak as `globalThis.chrome`).
 */
function holderOf(node) {
  if (!node) return undefined;
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isSatisfiesExpression(node)
  )
    return holderOf(node.expression);
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node))
    return holderOf(node.expression);
  if (ts.isIdentifier(node)) return node;
  return undefined;
}

function isGlobalHolder(node, aliases) {
  const id = holderOf(node);
  return !!id && aliases.has(id.text);
}

/** True when the node sits in an argument of a Playwright page-side call. */
function isInBrowserSideCallback(node) {
  for (let cur = node; cur.parent; cur = cur.parent) {
    const parent = cur.parent;
    if (
      ts.isCallExpression(parent) &&
      parent.arguments.some((arg) => arg === cur) &&
      BROWSER_SIDE_CALLS.has(calleeName(parent.expression))
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Identifiers bound to a global holder somewhere in the file (`const g = globalThis`)
 * count as holders too; a local binding that shadows a holder name (`const { window }
 * = new JSDOM(…)`, a `window` parameter) does not — writing to that object cannot
 * reach the spec worker's global scope.
 */
function collectAliases(sourceFile) {
  const aliases = new Set(GLOBAL_OBJECTS);
  const shadowed = new Set();
  const bindName = (name) => {
    if (name && ts.isIdentifier(name) && GLOBAL_OBJECTS.has(name.text)) shadowed.add(name.text);
  };
  const findShadows = (node) => {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      if (ts.isIdentifier(node.name)) {
        if (!isGlobalHolder(node.initializer, aliases)) bindName(node.name);
      } else if (ts.isObjectBindingPattern(node.name) || ts.isArrayBindingPattern(node.name)) {
        if (!isGlobalHolder(node.initializer, aliases)) {
          for (const element of node.name.elements) bindName(element.propertyName ?? element.name);
        }
      }
    }
    if (ts.isParameter(node)) bindName(node.name);
    if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) bindName(node.name);
    ts.forEachChild(node, findShadows);
  };
  findShadows(sourceFile);
  for (const name of shadowed) aliases.delete(name);
  for (let pass = 0; pass < 3; pass++) {
    let grew = false;
    const visit = (node) => {
      if (
        ts.isVariableDeclaration(node) &&
        node.initializer &&
        ts.isIdentifier(node.name) &&
        !aliases.has(node.name.text) &&
        !shadowed.has(node.name.text) &&
        isGlobalHolder(node.initializer, aliases)
      ) {
        aliases.add(node.name.text);
        grew = true;
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    if (!grew) break;
  }
  return aliases;
}

function calleeName(node) {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  return '';
}

/** Call nodes are evaluated when their enclosing code runs, so an install only
 *  happens during suite build (when the sandbox can register the file's hooks)
 *  at module scope or inside a `describe` callback; installs inside tests or
 *  hooks cannot self-heal. */
function isSuiteBuildingScope(node) {
  for (let cur = node; cur; cur = cur.parent) {
    if (ts.isSourceFile(cur)) return true;
    if (ts.isFunctionLike(cur)) {
      const call = cur.parent;
      if (!call || !ts.isCallExpression(call)) return false;
      if (calleeName(call.expression) !== 'describe') return false;
    }
  }
  return true;
}

function findGlobalWrites(sourceFile, aliases) {
  const writes = [];
  const add = (node, kind, viaHelper) =>
    writes.push({
      pos: node.getStart(sourceFile),
      kind,
      viaHelper,
      suite: isSuiteBuildingScope(node),
    });
  const visit = (node) => {
    if (isInBrowserSideCallback(node)) return;
    // Object.defineProperty(globalThis, key, …) / Reflect.set(globalThis, …)
    if (ts.isCallExpression(node)) {
      const name = calleeName(node.expression);
      if (GLOBAL_SETTER_HELPERS.has(name)) {
        add(node, name, true);
      } else if (ts.isPropertyAccessExpression(node.expression)) {
        const method = node.expression.name.text;
        if (
          (method === 'defineProperty' || method === 'set') &&
          isGlobalHolder(node.arguments[0], aliases)
        ) {
          add(node, method, false);
        }
      }
    }
    // globalThis.chrome = … / (globalThis as X).chrome = … / window['chrome'] = … / g.chrome = …
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      isGlobalHolder(node.left, aliases)
    ) {
      add(node, 'assign', false);
    }
    // delete globalThis.chrome
    if (ts.isDeleteExpression(node) && isGlobalHolder(node.operand, aliases)) {
      add(node, 'delete', false);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return writes;
}

/**
 * Second leak channel: a production module-level singleton bound through a test
 * injection API (`__bind…ForTests(area)`) keeps that binding for every later
 * spec in the same worker, and no `globalThis` write is involved.
 */
function isUnsetArg(node) {
  if (!node) return true;
  if (node.kind === ts.SyntaxKind.NullKeyword) return true;
  if (ts.isIdentifier(node)) return node.text === 'undefined';
  return ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.VoidKeyword;
}

function findBindingWrites(sourceFile) {
  const out = [];
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const name = calleeName(node.expression);
      if (
        TEST_BINDING_RE.test(name) &&
        node.arguments.length > 0 &&
        !isUnsetArg(node.arguments[0])
      ) {
        out.push(name);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return out;
}

/** Cleanup constructs that can hold a restore: `afterAll` / `afterEach` / `test.afterAll` callbacks and `finally` blocks. */
function cleanupBodies(sourceFile) {
  const bodies = [];
  const visit = (node) => {
    if (ts.isBlock(node) && ts.isTryStatement(node.parent) && node.parent.finallyBlock === node) {
      bodies.push(node);
    }
    if (ts.isCallExpression(node) && CLEANUP_CALL_RE.test(calleeName(node.expression))) {
      const last = node.arguments[node.arguments.length - 1];
      if (last && (ts.isBlock(last) || ts.isFunctionLike(last))) bodies.push(last);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return bodies;
}

/**
 * A cleanup body restores only if it performs a restore OPERATION — writing a
 * global back, deleting it, or calling the sandbox's own restore API. A mere
 * mention of "cleanup" / "saved" in the body is not evidence (the word-match
 * exemption was a measured blind spot that cleared whole files).
 */
function restoresGlobals(body, aliases) {
  let found = false;
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      if (
        ts.isPropertyAccessExpression(node.expression) &&
        (node.expression.name.text === 'defineProperty' || node.expression.name.text === 'set') &&
        isGlobalHolder(node.arguments[0], aliases)
      ) {
        found = true;
      }
      if (GLOBAL_RESTORE_HELPERS.has(calleeName(node.expression))) found = true;
    }
    if (ts.isDeleteExpression(node) && isGlobalHolder(node.operand, aliases)) found = true;
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      isGlobalHolder(node.left, aliases)
    ) {
      found = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(body);
  return found;
}

function unbindsAll(body, names) {
  return names.every((name) =>
    containsCall(body, (callee, args) => callee === name && isUnsetArg(args[0])),
  );
}

function containsCall(node, predicate, scope) {
  let found = false;
  const visit = (child) => {
    if (ts.isCallExpression(child)) {
      const callee = child.expression;
      if (predicate(calleeName(callee), child.arguments) && (!scope || scope(child))) {
        found = true;
      }
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

function analyzeText(fileName, text) {
  if (!/global|\bwindow\b|\bself\s*[.[]|Reflect\.set|defineGlobal|ForTests/.test(text)) {
    return { leaks: 0, restored: true, installs: 0, reasons: [] };
  }
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const aliases = collectAliases(sf);
  const writes = findGlobalWrites(sf, aliases);
  const bindings = findBindingWrites(sf);
  if (writes.length === 0 && bindings.length === 0) {
    return { leaks: 0, restored: true, installs: 0, reasons: [] };
  }
  const bodies = cleanupBodies(sf);
  const direct = writes.filter((w) => !w.viaHelper);
  const helper = writes.filter((w) => w.viaHelper);
  const reasons = [];
  if (direct.length && !bodies.some((b) => restoresGlobals(b, aliases))) {
    reasons.push(`unrestored-globalThis-writes:${direct.length}`);
  }
  if (helper.length) {
    const initTop = containsCall(
      sf,
      (callee) => callee === 'initFileSandbox',
      isSuiteBuildingScope,
    );
    const selfRegistering = initTop || helper.every((w) => w.suite);
    if (!/from\s+['"][^'"]*global-sandbox['"]/.test(text)) {
      reasons.push(`helper-writes-without-sandbox-import:${helper.length}`);
    } else if (!selfRegistering) {
      reasons.push(`sandbox-installs-inside-tests-without-initFileSandbox:${helper.length}`);
    }
  }
  if (bindings.length && !bodies.some((b) => unbindsAll(b, [...new Set(bindings)]))) {
    reasons.push(`unreleased-test-bindings:${bindings.length}`);
  }
  const leaks = reasons.reduce((sum, r) => sum + Number(r.split(':')[1]), 0);
  return { leaks, restored: leaks === 0, installs: writes.length + bindings.length, reasons };
}

function analyzeFile(filePath) {
  return analyzeText(filePath, fs.readFileSync(filePath, 'utf8'));
}

function rel(p) {
  return path.relative(ROOT, p).split(path.sep).join('/');
}

function collect() {
  const findings = [];
  let scanned = 0;
  let writingFiles = 0;
  for (const dir of SCAN_DIRS) {
    if (!fs.existsSync(dir)) continue;
    for (const file of listSpecFiles(dir)) {
      scanned++;
      const { leaks, installs, reasons } = analyzeFile(file);
      if (installs > 0) writingFiles++;
      if (leaks > 0) findings.push({ file: rel(file), leaks, reasons });
    }
  }
  findings.sort((a, b) => (a.file < b.file ? -1 : 1));
  return { findings, offenders: findings.map((f) => f.file), scanned, writingFiles };
}

function readBaseline() {
  if (!fs.existsSync(BASELINE_FILE)) return [];
  const data = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
  return Array.isArray(data.files) ? data.files : [];
}

const SELF_TEST_FIXTURES = [
  {
    name: 'leak: defineProperty without restore',
    code: `import { test } from '@playwright/test';
function defineGlobal(key: string, value: unknown): void {
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
}
defineGlobal('chrome', {});
test('a', () => {});
`,
    expectLeaks: true,
  },
  {
    name: 'leak: direct assignment without restore',
    code: `import { test } from '@playwright/test';
(globalThis as { chrome?: unknown }).chrome = { runtime: {} };
test('a', () => {});
`,
    expectLeaks: true,
  },
  {
    name: 'clean: afterAll restores saved descriptors',
    code: `import { test, afterAll } from '@playwright/test';
const saved = Object.getOwnPropertyDescriptor(globalThis, 'chrome');
Object.defineProperty(globalThis, 'chrome', { value: {}, configurable: true, writable: true });
afterAll(() => {
  if (saved) Object.defineProperty(globalThis, 'chrome', saved);
  else delete (globalThis as { chrome?: unknown }).chrome;
});
test('a', () => {});
`,
    expectLeaks: false,
  },
  {
    name: 'clean: shared sandbox helper owns the restore',
    code: `import { test } from '@playwright/test';
import { defineGlobal } from '../helpers/global-sandbox';
defineGlobal('chrome', {});
test('a', () => {});
`,
    expectLeaks: false,
  },
  {
    name: 'clean: per-test finally restores',
    code: `import { test, expect } from '@playwright/test';
const original = Object.getOwnPropertyDescriptor(globalThis, 'chrome');
test('a', () => {
  Object.defineProperty(globalThis, 'chrome', { value: {}, configurable: true, writable: true });
  try {
    expect(globalThis.chrome).toBeDefined();
  } finally {
    if (original) Object.defineProperty(globalThis, 'chrome', original);
  }
});
`,
    expectLeaks: false,
  },
  {
    name: 'no false positive: globals only read',
    code: `import { test, expect } from '@playwright/test';
test('a', () => {
  expect(window.location.href).toBe('https://example.com/');
  expect(globalThis.document.readyState).toBe('complete');
});
`,
    expectLeaks: false,
  },
  {
    name: 'no false positive: unrelated defineProperty on own object',
    code: `import { test } from '@playwright/test';
const target = { id: 1 };
Object.defineProperty(target, 'shadow', { value: true });
test('a', () => {});
`,
    expectLeaks: false,
  },
  {
    name: 'leak: bare helper call inside a test without initFileSandbox',
    code: `import { test } from '@playwright/test';
import { defineGlobal } from '../helpers/global-sandbox';
test('a', () => {
  defineGlobal('chrome', {});
});
`,
    expectLeaks: true,
  },
  {
    name: 'clean: initFileSandbox at module scope registers the file',
    code: `import { test } from '@playwright/test';
import { defineGlobal, initFileSandbox } from '../helpers/global-sandbox';
initFileSandbox();
test('a', () => {
  defineGlobal('chrome', {});
});
`,
    expectLeaks: false,
  },
  {
    name: 'leak: helper-named call with a local copy (no sandbox import)',
    code: `import { test } from '@playwright/test';
function defineGlobal(key: string, value: unknown): void {
  Object.defineProperty(globalThis, key, { value, configurable: true });
}
test('a', () => {
  defineGlobal('chrome', {});
});
`,
    expectLeaks: true,
  },
  {
    name: 'leak: alias write (const g = globalThis) without restore',
    code: `import { test } from '@playwright/test';
const g = globalThis as { chrome?: unknown };
g.chrome = { runtime: {} };
test('a', () => {});
`,
    expectLeaks: true,
  },
  {
    name: 'leak: cleanup body only mentions restore words, performs no restore',
    code: `import { test, afterAll } from '@playwright/test';
Object.defineProperty(globalThis, 'chrome', { value: {}, configurable: true });
afterAll(() => {
  console.log('cleanup done, saved originals restored by helper');
});
test('a', () => {});
`,
    expectLeaks: true,
  },
  {
    name: 'clean: afterAll writes the saved original back',
    code: `import { test, afterAll } from '@playwright/test';
const ORIGINAL = Object.getOwnPropertyDescriptor(globalThis, 'chrome');
Object.defineProperty(globalThis, 'chrome', { value: {}, configurable: true });
afterAll(() => {
  (globalThis as { chrome?: unknown }).chrome = ORIGINAL;
});
test('a', () => {});
`,
    expectLeaks: false,
  },
  {
    name: 'leak: production test binding never released',
    code: `import { test, beforeAll } from '@playwright/test';
import { __bindSettingsAreaForTests } from '@/engine/settings/items';
beforeAll(() => {
  __bindSettingsAreaForTests({ get: () => {}, set: () => {} });
});
test('a', () => {});
`,
    expectLeaks: true,
  },
  {
    name: 'clean: binding released in afterAll',
    code: `import { test, beforeAll, afterAll } from '@playwright/test';
import { __bindSettingsAreaForTests } from '@/engine/settings/items';
beforeAll(() => {
  __bindSettingsAreaForTests({ get: () => {}, set: () => {} });
});
afterAll(() => {
  __bindSettingsAreaForTests(undefined);
});
test('a', () => {});
`,
    expectLeaks: false,
  },
  {
    name: 'no false positive: write inside a page-side evaluate callback',
    code: `import { test, expect } from '@playwright/test';
test('a', async ({ page }) => {
  await page.addInitScript(() => {
    (globalThis as { __probe?: number }).__probe = 1;
  });
  expect(await page.evaluate(() => (window as { x?: number }).x = 2)).toBe(2);
});
`,
    expectLeaks: false,
  },
  {
    name: 'no false positive: jsdom window shadowed by a local binding',
    code: `import { test, expect } from '@playwright/test';
import { JSDOM } from 'jsdom';
const { window } = new JSDOM('<body></body>').window;
window.matchMedia = () => ({ matches: false });
test('a', () => {
  expect(window.document.body.tagName).toBe('BODY');
});
`,
    expectLeaks: false,
  },
];

function selfTest() {
  let pass = 0;
  let fail = 0;
  for (const fixture of SELF_TEST_FIXTURES) {
    const fileName = path.join(ROOT, 'tests', 'unit', 'selftest_fixture.spec.ts');
    const { leaks, reasons } = analyzeText(fileName, fixture.code);
    if (leaks > 0 === fixture.expectLeaks) {
      pass++;
      console.log(`  ✓ ${fixture.name}`);
    } else {
      fail++;
      console.log(
        `  ✗ ${fixture.name} — expected leak=${fixture.expectLeaks}, got ${leaks > 0} (${reasons.join(', ') || 'none'})`,
      );
    }
  }
  console.log(`isolation self-test: ${pass} passed, ${fail} failed`);
  return fail === 0 ? 0 : 1;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) process.exit(selfTest());

  const { findings, offenders, scanned, writingFiles } = collect();
  const reasonsByFile = Object.fromEntries(findings.map((f) => [f.file, f.reasons]));
  const totalLeaks = findings.reduce((sum, f) => sum + f.leaks, 0);

  if (args.includes('--baseline')) {
    fs.writeFileSync(
      BASELINE_FILE,
      `${JSON.stringify(
        { files: offenders, count: offenders.length, totalLeaks, reasonsByFile },
        null,
        2,
      )}\n`,
    );
    console.log(
      `test-globals baseline written: ${offenders.length} leaking spec files, ${totalLeaks} unreleased writes (${scanned} scanned)`,
    );
    process.exit(0);
  }

  const baseline = readBaseline();
  const known = new Set(baseline);
  const added = offenders.filter((f) => !known.has(f));
  const fixed = baseline.filter((f) => !offenders.includes(f));

  if (args.includes('--json')) {
    console.log(
      JSON.stringify(
        {
          scanned,
          writingFiles,
          totalLeaks,
          findings,
          offenders,
          baselineCount: baseline.length,
          added,
          fixed,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(
      `test-globals check — ${scanned} spec files scanned, ${writingFiles} install test state, ${offenders.length} of them never release it, ${totalLeaks} unreleased installs (baseline ${baseline.length})`,
    );
    for (const f of added) console.log(`  NEW leak: ${f} — ${reasonsByFile[f].join(', ')}`);
    for (const f of fixed)
      console.log(`  ✓ cleaned since baseline: ${f} (remove it from the baseline)`);
  }

  if (added.length > 0) {
    console.error(
      `\nisolation:check FAILED — ${added.length} new spec file(s) install test state without releasing it.\n` +
        `Playwright reuses workers across files, so an unrestored stub leaks into the next file and turns\n` +
        `the combined run into order-dependent luck. Three channels are checked:\n` +
        `  1) globalThis writes (incl. aliases) → restore OPERATION in afterAll/afterEach/finally\n` +
        `  2) helpers/global-sandbox installs → module scope, or initFileSandbox() at module scope\n` +
        `  3) production __*ForTests bindings → unbind with undefined/null in a cleanup body\n`,
    );
    process.exit(1);
  }
  if (fixed.length > 0 && !args.includes('--json')) {
    console.log(
      `\nBaseline may only shrink: run \`node scripts/check-test-globals.cjs --baseline\` to lock in the ${fixed.length} fixes.`,
    );
  }
  if (!args.includes('--json')) console.log('✅ test-globals ratchet: PASS');
  process.exit(0);
}

main();
