#!/usr/bin/env node
/**
 * CJK 裸文案棘轮门禁（X110）。
 *
 * 背景：X107–X109 把豆瓣 overlay 的自造中文全部接进内容 i18n（引号口径 RENDER 0、
 * 模板文本口径 0/44 文件）。两把量具此前只在 `.um.agents/tmp` 里临时活着——按
 * 审计 §6 信条「凡靠人工遵守的约定都必须门禁化，否则一个波次即反弹」，本脚本把
 * 它们做常驻棘轮：**按文件记录当前值，只允许下降**；新增/增长即 exit 1。
 *
 * 两个口径分开计数、绝不相加（审计规则 54）：
 *   quoted   — 引号/反引号内的 authored CJK 串（`*-data.ts` 的宿主匹配串也计入，
 *              它们是合法债务：宿主页就是中文）
 *   template — `.vue` 模板里标签之间的 authored CJK 文本（剥注释与 `{{ }}` 插值）
 *
 * 判据（与 size/orphan 同族）：
 *   1. 新文件带 CJK、或既有文件任一计数增长   → exit 1
 *   2. 计数低于基线（已改善未重锁）           → exit 1，提示 `--baseline` 重锁
 *   3. 计数等于基线                            → PASS
 * 误报姿态必须响亮：解析不出 / 读不到文件即抛错，绝不静默跳过。
 *
 * 用法：
 *   node scripts/check-cjk.cjs              # 检查（CI 用）
 *   node scripts/check-cjk.cjs --baseline   # 重锁基线（只应在收口了债之后）
 *   node scripts/check-cjk.cjs --self-test  # 种子自检（两口径各 3 条）
 *   node scripts/check-cjk.cjs --detail     # 打印逐文件明细
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SCOPE = path.join(ROOT, 'src', 'scenario', 'douban');
const BASELINE_FILE = path.join(__dirname, 'cjk-baseline.json');
const HAN = /[㐀-䶿一-鿿]/;

// ---------- 口径 1：引号/反引号内的 CJK 串（剥注释后） ----------
function stripComments(src) {
  let out = '';
  let i = 0;
  let quote = '';
  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];
    if (quote) {
      out += ch;
      if (ch === '\\') {
        out += next ?? '';
        i += 2;
        continue;
      }
      if (ch === quote) quote = '';
      i++;
      continue;
    }
    if (ch === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') quote = ch;
    out += ch;
    i++;
  }
  return out;
}

function quotedUnits(code) {
  const units = [];
  const strRe = /(['"])((?:\\.|(?!\1)[^\\\n])*)\1|`([\s\S]*?)`/g;
  let m;
  while ((m = strRe.exec(code)) !== null) {
    const body = m[2] ?? m[3] ?? '';
    if (!HAN.test(body)) continue;
    if (m[3] !== undefined) {
      const text = body.replace(/\$\{[^}]*\}/g, '');
      const runs = text.match(/[㐀-䶿一-鿿][^<>"'`]{0,40}/g) ?? [];
      for (const r of runs) units.push(r.trim());
    } else {
      units.push(body.trim());
    }
  }
  return units;
}

// ---------- 口径 2：`.vue` 模板标签之间的 CJK 文本 ----------
function templateUnits(code) {
  const out = [];
  const re = /<template\b[^>]*>([\s\S]*?)<\/template>/g;
  let m;
  while ((m = re.exec(code)) !== null) out.push(m[1]);
  const html = out.join('\n');
  const stripped = html.replace(/<!--[\s\S]*?-->/g, '').replace(/\{\{[\s\S]*?\}\}/g, ' ');
  const runs = [];
  const re2 = />([^<>]+)</g;
  while ((m = re2.exec(stripped)) !== null) {
    const text = m[1].trim();
    if (HAN.test(text)) runs.push(text);
  }
  return runs;
}

// ---------- self-test ----------
function selfTest() {
  const cases = [
    {
      name: 'Q1 comment-only CJK -> 0 quoted',
      got: quotedUnits(stripComments('// 中文注释\nconst a = 1;')).length,
      want: 0,
    },
    {
      name: 'Q2 quoted CJK -> 1 quoted',
      got: quotedUnits(stripComments("const t = '加载中';")).length,
      want: 1,
    },
    {
      name: 'Q3 template-literal CJK -> 1 quoted',
      got: quotedUnits(stripComments('const h = `<span>下载</span>`;')).length,
      want: 1,
    },
    {
      name: 'T1 bare text node -> 1 template',
      got: templateUnits('<template><div>下载</div></template>').length,
      want: 1,
    },
    {
      name: 'T2 interpolation only -> 0 template',
      got: templateUnits('<template><div>{{ caption }}</div></template>').length,
      want: 0,
    },
    {
      name: 'T3 comment CJK -> 0 template',
      got: templateUnits('<template><!-- 下载 --><div></div></template>').length,
      want: 0,
    },
    // 反向对照：判据必须能对「确有 CJK」的输入非零（防两把量具一起瞎）
    {
      name: 'Q4 positive control -> 2 quoted',
      got: quotedUnits(stripComments("a('电影'); b('音乐');")).length,
      want: 2,
    },
    {
      name: 'T4 positive control -> 2 template',
      got: templateUnits('<template><p>未上映作品</p><p>更多影视作品</p></template>').length,
      want: 2,
    },
  ];
  for (const c of cases) {
    if (c.got !== c.want) {
      console.error(`SELF-TEST FAILED ${c.name}: got ${c.got} want ${c.want}`);
      process.exit(1);
    }
  }
  console.log(`self-test OK (${cases.length} seeds)`);
}

// ---------- walk + measure ----------
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|vue)$/.test(e.name)) out.push(p);
  }
  return out;
}

function measure() {
  const files = walk(SCOPE).sort();
  const result = {};
  for (const f of files) {
    const rel = path.relative(ROOT, f).replace(/\\/g, '/');
    const code = stripComments(fs.readFileSync(f, 'utf8'));
    const quoted = quotedUnits(code).length;
    const template = f.endsWith('.vue') ? templateUnits(fs.readFileSync(f, 'utf8')).length : 0;
    if (quoted > 0 || template > 0) result[rel] = { quoted, template };
  }
  return result;
}

function totals(map) {
  let quoted = 0;
  let template = 0;
  for (const v of Object.values(map)) {
    quoted += v.quoted;
    template += v.template;
  }
  return { quoted, template };
}

// ---------- main ----------
const args = process.argv.slice(2);
if (args.includes('--self-test')) {
  selfTest();
  process.exit(0);
}
if (!args.includes('--self-test')) selfTest();

const actual = measure();
const actualTotals = totals(actual);

if (args.includes('--baseline')) {
  const payload = { scope: 'src/scenario/douban', totals: actualTotals, files: actual };
  fs.writeFileSync(BASELINE_FILE, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(
    `cjk baseline written: quoted=${actualTotals.quoted} template=${actualTotals.template} in ${Object.keys(actual).length} files`,
  );
  process.exit(0);
}

if (!fs.existsSync(BASELINE_FILE)) {
  console.error(`[cjk] 基线缺失：${BASELINE_FILE}（先跑 --baseline 生成，再提交）`);
  process.exit(1);
}
const baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));

if (args.includes('--detail')) {
  for (const [file, v] of Object.entries(actual)) {
    const b = baseline.files[file] ?? { quoted: 0, template: 0 };
    const mark =
      v.quoted > b.quoted || v.template > b.template
        ? '↑'
        : v.quoted < b.quoted || v.template < b.template
          ? '↓'
          : '=';
    console.log(`${mark} quoted=${v.quoted} template=${v.template}  ${file}`);
  }
}

const problems = [];
for (const [file, v] of Object.entries(actual)) {
  const b = baseline.files[file];
  if (!b) {
    problems.push(`新文件带裸 CJK（${v.quoted} quoted / ${v.template} template）：${file}`);
    continue;
  }
  if (v.quoted > b.quoted) problems.push(`quoted 增长 ${b.quoted}→${v.quoted}：${file}`);
  if (v.template > b.template) problems.push(`template 增长 ${b.template}→${v.template}：${file}`);
}
for (const [file, b] of Object.entries(baseline.files)) {
  const v = actual[file] ?? { quoted: 0, template: 0 };
  if (v.quoted < b.quoted || v.template < b.template) {
    problems.push(
      `计数已下降（quoted ${b.quoted}→${v.quoted} / template ${b.template}→${v.template}），请重锁：${file}`,
    );
  }
}

if (problems.length > 0) {
  console.error('❌ cjk 棘轮：' + problems.length + ' 处需要处理');
  for (const p of problems) console.error('   - ' + p);
  console.error('   新增裸文案：接进内容 i18n 词典（locales/*.ts）后重跑 --baseline；');
  console.error('   已减少债务：同样重跑 --baseline 把基线锁到更小值（棘轮只缩）。');
  process.exit(1);
}

console.log(
  `✅ cjk ratchet: PASS (quoted ${actualTotals.quoted} / template ${actualTotals.template}, baseline holds, ${Object.keys(actual).length} files)`,
);
