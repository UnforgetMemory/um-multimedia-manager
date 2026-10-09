#!/usr/bin/env node
/**
 * 文件命名守卫（umpp X6 · ADR-026 D6 命名统一）
 *
 * 断言：
 *   R1. src/ 下每个 .ts 文件名为 kebab-case（^[a-z0-9][a-z0-9-]*\.ts$）
 *   R2. src/ 下每个 .vue 文件名为 kebab-case 或 PascalCase（SFC 组件惯例）
 *   R3. 数据提取模块统一为 `<domain>-extract.ts` 后缀形态：
 *       basename 含 'extract' 的 .ts 必须整体匹配 ^([a-z0-9]+-)+extract\.ts$，
 *       禁止 extract.ts / extractors.ts / extractor.ts / extract-*.ts / *.extraction.ts 等偏差形态。
 *   R4. 禁止任何 *.extraction.ts（R3 的显式子集，单独报错便于定位）。
 *
 * 豁免登记（记录在案的例外，非疏漏）：
 *   - *.d.ts：环境声明，非模块。
 *   - 入口约定文件：WXT/构建工具强制名（index.ts、main.ts、background.ts、content.ts、
 *     *.content.ts、wxt 的 App.vue 等）与 i18n 语区文件（BCP-47 名与运行时 locale 码
 *     一一对应，如 zh-CN.ts —— 改小写会破坏该对应关系）。
 *
 * 用法: node scripts/check-naming.cjs [--self-test]
 *   exit 1 on any violation
 *
 * 双向验证（--self-test，参照 check-content-style-scope.cjs 的验证精神）：
 *   - 正例：全部合法/豁免名零误报
 *   - 反例：变异夹具（requestQueue.ts / extract.ts / extractors.ts / extract-foo.ts /
 *     a.extraction.ts / camelCase.vue / Foo_bar.ts）每个都被对应规则抓到
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

const KEBAB_TS = /^[a-z0-9][a-z0-9-]*\.ts$/;
const KEBAB_VUE = /^[a-z0-9][a-z0-9-]*\.vue$/;
const PASCAL_VUE = /^[A-Z][A-Za-z0-9]*\.vue$/;
const EXTRACT_CANON = /^(?:[a-z0-9]+-)+extract\.ts$/;
const EXTRACTION = /\.extraction\.ts$/;

/** 入口/约定文件名豁免（精确名匹配，作用于任意目录）。 */
const EXEMPT_BASENAMES = new Set(['index.ts', 'main.ts', 'background.ts', 'content.ts']);
/** BCP-47 语区文件（src/libraries/locales 与 content/i18n/locales 两套系统的键对应源）。 */
const LOCALE_BCP47 = /^[a-z]{2}(-[A-Z]{2})?\.ts$/;
// 相对 src/ 的前缀（与 run() 内 rel 口径一致）
const LOCALE_DIRS = ['libraries/locales/', 'entrypoints/content/i18n/locales/'];

function isExempt(rel) {
  const base = path.posix.basename(rel);
  if (base.endsWith('.d.ts')) return true;
  if (EXEMPT_BASENAMES.has(base)) return true;
  if (/\.content\.ts$/.test(base)) return true; // WXT *.content 入口文件（若以文件式命名）
  if (LOCALE_DIRS.some((d) => rel.startsWith(d)) && LOCALE_BCP47.test(base)) return true;
  return false;
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) walk(abs, out);
    else out.push(abs);
  }
  return out;
}

/** 对一组 src 相对路径执行全部规则，返回违规消息数组。 */
function checkFiles(relPaths) {
  const violations = [];
  for (const rel of relPaths) {
    const base = path.posix.basename(rel);
    if (isExempt(rel)) continue;
    if (EXTRACTION.test(base)) {
      violations.push(`R4 *.extraction.ts 残留形态: ${rel}`);
      continue;
    }
    if (base.endsWith('.ts')) {
      if (!KEBAB_TS.test(base)) violations.push(`R1 .ts 文件名非 kebab-case: ${rel}`);
      if (base.includes('extract') && !EXTRACT_CANON.test(base)) {
        violations.push(`R3 提取模块未用 <domain>-extract.ts 形态: ${rel}`);
      }
    } else if (base.endsWith('.vue')) {
      if (!KEBAB_VUE.test(base) && !PASCAL_VUE.test(base)) {
        violations.push(`R2 .vue 文件名既非 kebab-case 也非 PascalCase: ${rel}`);
      }
    }
  }
  return violations;
}

function run(srcDir) {
  const rels = walk(srcDir)
    .map((a) => path.posix.normalize(path.relative(srcDir, a).split(path.sep).join('/')))
    .filter((r) => /\.(ts|vue)$/.test(r));
  const violations = checkFiles(rels);
  if (violations.length) {
    console.log(`❌ 命名守卫违规 ${violations.length} 条`);
    for (const v of violations) console.log(`   ${v}`);
    console.log('');
    console.log('文件命名守卫：FAIL');
    process.exit(1);
  }
  console.log(`✅ 文件命名守卫：PASS（扫描 ${rels.length} 个 .ts/.vue 文件）`);
}

// ---------- --self-test：双向断言 ----------

function selfTest() {
  const legal = [
    'domain/record/store-record.ts', // R1 kebab
    'scenario/douban/pages/genre/genre-extract.ts', // R3 canonical
    'entrypoints/background.ts', // 入口豁免
    'libraries/locales/zh-CN.ts', // BCP-47 豁免
    'types/env.d.ts', // d.ts 豁免
    'scenario/douban/pages/detail/App.vue', // Pascal .vue
    'entrypoints/content/router.ts',
    'a/b/umm-page-layout.ts',
  ];
  const illegal = [
    ['libraries/utils/requestQueue.ts', /R1/],
    ['domain/identity/Identity.ts', /R1/],
    ['scenario/douban/pages/homepage/extractors.ts', /R3/],
    ['scenario/douban/pages/detail/extractor.ts', /R3/],
    ['scenario/sehuatang/extract-home.ts', /R3/],
    ['a/b/extract.ts', /R3/],
    ['a/b/x.extraction.ts', /R4/],
    ['a/b/camelCase.vue', /R2/],
    ['a/b/Foo_bar.ts', /R1/],
  ];
  const okLegal = legal.filter((r) => checkFiles([r]).length === 0);
  const caught = illegal.filter(([r, re]) => checkFiles([r]).some((v) => re.test(v)));
  const missed = illegal.map(([r]) => r).filter((r) => caught.every(([c]) => c !== r));
  const falsePos = legal.map((r) => r).filter((r) => okLegal.indexOf(r) < 0);
  if (missed.length || falsePos.length) {
    console.error('self-test FAILED');
    if (missed.length) console.error('  未抓到:', missed.join(', '));
    if (falsePos.length) console.error('  误报:', falsePos.join(', '));
    process.exit(1);
  }
  console.log(
    `self-test ok — 捕获 ${caught.length}/${illegal.length} 违规形态，${legal.length} 合法形态零误报`,
  );
}

if (process.argv.includes('--self-test')) selfTest();
else run(path.join(ROOT, 'src'));
