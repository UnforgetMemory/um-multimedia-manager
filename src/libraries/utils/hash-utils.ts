/**
 * Hash utilities for WebDAV sync
 *
 * ==================== UTF-8 encoding policy ====================
 * TextEncoder.encode() always produces UTF-8 bytes from JS strings
 * (which are UTF-16 internally). This ensures the hash input is
 * consistently UTF-8 regardless of platform or JS engine.
 * ==============================================================
 *
 * Computes SHA-256 hash of sorted store records to detect changes.
 */

import type { StoreRecord } from '../../types';

/**
 * 参与变更指纹的记录字段（**唯一事实源**，ADR-027）。
 *
 * - 顺序即序列化顺序：改动字段集或顺序都会改变摘要，必须同步更新
 *   `tests/unit/hash-utils.spec.ts` 的独立 oracle。
 * - `updatedAt` **刻意排除**：每次写入都会变，纳入会造成大面积假失配。
 * - `comment` 由 ADR-027 纳入：此前只改注释不会改变摘要，同步据此判「无变化」
 *   而静默漏同步（用户可见的「注释不同步」）。注意无 `comment` 的记录在
 *   `JSON.stringify` 下会丢弃该键，序列化结果与纳入前**逐字节一致**，
 *   因此既有远端 meta 不会因本次变更被误判为「已变化」。
 */
export const HASH_FIELDS = ['status', 'rating', 'comment', 'linkedIds', 'url'] as const;

/**
 * 哈希算法**生成表**（版本兼容层，**代数 = 表序号 + 1**，旧在前）：
 * gen-1 = ≤5.18.0 发布版（签名字段无 `comment`，对应 dataVersion 1）；
 * gen-2 = ADR-027 纳入 `comment`（dataVersion 2 起）。读侧（WebDAV 下载/同步的
 * ZIP 内部自洽校验）**按 ZIP 自带的 `dataVersion` 选择解读规则**：v1 存在历史歧义带
 * （发布版 gen-1 与未 bump 版本的 ADR-027 WIP 构建共用 v1）⇒ 逐代尝试；v2+ ⇒ 精确单代。
 */
export const HASH_FIELDS_GENERATIONS: ReadonlyArray<readonly (keyof StoreRecord)[]> = [
  ['status', 'rating', 'linkedIds', 'url'], // gen-1：≤5.18.0 发布版的签名字段集
  HASH_FIELDS, // gen-2：ADR-027 起的签名字段集（当前）
];

/** 当前写入代（= HASH_FIELDS_GENERATIONS.length，packageDataset 所用）。 */
export const CURRENT_HASH_GENERATION = HASH_FIELDS_GENERATIONS.length;

/** gen-2（当前签名字段集）生效的数据集格式版本 —— v2 起哈希语义无歧义。 */
export const UNAMBIGUOUS_HASH_GENERATION_SINCE = 2;

function signatureWith(
  fields: readonly (keyof StoreRecord)[],
  record: StoreRecord,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fields) out[field] = record[field];
  return out;
}

async function sha256OfEntries(
  entries: Array<{ key: string; record: StoreRecord }>,
  fields: readonly (keyof StoreRecord)[],
): Promise<string> {
  if (entries.length === 0) return 'empty';

  const sorted = entries.toSorted((a, b) => a.key.localeCompare(b.key));

  const dataToHash = sorted.map(({ key, record }) => ({ key, ...signatureWith(fields, record) }));

  // JSON → UTF-8 bytes via TextEncoder (explicit, platform-independent)
  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify(dataToHash));
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 记录的内容签名（不含键），字段集与顺序取自 {@link HASH_FIELDS}。
 * 供数据集摘要与「同键内容是否相同」的冲突判定共用，避免两处字段集漂移。
 */
function signatureOf(record: StoreRecord): Record<string, unknown> {
  return signatureWith(HASH_FIELDS, record);
}

/**
 * 单条记录的内容签名（不含键）——`mergeDatasetEntries` 判定「同键同时间但内容不同」
 * 的冲突依据（ADR-027）。
 */
export function recordSignature(record: StoreRecord): string {
  return JSON.stringify(signatureOf(record));
}

/**
 * Compute SHA-256 hash of an array of store entries.
 * Sorted by key for deterministic output; excludes updatedAt
 * which changes on every write and would cause false mismatches.
 *
 * Encoding chain: record data → JSON.stringify → TextEncoder(UTF-8) → SHA-256
 */
export async function calculateStoreHash(
  entries: Array<{ key: string; record: StoreRecord }>,
): Promise<string> {
  return sha256OfEntries(entries, HASH_FIELDS_GENERATIONS[CURRENT_HASH_GENERATION - 1]!);
}

/** gen-1 算法（≤5.18.0 发布版）：供读侧识别旧代备份的「内部自洽」。 */
export async function calculateLegacyStoreHash(
  entries: Array<{ key: string; record: StoreRecord }>,
): Promise<string> {
  return sha256OfEntries(entries, HASH_FIELDS_GENERATIONS[0]!);
}

/**
 * 识别 entries 的哈希出自哪一代算法（版本兼容层核心，**按数据集版本轴驱动**）：
 * - `dataVersion >= UNAMBIGUOUS_HASH_GENERATION_SINCE` ⇒ 只验该版本对应的代
 *   （v2 起哈希语义已并入格式版本，dataVersion N ⇔ 代 N，无歧义）；
 * - `dataVersion = 1` ⇒ 历史歧义带（发布版 gen-1 与未 bump 版本的 WIP 构建共用 v1）
 *   ⇒ 逐代尝试。
 * 命中返回代数（1-based），全不中返回 null（= 数据与其自带 manifest 不符，真损坏）。
 */
export async function identifyStoreHashGeneration(
  entries: Array<{ key: string; record: StoreRecord }>,
  zipSelfHash: unknown,
  dataVersion: number,
): Promise<number | null> {
  if (typeof zipSelfHash !== 'string') return null;
  if (entries.length === 0) return zipSelfHash === 'empty' ? 1 : null;
  const candidates =
    dataVersion >= UNAMBIGUOUS_HASH_GENERATION_SINCE
      ? [dataVersion]
      : HASH_FIELDS_GENERATIONS.map((_, i) => i + 1);
  for (const gen of candidates) {
    const fields = HASH_FIELDS_GENERATIONS[gen - 1];
    if (!fields) continue;
    if ((await sha256OfEntries(entries, fields)) === zipSelfHash) return gen;
  }
  return null;
}
