#!/usr/bin/env node
/**
 * 架构分层守卫（umpp W1 · ADR-026 D6）
 *
 * 强制 umpp 七层的依赖方向单向向下：
 *
 *   app → feature → store → scenario → provider → engine → libraries
 *   dependency direction   ────→
 *
 * 检查项：
 *   A. 层映射完备性 —— src/ 下每个源文件都必须能映射到某一层
 *   B. 依赖方向    —— 禁止向上依赖（跨层反向）
 *   C. libraries 纯度 —— 纯层不得依赖任何业务层（C 的目标集是 B 的子集，故
 *                       违规时二者常同时命中，属预期而非重复缺陷）
 *   D. domain 纯度  —— src/domain/ 不得依赖业务层与基础设施
 *   E. 内容脚本禁令 —— 不得直连 IndexedDB；不得深路径绕过 database 门面
 *   F. 解析/策略契约 —— `unpackageDataset` 的调用点必须同时调用
 *                       `validateDatasetVersion`（版本兼容策略归调用方，
 *                       见 src/libraries/utils/zip-utils.ts 头注）
 *   W. 警告项       —— 内容脚本直连 chrome.storage、features 兄弟模块走深路径
 *
 * Usage: node scripts/check-architecture.cjs [--json] [--warn-only]
 *   exit 1 on any FAIL（--warn-only 时恒 exit 0，仅打印）
 *   --json 时**仅 stdout 输出单个 JSON 文档**（进度行改走 stderr），可被 JSON.parse 直接消费
 *
 * 设计说明（为什么这些规则是可辩护的）：
 *   - src/types/ 被显式豁免方向检查：它是跨切面类型枢纽（被各层反向引用是设计使然），
 *     且自身以 type-only 方式引用 provider 的 DTO。豁免是记录在案的例外，非疏漏。
 *   - src/domain/ 不设秩：其纯度由规则 D 单独负责，避免与 B 重复报错。
 *   - src/entrypoints/ 归 app 层（WXT 入口 = 应用装配）；其 content 编排子树单独归 scenario。
 *   - libraries 层（src/libraries/）：原 shared/{ui,styles,locales,plugins,identity,toast}
 *     + utils + config.ts，均为业务无关的共享基元（umpp W3 L1 已迁入）。
 *   - libraries 允许依赖 domain / types：这两者是无基础设施依赖的最内层契约，
 *     允许依赖它们是依赖倒置的体现；禁止的是 libraries 依赖 app/feature/store/
 *     scenario/provider/engine（那才构成「公共层被业务腐蚀」）。
 *   - 层间「同层引用」与「向下引用」均合法；只有「向上」才违规。
 *   - *.d.ts 是环境声明文件而非模块，不参与层映射。
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
/**
 * 被检查的源码根目录。默认 `src/`；可用 `ARCH_SRC`（相对 root 或绝对路径）覆盖——
 * 供守卫自身的双向验证（合法通过 / 违规被拒）与规则回归测试使用。
 */
const SRC = process.env.ARCH_SRC
  ? path.resolve(root, process.env.ARCH_SRC)
  : path.join(root, 'src');

const argv = process.argv.slice(2);
const AS_JSON = argv.includes('--json');
const WARN_ONLY = argv.includes('--warn-only');

/** 进度行：JSON 模式下改走 stderr，保证 stdout 是单一可解析的 JSON 文档。 */
const log = (msg) => {
  if (AS_JSON) process.stderr.write(`${msg}\n`);
  else console.log(msg);
};

// ---------- 层模型 ----------

/**
 * 层 → 秩（数字越大越靠下；依赖只允许流向「秩 >= 自身」）。
 * `domain` 刻意不设秩：其纯度由规则 D 负责，避免 B/D 对同一违规重复报错。
 */
const LAYER_RANK = {
  app: 0,
  feature: 1,
  store: 2,
  scenario: 3,
  provider: 4,
  engine: 5,
  libraries: 6,
  types: 6,
};

/**
 * 方向检查豁免的路径前缀（记录在案的例外）。
 * types/ 是跨切面类型枢纽：既允许被任意层引用，也允许其引用任意层。
 */
const DIRECTION_EXEMPT_PREFIXES = ['types/'];

/** domain 层不得依赖的层（domain 是纯业务模型/契约，不触基础设施与上层）。 */
const FORBIDDEN_FOR_DOMAIN = new Set(['app', 'feature', 'store', 'scenario', 'provider', 'engine']);

