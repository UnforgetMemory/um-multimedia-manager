#!/usr/bin/env node
/**
 * Generic layer migration (umpp W3 · ADR-026 D6).
 *
 * Idempotent mechanical relocation of a layer subtree, driven by a plan JSON:
 *   { name, moves: [{from,to,type:'dir'|'file'}], aliasRewrites: [[from,to],...] }
 *
 * Phases (mirrors the proven L1/L2 approach):
 *   A. @/ alias rewrite (selective prefixes, boundary /|"|'|$) across src + tests
 *   B. git mv (skipped if already moved)
 *   C. relative-import fixup resolved against each file's CURRENT on-disk path
 *
 * Idempotent: all reads/writes resolve to the current path (effPath); safe to re-run
 * after a partial move. Replaces the per-layer copies of migrate-lN-*.cjs.
 *
 * NOTE: guard rule edits (scripts/check-architecture.cjs) and synthetic test fixtures
 * (tests/unit/architecture-guard.spec.ts) are NOT handled here — edit those manually.
 *
 * Usage: node scripts/migrate-layer.cjs scripts/layer-plans/<layer>.json [--dry]
 */
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const planArg = process.argv.slice(2).find((a) => !a.startsWith('--'));
const DRY = process.argv.includes('--dry');
if (!planArg) {
  console.error('usage: node scripts/migrate-layer.cjs <plan.json> [--dry]');
  process.exit(2);
}
const plan = JSON.parse(fs.readFileSync(path.resolve(ROOT, planArg), 'utf8'));
const MOVES = plan.moves.map((m) => [m.from, m.to, m.type || 'dir']);
const ALIAS_REWRITES = plan.aliasRewrites || [];

// DIR_MAP derived from directory moves (for relative-import recompute).
const DIR_MAP = {};
for (const [from, to, type] of MOVES) if (type === 'dir') DIR_MAP[from] = to;

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(abs));
    else out.push(abs);
  }
  return out;
}

const MOVED = new Map(); // oldAbs → newAbs（已搬则补 new→new 恒等项，保证幂等）
for (const [from, to, type] of MOVES) {
  const fromAbs = path.join(ROOT, from);
  const toAbs = path.join(ROOT, to);
  const srcAbs = fs.existsSync(fromAbs) ? fromAbs : toAbs;
  if (type === 'dir') {
    for (const f of walk(srcAbs)) {
      const rel = path.relative(srcAbs, f);
      const oldA = path.join(fromAbs, rel);
      const newA = path.join(toAbs, rel);
      MOVED.set(oldA, newA);
      if (srcAbs === toAbs) MOVED.set(newA, newA);
    }
  } else {
    MOVED.set(fromAbs, toAbs);
    if (srcAbs === toAbs) MOVED.set(toAbs, toAbs);
  }
}

/** Resolve to the CURRENT on-disk path (exists → itself; else MOVED old→new). */
function effPath(p) {
  if (fs.existsSync(p)) return p;
  for (const [oldA, newA] of MOVED) if (oldA === p) return newA;
  return p;
}

