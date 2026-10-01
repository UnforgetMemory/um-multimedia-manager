#!/usr/bin/env node
/**
 * 文件尺寸守卫（umpp X9 · ADR-026 需求 9「禁止大型单一文件」）
 *
 * 断言：src/ 与 tests/ 下每个 .ts/.js/.vue 文件 ≤ MAX_LINES 行。
 * 回访教训：W2 把 6 个 God 文件拆到 0 后，因无门禁一个波次内反弹到 7 个 —
 * 本守卫把「尺寸」从一次性清理变成持续契约。
 *
 * 棘轮基线（RATCHET）：登记在案的存量违规，只许变小、不许新增。
 * 每次拆分后从基线删除对应项；基线为空即需求 9 真实达成。
 *
 * 用法: node scripts/check-file-size.cjs [--self-test]
 *   exit 1 on any new violation (or when a baselined file no longer violates — remove it)
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MAX_LINES = 600;
const SCAN_DIRS = ['src', 'tests'];
const SCAN_EXT = new Set(['.ts', '.js', '.vue']);

/** 存量违规基线（相对仓库根，行数只降不升；空数组 = 全面达标）。 */
const RATCHET = new Set([
  // X9-A wave split all 8 baselined files to zero; any new violation now fails hard.
]);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) walk(abs, out);
    else out.push(abs);
  }
  return out;
}

function check() {
  const violations = [];
  const stale = new Set(RATCHET);
  for (const dir of SCAN_DIRS) {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) continue;
    for (const file of walk(abs)) {
      if (!SCAN_EXT.has(path.extname(file))) continue;
      const rel = path.relative(ROOT, file).split(path.sep).join('/');
      const lines = fs.readFileSync(file, 'utf8').split('\n').length;
      if (lines <= MAX_LINES) continue;
      stale.delete(rel);
      if (!RATCHET.has(rel)) violations.push(`${rel}: ${lines} 行 > ${MAX_LINES}`);
    }
  }
  for (const rel of stale)
    violations.push(`${rel}: 已达标 — 请从 RATCHET 基线移除（棘轮只降不升）`);
  return violations;
}

function selfTest() {
  const tmp = fs.mkdtempSync(path.join(ROOT, 'size-selftest-'));
  try {
    const fat = path.join(tmp, 'fat.ts');
    fs.writeFileSync(fat, Array.from({ length: MAX_LINES + 1 }, (_, i) => `// l${i}`).join('\n'));
    const thin = path.join(tmp, 'thin.ts');
    fs.writeFileSync(thin, '// ok\n');
    const run = (files) => {
      const caught = files.filter((f) => fs.readFileSync(f, 'utf8').split('\n').length > MAX_LINES);
      return caught;
    };
    const neg = run([fat, thin]);
    if (neg.length !== 1 || !neg[0].endsWith('fat.ts')) {
      console.error('self-test FAILED: threshold predicate wrong');
      return 1;
    }
    console.log('self-test OK: fat caught, thin clean');
    return 0;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

if (process.argv.includes('--self-test')) process.exit(selfTest());
const violations = check();
if (violations.length) {
  console.error(`❌ 文件尺寸守卫：${violations.length} 项违规（上限 ${MAX_LINES} 行）`);
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}
console.log(`✅ 文件尺寸守卫：PASS（≤${MAX_LINES} 行；基线存量 ${RATCHET.size} 项待清零）`);
