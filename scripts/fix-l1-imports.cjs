#!/usr/bin/env node
/**
 * L1 导入修复（umpp W3 · ADR-026 D6）— 幂等
 *
 * 修正 migrate-l1-libraries.cjs 的两处缺陷：
 *   (1) 裸 @/ 别名（@/utils、@/config、@/shared/locales、@/shared/identity、@/shared/toast）
 *       边界断言补 $（否则无子路径时不改写）
 *   (2) 相对导入：被搬文件指向「未搬文件」的（源下移导致断裂）未重算
 *
 * 策略：
 *   - @/ 别名：前缀重写（边界 / | " | ' | $）
 *   - 相对导入：解析到当前位置；若「按扩展名/目录索引」均不存在（断裂）→
 *     经文件旧位置求旧目标，按 MOVED 映射或保持原位，再从文件「新位置」重算相对路径
 *
 * 用法：node scripts/fix-l1-imports.cjs [--dry]
 */
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const DRY = process.argv.includes('--dry');

const MOVES = [
  ['src/utils', 'src/libraries/utils', 'dir'],
  ['src/config.ts', 'src/libraries/config.ts', 'file'],
  ['src/shared/ui', 'src/libraries/ui', 'dir'],
  ['src/shared/styles', 'src/libraries/styles', 'dir'],
  ['src/shared/locales', 'src/libraries/locales', 'dir'],
  ['src/shared/plugins', 'src/libraries/plugins', 'dir'],
  ['src/shared/identity.ts', 'src/libraries/identity.ts', 'file'],
  ['src/shared/toast.ts', 'src/libraries/toast.ts', 'file'],
];
const DIR_MAP = {
  'src/utils': 'src/libraries/utils',
  'src/shared/ui': 'src/libraries/ui',
  'src/shared/styles': 'src/libraries/styles',
  'src/shared/locales': 'src/libraries/locales',
  'src/shared/plugins': 'src/libraries/plugins',
};

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(abs));
    else out.push(abs);
  }
  return out;
}

// 文件已搬至新位置：从「新位置」反推「旧位置」构建映射
const NEW_TO_OLD = new Map();
for (const [from, to, type] of MOVES) {
  const fromAbs = path.join(ROOT, from);
  const toAbs = path.join(ROOT, to);
  if (type === 'dir') {
    for (const f of walk(toAbs)) {
      const rel = path.relative(toAbs, f);
      NEW_TO_OLD.set(f, path.join(fromAbs, rel));
    }
  } else NEW_TO_OLD.set(toAbs, fromAbs);
}
const OLD_OF = NEW_TO_OLD; // 新路径 → 旧路径
const MOVED = new Map(); // 旧路径 → 新路径
for (const [k, v] of NEW_TO_OLD) MOVED.set(v, k);

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

const ALIAS_REWRITES = [
  ['@/utils', '@/libraries/utils'],
  ['@/config', '@/libraries/config'],
  ['@/shared/ui', '@/libraries/ui'],
  ['@/shared/styles', '@/libraries/styles'],
  ['@/shared/locales', '@/libraries/locales'],
  ['@/shared/plugins', '@/libraries/plugins'],
  ['@/shared/identity', '@/libraries/identity'],
  ['@/shared/toast', '@/libraries/toast'],
];
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
  if (existsLike(currentTarget)) return null; // 当前可解析 → 不动
  // 断裂：经文件旧位置求旧目标
  const oldFileAbs = OLD_OF.has(fileAbs) ? OLD_OF.get(fileAbs) : fileAbs;
  const oldDir = path.dirname(oldFileAbs);
  const oldTarget = path.resolve(oldDir, clean);
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

// ---------- 改写 src + tests ----------
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
for (const fileAbs of sources) {
  const code = fs.readFileSync(fileAbs, 'utf8');
  let newCode = code;
  for (const spec of extractSpecs(code)) {
    let next = null;
    if (spec.startsWith('@/')) next = rewriteAlias(spec);
    else if (spec.startsWith('.')) next = fixRelative(fileAbs, spec);
    if (next && next !== spec) {
      const esc = spec.replace(/[.*+?^${}()|[\]\\`]/g, '\\$&');
      const re = new RegExp('([\'"`])' + esc + '([\'"`])', 'g');
      const before = newCode;
      newCode = newCode.replace(re, (_m, q1, q2) => q1 + next + q2);
      if (newCode !== before) {
        if (spec.startsWith('@/')) aliasEdits++;
        else relEdits++;
      }
    }
  }
  if (newCode !== code) {
    changedFiles++;
    if (!DRY) fs.writeFileSync(fileAbs, newCode);
  }
}

console.log(`\n=== L1 import fixup ${DRY ? '(DRY RUN)' : '(EXECUTED)'} ===`);
console.log(`@/ alias edits:        ${aliasEdits}`);
console.log(`relative import edits: ${relEdits}`);
console.log(`total changed files:   ${changedFiles}`);