const SPEC_RES = [
  /(?:from|import)\s*(?:type\s*)?\(?\s*['"]([^'"]+)['"]/g,
  /(?:from|import)\s*(?:type\s*)?\(?\s*`([^`$]+)`/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];
function extractSpecs(code) {
  const out = [];
  for (const re of SPEC_RES) for (const m of code.matchAll(re)) out.push(m[1]);
  return out;
}

function rewriteAlias(spec) {
  for (const [from, to] of ALIAS_REWRITES) {
    const re = new RegExp('^' + from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=/|["\']|$)');
    if (re.test(spec)) return spec.replace(re, to);
  }
  return spec;
}

function existsLike(p) {
  if (fs.existsSync(p)) return true;
  for (const ext of ['.ts', '.tsx', '.vue', '.js', '.mjs', '.cjs']) {
    if (fs.existsSync(p + ext)) return true;
  }
  if (fs.existsSync(path.join(p, 'index.ts'))) return true;
  if (fs.existsSync(path.join(p, 'index.tsx'))) return true;
  return false;
}

function fixRelative(fileAbs, spec) {
  const clean = spec.replace(/[?#].*$/, '');
  const dir = path.dirname(fileAbs);
  const currentTarget = path.resolve(dir, clean);
  if (existsLike(currentTarget)) return null;
  let oldFileAbs = fileAbs;
  for (const [oldA, newA] of MOVED)
    if (newA === fileAbs) {
      oldFileAbs = oldA;
      break;
    }
  const oldTarget = path.resolve(path.dirname(oldFileAbs), clean);
  let newTarget = null;
  if (MOVED.has(oldTarget)) newTarget = MOVED.get(oldTarget);
  else {
    for (const [oldDir2, newDir2] of Object.entries(DIR_MAP)) {
      const oa = path.join(ROOT, oldDir2);
      if (oldTarget === oa || oldTarget.startsWith(oa + path.sep)) {
        newTarget = path.join(ROOT, newDir2, path.relative(oa, oldTarget));
        break;
      }
    }
    if (!newTarget) newTarget = oldTarget;
  }
  let rel = path.relative(dir, newTarget).replace(/\\/g, '/');
  if (!rel.startsWith('.')) rel = './' + rel;
  return rel;
}

const SOURCE_RE = /\.(ts|tsx|vue|css|js|mjs|cjs)$/;
function collectSources() {
  const dirs = [path.join(ROOT, 'src'), path.join(ROOT, 'tests')];
  const out = [];
  for (const d of dirs) {
    const stack = [d];
    while (stack.length) {
      const cur = stack.pop();
      for (const e of fs.readdirSync(cur, { withFileTypes: true })) {
        const abs = path.join(cur, e.name);
        if (e.isDirectory()) stack.push(abs);
        else if (SOURCE_RE.test(e.name) && !e.name.endsWith('.d.ts')) out.push(abs);
      }
    }
  }
  return out;
}

const sources = collectSources();
let aliasEdits = 0;
let relEdits = 0;
let changedFiles = 0;

// Phase A: @/ alias rewrite (idempotent)
for (const fileAbs of sources) {
  const cur = effPath(fileAbs);
  const code = fs.readFileSync(cur, 'utf8');
  let newCode = code;
  for (const spec of extractSpecs(code)) {
    if (!spec.startsWith('@/')) continue;
    const next = rewriteAlias(spec);
    if (next && next !== spec) {
      const esc = spec.replace(/[.*+?^${}()|[\]\\`]/g, '\\$&');
      const re = new RegExp('([\'"`])' + esc + '([\'"`])', 'g');
      const before = newCode;
      newCode = newCode.replace(re, (_m, q1, q2) => q1 + next + q2);
      if (newCode !== before) aliasEdits++;
    }
  }
  if (newCode !== code) {
    changedFiles++;
    if (!DRY) fs.writeFileSync(cur, newCode);
  }
}

// Phase B: git mv (skip if already moved)
let mvCount = 0;
if (!DRY) {
  for (const [from, to] of MOVES) {
    const fromAbs = path.join(ROOT, from);
    const toAbs = path.join(ROOT, to);
    if (!fs.existsSync(fromAbs)) continue;
    fs.mkdirSync(path.dirname(toAbs), { recursive: true });
    execSync(`git mv "${fromAbs}" "${toAbs}"`, { cwd: ROOT, stdio: 'pipe' });
    mvCount++;
  }
}

// Phase C: relative-import fixup (post-mv, idempotent)
if (!DRY) {
  for (const fileAbs of sources) {
    const cur = effPath(fileAbs);
    if (!fs.existsSync(cur)) continue;
    const code = fs.readFileSync(cur, 'utf8');
    let newCode = code;
    for (const spec of extractSpecs(code)) {
      if (!spec.startsWith('.')) continue;
      const next = fixRelative(cur, spec);
      if (next && next !== spec) {
        const esc = spec.replace(/[.*+?^${}()|[\]\\`]/g, '\\$&');
        const re = new RegExp('([\'"`])' + esc + '([\'"`])', 'g');
        const before = newCode;
        newCode = newCode.replace(re, (_m, q1, q2) => q1 + next + q2);
        if (newCode !== before) relEdits++;
      }
    }
    if (newCode !== code) {
      changedFiles++;
      fs.writeFileSync(cur, newCode);
    }
  }
}

console.log(`\n=== migrate-layer "${plan.name}" ${DRY ? '(DRY RUN)' : '(EXECUTED)'} ===`);
console.log(`dirs/files moved (git mv): ${mvCount}`);
console.log(`files in moved set:        ${MOVED.size}`);
console.log(`@/ alias edits:            ${aliasEdits}`);
console.log(`relative import edits:     ${relEdits}`);
console.log(`total changed files:       ${changedFiles}`);
if (DRY) for (const [from, to] of MOVES) console.log(`  ${from}  →  ${to}`);
