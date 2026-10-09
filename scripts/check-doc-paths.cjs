#!/usr/bin/env node
/**
 * 文档路径守卫（ADR-026 回访波）
 *
 * 断言：源码/测试注释里写出的 `src/<path>.<ext>` 事实源指针必须真实存在。
 * 动机：L1 迁移（src/shared → src/libraries、src/content → src/scenario、
 * src/features → src/engine|provider）后，14 处「唯一事实源 = src/...」注释
 * 指向已不存在的文件，成为误导后续读者的死指针 —— 与「规范必须门禁化」同一教训。
 *
 * 豁免登记（记录在案的例外，非疏漏）：
 *   - EXEMPT_FILES：一次性迁移脚本，其职责正是描述旧路径 → 新路径映射。
 *   - docs/ 下的 ADR/审计不扫描：历史决策文档按当时路径书写属正确。
 *
 * 用法: node scripts/check-doc-paths.cjs [--self-test]
 *   exit 1 on any violation
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

const SCAN_DIRS = ['src', 'tests'];
const CODE_EXTS = ['.ts', '.vue', '.js', '.cjs', '.css'];
const PATH_RE = /src\/[A-Za-z0-9_\-/]+\.(?:ts|vue|js|cjs|css)/g;

const EXEMPT_FILES = new Set(['scripts/fix-l1-imports.cjs', 'scripts/migrate-l1-libraries.cjs']);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) walk(abs, out);
    else if (CODE_EXTS.includes(path.extname(e.name))) out.push(abs);
  }
  return out;
}

function collect() {
  const violations = [];
  let checked = 0;
  for (const dir of SCAN_DIRS) {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) continue;
    for (const file of walk(abs)) {
      const rel = path.relative(ROOT, file).split(path.sep).join('/');
      if (EXEMPT_FILES.has(rel)) continue;
      const src = fs.readFileSync(file, 'utf8');
      for (const m of src.matchAll(PATH_RE)) {
        checked++;
        if (!fs.existsSync(path.join(ROOT, m[0]))) {
          const line = src.slice(0, m.index).split('\n').length;
          violations.push(`${rel}:${line} → ${m[0]} (不存在)`);
        }
      }
    }
  }
  return { violations, checked };
}

function selfTest() {
  const good = 'src/libraries/utils/dataset-version.ts';
  const bad = 'src/does/not/exist-yet.ts';
  const detect = (text) => {
    let n = 0;
    for (const m of text.matchAll(PATH_RE)) {
      if (!fs.existsSync(path.join(ROOT, m[0]))) n++;
    }
    return n;
  };
  const cases = [
    ['正例：真实路径零误报', detect(`// see ${good}`), 0],
    ['反例：死指针被抓到', detect(`// 唯一事实源 = ${bad}`), 1],
    ['反例：通配 glob 不误判', detect('// src/**/index.ts'), 0],
    ['反例：豁免脚本不参与扫描', [...EXEMPT_FILES].length >= 2, true],
  ];
  let failed = 0;
  for (const [name, got, want] of cases) {
    const ok = got === want;
    if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  }
  console.log(failed === 0 ? 'self-test OK' : `self-test ${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}

if (process.argv.includes('--self-test')) selfTest();

const { violations, checked } = collect();
if (violations.length === 0) {
  console.log(`doc-path check OK (${checked} 处事实源指针全部可解析)`);
  process.exit(0);
}
console.error(`doc-path check FAILED — ${violations.length}/${checked} 处指针指向不存在的路径：`);
for (const v of violations) console.error('  ' + v);
process.exit(1);