/**
 * 路径前缀 → 层。**顺序敏感**：越具体的规则必须越靠前。
 * 前缀均相对 src/（目录规则不带尾斜杠亦可，匹配「该路径本身或其子树」）。
 */
const LAYER_RULES = [
  // —— WXT 入口（app 装配层）；其 content 编排子树单独归 scenario ——
  ['entrypoints/content', 'scenario'],
  ['entrypoints', 'app'],

  // —— 内容注入域：站点 overlay 编排 ——
  ['scenario', 'scenario'],

  // —— UI 状态 ——
  ['store', 'store'],

  // —— 共享基元（libraries）：已从 shared/ 迁至 libraries/（umpp W3 L1）——
  ['libraries/utils', 'libraries'],
  ['libraries/ui', 'libraries'],
  ['libraries/styles', 'libraries'],
  ['libraries/locales', 'libraries'],
  ['libraries/plugins', 'libraries'],
  ['libraries/identity.ts', 'libraries'],
  ['libraries/toast.ts', 'libraries'],
  ['libraries', 'libraries'],

  // —— 通用能力（utils/config 已迁至 libraries/）——
  ['domain', 'domain'],
  ['types', 'types'],

  // —— 层兜底规则（engine/provider/feature；具体子路径规则优先；umpp W3 L2–L5）——
  ['engine', 'engine'],
  ['provider', 'provider'],
  ['feature/optimistic-lock', 'types'],
  ['feature', 'feature'],
];

/** 内容脚本路径判定（用于 E/W 类规则）。 */
function isContentScript(rel) {
  if (rel.startsWith('scenario/')) return true;
  if (rel.startsWith('entrypoints/content/')) return true;
  if (rel.startsWith('entrypoints/') && rel.includes('.content/')) return true;
  return false;
}

/**
 * 路径（src 相对）→ 层。匹配「该前缀本身」或「其子树」。
 *
 * 关键：import 说明符通常**不带扩展名**（`@/shared/identity`），而规则里的文件条目
 * 带扩展名（`shared/identity.ts`）。故两侧统一剥掉 .ts/.tsx/.vue 后再比较，
 * 否则无扩展名说明符会错落到目录兜底规则（曾因此把 libraries 误判为 feature）。
 */
function layerOf(rel) {
  const strip = (p) => p.replace(/\.(ts|tsx|vue)$/, '');
  const clean = strip(rel);
  for (const [prefix, layer] of LAYER_RULES) {
    const p = strip(prefix);
    if (clean === p || clean.startsWith(`${p}/`)) return layer;
  }
  return null;
}

// ---------- 源文件收集 ----------

const failures = [];
const warnings = [];
const fail = (msg) => failures.push(msg);
const warn = (msg) => warnings.push(msg);

/** 扩展名与 tsconfig 的 include 保持一致（含 tsx，避免未来的静默免检盲区）。 */
const SOURCE_RE = /\.(ts|tsx|vue)$/;

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(abs));
    else if (SOURCE_RE.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(abs);
  }
  return out;
}

const files = walk(SRC);
const relOf = (abs) => path.relative(SRC, abs).replace(/\\/g, '/');

/** 一次读取并缓存源码，避免同一文件被多个规则重复读盘。 */
const codeCache = new Map();
function codeOf(abs) {
  let c = codeCache.get(abs);
  if (c === undefined) {
    c = fs.readFileSync(abs, 'utf8');
    codeCache.set(abs, c);
  }
  return c;
}

// ---------- 静态 import 提取 ----------

/**
 * 提取模块说明符。覆盖真实代码中出现的全部静态/动态导入形态：
 *   - `from 'x'` / `from "x"`（含 `import type`、`export … from`）
 *   - 副作用导入 `import 'x'`
 *   - 动态 `import('x')` / `import("x")`
 *   - 模板字面量动态导入 `` import(`x`) ``（无反引号内插值）
 *   - `import x = require('x')` 与裸 `require('x')`
 *
 * 已知局限（Assumption）：含插值的模板字面量（`` import(`@/${n}`) ``）无法静态解析，
 * 此类写法在本仓库当前不存在；若未来引入，需改走 AST 解析。
 */
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

