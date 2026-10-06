/**
 * WebDAV meta 混装修复脚本（ADR-027 R2 拒绝吞入后的恢复工具）。
 *
 * 症状：下载报「Dataset hash mismatch: remote meta declares X but the ZIP contains Y」
 * —— 云端 meta.json 与部分 blob 处于不同代际（旧版上传无原子交换，中途中断即混装）。
 *
 * 策略（最小权限，只动 meta.json、绝不碰 blob）：
 *   1. 逐表拉 ZIP，校验其**内部自洽**：calculateStoreHash(data) === ZIP 内 meta.json.hash。
 *      自洽 = blob 里的数据是完整可信的一代 → 才把远端 meta 条目的 hash 改写为 ZIP 自述值。
 *      内部也不自洽的表一律不动并如实报告（那才是真损坏）。
 *   2. `__settings__`：404（有 meta 无 blob）→ 条目记 0 占位（与运行时 placeholderMeta
 *      口径一致，下载侧即静默跳过）；可拉到则仅校验可解析。
 *   3. 写回前先把原 meta.json 备份为 meta.json.bak.<ts>；默认 dry-run，`--apply` 才写。
 *
 * 哈希算法复刻自 src/libraries/utils/hash-utils.ts（SSOT；若仓库侧算法变更，
 * 本脚本的「内部自洽」校验会全体失败并拒绝写入 —— fail-safe，不会写坏数据）。
 *
 * 用法（Git Bash）：
 *   WEBDAV_URL='https://dav.jianguoyun.com/dav/BrowserExtension/UM/UMMultimediaManager' \
 *   WEBDAV_USERNAME='...' WEBDAV_PASSWORD='...' \
 *   node scripts/repair-webdav-meta.mjs          # dry-run，只报告
 *   ... node scripts/repair-webdav-meta.mjs --apply   # 备份并写回
 */

import crypto from 'node:crypto';

const BASE = (process.env.WEBDAV_URL ?? '').trim().replace(/\/+$/, '');
const USER = process.env.WEBDAV_USERNAME ?? '';
const PASS = process.env.WEBDAV_PASSWORD ?? '';
const APPLY = process.argv.includes('--apply');

if (!BASE || !USER || !PASS) {
  console.error('缺少 WEBDAV_URL / WEBDAV_USERNAME / WEBDAV_PASSWORD 环境变量');
  process.exit(1);
}

const AUTH = 'Basic ' + Buffer.from(`${USER}:${PASS}`, 'utf8').toString('base64');
const BASE_PATH = 'umm-data';

function authFetch(url, init = {}) {
  return fetch(url, { ...init, headers: { Authorization: AUTH, ...init.headers } });
}

async function getText(url) {
  const res = await authFetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

/** ZIP 是二进制：必须走 arrayBuffer，res.text() 的 UTF-8 解码会破坏字节。 */
async function getBytes(url) {
  const res = await authFetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function putBytes(url, bytes, contentType) {
  const res = await authFetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: bytes,
  });
  if (!res.ok) throw new Error(`PUT ${res.status} for ${url}`);
}

/** SSOT 复刻：src/libraries/utils/hash-utils.ts 的哈希代际表（gen-2 当前 / gen-1 ≤5.18.0）。 */
/** SSOT 复刻：src/libraries/utils/hash-utils.ts 的哈希生成表（代数 = 表序号 + 1，旧在前）。 */
const HASH_FIELD_GENERATIONS = [
  ['status', 'rating', 'linkedIds', 'url'], // gen-1：≤5.18.0 发布版
  ['status', 'rating', 'comment', 'linkedIds', 'url'], // gen-2：ADR-027 起（当前）
];

function storeHashWithFields(entries, fields) {
  if (entries.length === 0) return 'empty';
  const sorted = entries.toSorted((a, b) => a.key.localeCompare(b.key));
  const dataToHash = sorted.map(({ key, record }) => {
    const sig = {};
    for (const field of fields) sig[field] = record[field];
    return { key, ...sig };
  });
  const bytes = new TextEncoder().encode(JSON.stringify(dataToHash));
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

/**
 * 逐代识别（版本兼容层，**按数据集版本轴驱动**，SSOT = hash-utils 的
 * identifyStoreHashGeneration）：dataVersion ≥ 2 只验该版本对应的代（v2 起哈希
 * 语义无歧义）；v1 为历史歧义带（发布版 gen-1 与未 bump 版本的 WIP 构建共用）
 * ⇒ 逐代尝试。命中返回 1-based 代数，全不中返回 null（真损坏）。
 */
function identifyGeneration(entries, zipSelfHash, dataVersion) {
  if (typeof zipSelfHash !== 'string') return null;
  if (entries.length === 0) return zipSelfHash === 'empty' ? 1 : null;
  const candidates = dataVersion >= 2 ? [dataVersion] : HASH_FIELD_GENERATIONS.map((_, i) => i + 1);
  for (const gen of candidates) {
    const fields = HASH_FIELD_GENERATIONS[gen - 1];
    if (!fields) continue;
    if (storeHashWithFields(entries, fields) === zipSelfHash) return gen;
  }
  return null;
}

/** SSOT 复刻：src/provider/webdav/mapping.ts 的 hashKeyToFilename。 */
function hashKeyToFilename(key) {
  return crypto.createHash('sha256').update(key, 'utf8').digest('hex').slice(0, 16);
}

const { unzipSync } = await import('fflate');

async function inspectDataset(key) {
  const zipBytes = await getBytes(`${BASE}/${BASE_PATH}/${hashKeyToFilename(key)}.zip`);
  if (zipBytes === null) return { status: 'missing-blob' };
  try {
    const files = unzipSync(zipBytes);
    const data = JSON.parse(new TextDecoder().decode(files['data.json']));
    const innerMeta = JSON.parse(new TextDecoder().decode(files['meta.json']));
    const entries = Object.entries(data).map(([k, record]) => ({ key: k, record }));
    const gen = identifyGeneration(entries, innerMeta.hash, innerMeta.dataVersion);
    if (gen === null)
      return {
        status: 'zip-internally-inconsistent（哈希代际表全不中，真损坏）',
        declared: innerMeta.hash,
      };
    return {
      status: `self-consistent（哈希 gen-${gen}）`,
      declared: innerMeta.hash,
      generation: gen,
      recordCount: entries.length,
      dataVersion: innerMeta.dataVersion,
    };
  } catch (err) {
    return { status: 'unparsable', error: String(err?.message ?? err) };
  }
}

const metaText = await getText(`${BASE}/${BASE_PATH}/meta.json`);
if (metaText === null) {
  console.error('云端没有 meta.json —— 无需修复');
  process.exit(1);
}
const meta = JSON.parse(metaText);

const report = [];
for (const ds of meta.datasets ?? []) {
  if (ds.key === '__settings__') {
    const raw = await getText(`${BASE}/${BASE_PATH}/${hashKeyToFilename('__settings__')}.zip`);
    if (raw === null) {
      report.push({ key: ds.key, status: 'meta-without-blob → 记 0 占位', fix: true });
      ds.recordCount = 0;
      ds.hash = 'empty';
    } else {
      report.push({ key: ds.key, status: 'blob 存在，保持原状', fix: false });
    }
    continue;
  }
  const info = await inspectDataset(ds.key);
  if (info.status === 'self-consistent') {
    if (ds.hash === info.declared) {
      report.push({
        key: ds.key,
        status: `meta 与 ZIP 一致（${info.recordCount} 条）`,
        fix: false,
      });
    } else {
      ds.hash = info.declared;
      if (typeof info.recordCount === 'number') ds.recordCount = info.recordCount;
      report.push({
        key: ds.key,
        status: `混装 → 采纳 ZIP 自述 hash（${info.recordCount} 条，v${info.dataVersion}）`,
        fix: true,
      });
    }
  } else {
    report.push({
      key: ds.key,
      status: `${info.status}${info.error ? `: ${info.error}` : ''} —— 不动`,
      fix: false,
    });
  }
}

console.log('\n===== 逐表状态 =====');
for (const r of report) console.log(`${r.fix ? '✏️  ' : '   '}${r.key}: ${r.status}`);
const fixCount = report.filter((r) => r.fix).length;
console.log(`\n待修复条目: ${fixCount} / ${report.length}`);

if (!APPLY) {
  console.log('\n[dry-run] 未写回。确认后加 --apply 执行（会先备份 meta.json）。');
  process.exit(0);
}

if (fixCount === 0) {
  console.log('\n无需写回（没有任何待修复条目）。');
  process.exit(0);
}

const backupName = `meta.json.bak.${new Date().toISOString().replace(/[:.]/g, '-')}`;
await putBytes(
  `${BASE}/${BASE_PATH}/${backupName}`,
  Buffer.from(metaText, 'utf8'),
  'application/json',
);
console.log(`已备份原 meta → ${BASE_PATH}/${backupName}`);

await putBytes(
  `${BASE}/${BASE_PATH}/meta.json`,
  Buffer.from(JSON.stringify(meta), 'utf8'),
  'application/json; charset=utf-8',
);
console.log('✅ 已写回修复后的 meta.json。现在回到扩展重试「云端覆盖本地」。');