/** 说明符 → src 相对路径（无法解析到 src 内则返回 null）。 */
function resolveSpecifier(spec, fromRel) {
  let s = spec;
  const q = s.search(/[?#]/);
  if (q >= 0) s = s.slice(0, q);
  if (s.startsWith('@/')) return s.slice(2);
  if (s.startsWith('.')) {
    const base = path.posix.dirname(fromRel);
    return path.posix.normalize(path.posix.join(base, s));
  }
  return null; // 裸包名 / 绝对 URL
}

/** src 相对路径是否落在给定前缀（本身或子树）内。 */
const under = (rel, prefix) => rel === prefix || rel.startsWith(`${prefix}/`);

// ---------- A. 层映射完备性 ----------

const unmapped = [];
for (const abs of files) {
  const rel = relOf(abs);
  if (!layerOf(rel)) unmapped.push(rel);
}
if (unmapped.length) {
  fail(`A. 层映射缺口的文件 ${unmapped.length} 个（需在 LAYER_RULES 登记）：`);
  for (const r of unmapped.slice(0, 20)) failures.push(`     ${r}`);
} else {
  log(`  ok  A. 层映射完备（${files.length} 个源文件全部可映射）`);
}

// ---------- B/C/D. 依赖方向 ----------

let edgeCount = 0;
for (const abs of files) {
  const rel = relOf(abs);
  const selfLayer = layerOf(rel);
  if (!selfLayer) continue;

  for (const spec of extractImports(codeOf(abs))) {
    const target = resolveSpecifier(spec, rel);
    if (!target) continue;
    const targetLayer = layerOf(target);
    if (!targetLayer) continue;
    edgeCount++;

    const selfExempt = DIRECTION_EXEMPT_PREFIXES.some((p) => rel.startsWith(p));
    const targetExempt = DIRECTION_EXEMPT_PREFIXES.some((p) => target.startsWith(p));
    const selfRank = LAYER_RANK[selfLayer];
    const targetRank = LAYER_RANK[targetLayer];

    // B. 方向检查（types/ 与本文件自身豁免；domain 无秩故天然跳过，
    //    其纯度由规则 D 单独负责）
    if (
      !selfExempt &&
      !targetExempt &&
      selfRank !== undefined &&
      targetRank !== undefined &&
      targetRank < selfRank
    ) {
      fail(`B. 向上依赖：${selfLayer}(秩 ${selfRank}) → ${targetLayer}(秩 ${targetRank})`);
      failures.push(`     ${rel}  →  ${spec}`);
    }

    // C. libraries 纯度（允许的最内层契约：libraries / types / domain）
    if (
      selfLayer === 'libraries' &&
      targetLayer !== 'libraries' &&
      targetLayer !== 'types' &&
      targetLayer !== 'domain'
    ) {
      fail(`C. libraries 纯度：${rel} 依赖了 ${targetLayer} 层`);
      failures.push(`     →  ${spec}`);
    }

    // D. domain 纯度
    if (selfLayer === 'domain' && FORBIDDEN_FOR_DOMAIN.has(targetLayer)) {
      fail(`D. domain 纯度：${rel} 依赖了 ${targetLayer} 层`);
      failures.push(`     →  ${spec}`);
    }
  }
}
log(`  ok  B/C/D. 已检查 ${edgeCount} 条层间依赖边`);

// ---------- E/W. 内容脚本专项 ----------

/** 内容脚本禁止深路径访问的 database 内部模块（必须经 index 的 Store 门面）。 */
const DB_INTERNAL_PATHS = [
  'engine/database/models',
  'engine/database/api',
  'engine/database/migrate',
  'engine/database/query-utils',
];

let contentScriptCount = 0;
for (const abs of files) {
  const rel = relOf(abs);
  if (!isContentScript(rel)) continue;
  contentScriptCount++;
  const code = codeOf(abs);

  // E1. 不得直连 IndexedDB（AGENTS.md：内容脚本一律走 chrome.runtime.sendMessage）
  if (/\bindexedDB\b/.test(code)) {
    fail(`E. 内容脚本直连 IndexedDB：${rel}`);
  }

  // E2. 不得深路径绕过 database 门面（经统一说明符提取，覆盖副作用导入与
  //     `models/index` 之类的多级路径）
  for (const spec of extractImports(code)) {
    const target = resolveSpecifier(spec, rel);
    if (!target) continue;
    if (DB_INTERNAL_PATHS.some((p) => under(target, p))) {
      fail(`E. 内容脚本绕过 database 门面（应经 @/engine/database 的 Store）：${rel} → ${spec}`);
    }
  }

  // W. chrome.storage 直连（现状存在，登记为警告以驱动后续收敛）
  if (/chrome\.storage\.(local|sync|session|managed)/.test(code)) {
    warn(`W. 内容脚本直连 chrome.storage：${rel}`);
  }
}
log(`  ok  E. 已检查 ${contentScriptCount} 个内容脚本文件`);

// ---------- F. 解析/策略分离契约 ----------

/**
 * `src/libraries/utils/zip-utils.ts` 只负责解析，不再内置版本门禁（ADR-026 W1 分层修复）。
 * 因此每个调用点都必须自行调用 `validateDatasetVersion` —— 否则导入链路会
 * 静默失去版本护栏。此处以文件级共存断言兜住「调用被删除」的退化。
 */
/**
 * `src/libraries/utils/zip-utils.ts` 只负责解析，不再内置版本门禁（ADR-026 W1 分层修复）。
 * 因此**每个调用点**都必须自行调用 `validateDatasetVersion` —— 否则该处导入
 * 链路会静默失去版本护栏。
 *
 * 断言粒度必须落在**调用点**而非文件：文件级共存检查会漏掉「同一文件有 N 处
 * 调用、只删其中一处的校验」这种退化（2026-09-25 重审实测 MUT-ONE 漏检）。
 * 故逐行定位调用点，并要求其后 WINDOW 行窗口内出现校验调用。
 */
const UNPACK_CHECK_WINDOW = 5;
let unpackCallSites = 0;
for (const abs of files) {
  const rel = relOf(abs);
  const code = codeOf(abs);
  if (!/\bunpackageDataset\s*\(/.test(code)) continue;
  // 定义模块本身不是调用点
  if (/export\s+async\s+function\s+unpackageDataset\b/.test(code)) continue;

  const lines = code.split('\n');
  lines.forEach((line, i) => {
    if (!/^\s*(?:\/\/|\*)/.test(line) && /\bunpackageDataset\s*\(/.test(line)) {
      unpackCallSites++;
      const window = lines.slice(i, i + UNPACK_CHECK_WINDOW + 1).join('\n');
      if (!/\bvalidateDatasetVersion\s*\(/.test(window)) {
        fail(
          `F. unpackageDataset 调用点(第 ${i + 1} 行)缺少版本校验：${rel}` +
            `（版本策略归调用方，须在该处调用 validateDatasetVersion）`,
        );
      }
    }
  });
}
log(`  ok  F. 已检查 ${unpackCallSites} 个 unpackageDataset 调用点`);

// ---------- 兄弟模块深路径（警告） ----------

let barrelBypass = 0;
for (const abs of files) {
  const rel = relOf(abs);
  if (!rel.startsWith('features/')) continue;
  // 本文件所属的 features 子包；同包内用绝对别名引用自己的模块不算「旁路」
  const ownPkg = /^features\/([a-z0-9-]+)\//.exec(rel)?.[1];
  for (const spec of extractImports(codeOf(abs))) {
    const target = resolveSpecifier(spec, rel);
    if (!target) continue;
    const m = /^features\/([a-z0-9-]+)\/(.+)$/.exec(target);
    if (!m) continue;
    if (m[1] === ownPkg) continue;
    if (m[2] === 'index' || m[2].startsWith('index/')) continue;
    barrelBypass++;
    if (barrelBypass <= 12) {
      warn(`W. features 深路径导入：${rel} → @/features/${m[1]}/…`);
    }
  }
}
if (barrelBypass > 12) warn(`W. features 深路径导入共 ${barrelBypass} 处（仅显示前 12）`);

// ---------- 输出 ----------

if (AS_JSON) {
  process.stdout.write(
    `${JSON.stringify({ failures, warnings, files: files.length, edges: edgeCount }, null, 2)}\n`,
  );
  process.exit(failures.length && !WARN_ONLY ? 1 : 0);
}

console.log('');
if (warnings.length) {
  console.log(`⚠️  警告 ${warnings.length} 条（不阻断）`);
  for (const w of warnings) console.log(`   ${w}`);
  console.log('');
}
if (failures.length) {
  console.log(`❌ 违规 ${failures.length} 条`);
  for (const f of failures) console.log(`   ${f}`);
  console.log('');
  console.log('架构分层守卫：FAIL');
  process.exit(WARN_ONLY ? 0 : 1);
}
console.log('✅ 架构分层守卫：PASS');
