/**
 * ZIP utilities for WebDAV sync
 *
 * ==================== UTF-8 encoding policy ====================
 * All text content (ZIP entry names, JSON data, metadata) is
 * explicitly handled as UTF-8 through fflate and TextEncoder/Decoder.
 * fflate uses UTF-8 for entry filenames and content by default.
 * ==============================================================
 *
 * Each dataset zip contains:
 *   - data.json    → { "movie::id": StoreRecord, ... }
 *   - meta.json    → { key, hash, updatedAt, recordCount, dataVersion }
 *
 * Migrated from JSZip to fflate (ADR-016 follow-up / U8):
 * - fflate is zero-dependency, ~8KB vs jszip's ~100KB + pako polyfills
 * - SYNC APIs only (zipSync/unzipSync): the async variants spawn Web Workers
 *   above a size threshold, which the MV3 service worker cannot construct
 * - API: zip/unzip return Uint8Array; Blob conversion via Blob constructor
 *
 * 分层契约（架构守卫规则 C）：本模块是 libraries 层，只做「打包 / 解析」，
 * **不承担版本兼容策略**。版本常量取自 `@/libraries/utils/dataset-version`（同层纯数据）；
 * 「导入的 dataset 版本是否可接受」由调用方（WebDAV 导入链路）用
 * `validateDatasetVersion` 判定——解析与策略分离，避免 libraries 耦合
 * 域错误语义（MigrationError）。
 */

import { zipSync, unzipSync } from 'fflate';
import type { StoreRecord, DatasetMeta } from '../../types';
import { calculateStoreHash } from './hash-utils';
import { CURRENT_DATASET_VERSION } from './dataset-version';

export interface PackedDataset {
  blob: Blob;
  meta: DatasetMeta;
}

/** Reject dataset blobs larger than 50 MiB before parsing (compression-bomb defence). */
const MAX_DATASET_BYTES = 50 * 1024 * 1024;
/** Reject datasets with more than 100k records (memory-exhaustion defence). */
const MAX_DATASET_RECORDS = 100_000;

/**
 * Package store entries into a standard ZIP blob.
 * Entry names and JSON content are UTF-8 throughout.
 *
 * 写侧同样守 `MAX_DATASET_RECORDS`（ADR-027 R5）：读侧 `unpackageDataset` 会拒绝
 * 超限 ZIP，若写侧不受限，「本地记录 + 远端并集」超限时就会写出**自己读不回的备份**
 * —— 消费者拿到的是一份永远无法恢复的数据集。抛错由调用方按表处理（同步=跳过该表、
 * 上传=整体失败并回报），而不是制造不可达数据。
 */
export async function packageDataset(
  key: string,
  entries: Array<{ key: string; record: StoreRecord }>,
): Promise<PackedDataset> {
  if (entries.length > MAX_DATASET_RECORDS) {
    throw new Error(
      `Refusing to package dataset '${key}': ${entries.length} records exceeds the ` +
        `${MAX_DATASET_RECORDS} limit — the resulting ZIP would be rejected on read`,
    );
  }

  const dataObj: Record<string, StoreRecord> = {};
  let latestTs = '';
  for (const { key: k, record } of entries) {
    dataObj[k] = record;
    if (record.updatedAt > latestTs) latestTs = record.updatedAt;
  }

  const hash = await calculateStoreHash(entries);

  const meta: DatasetMeta = {
    key,
    hash,
    updatedAt: latestTs || new Date().toISOString(),
    recordCount: entries.length,
    // dataVersion 是数据集格式的单一版本轴：哈希签名字段集由读侧按它选择
    // （见 hash-utils 的 identifyStoreHashGeneration），不再另设平行标注。
    dataVersion: CURRENT_DATASET_VERSION,
  };

  // JSON.stringify → UTF-8 bytes → stored in ZIP entry as-is
  const dataJson = JSON.stringify(dataObj, null, 2);
  const metaJson = JSON.stringify(meta, null, 2);

  // fflate expects Uint8Array values; encode strings as UTF-8
  const encoder = new TextEncoder();
  const files: Record<string, Uint8Array> = {
    'data.json': encoder.encode(dataJson),
    'meta.json': encoder.encode(metaJson),
  };

  // fflate's async zip/unzip spawn Web Workers above a size threshold — the MV3
  // service worker crashes that path with "Worker is not defined" (real-device
  // evidence: douban 15018 / jav 9668 records; Node tests and small e2e fixtures
  // never cross the threshold because Worker is absent there). The sync APIs
  // never touch workers; the 50 MiB / 100k-record caps below bound the worst
  // case, so blocking the SW briefly on the bulk lane is acceptable.
  const zipped: Uint8Array = zipSync(files, { level: 6 });

  const blob = new Blob([zipped.slice()], { type: 'application/zip' });
  return { blob, meta };
}

/**
 * Unpackage a ZIP blob into its data records and metadata.
 * Entry names and content decoded as UTF-8.
 *
 * Hard size caps guard against malicious/oversized datasets (compression-bomb
 * and memory-exhaustion defence): reject the blob before parsing when larger
 * than MAX_DATASET_BYTES, and reject absurd record counts after JSON.parse.
 *
 * ⚠️ 本函数**不校验 `meta.dataVersion` 兼容性**（策略归调用方）——调用方须在
 * 拿到 meta 后自行判定，例如 WebDAV 导入链路调用
 * `validateDatasetVersion(meta.dataVersion)`，不相容时抛 MigrationError。
 */
export async function unpackageDataset(
  blob: Blob,
): Promise<{ data: Record<string, StoreRecord>; meta: DatasetMeta }> {
  if (blob.size > MAX_DATASET_BYTES) {
    throw new Error(
      `Invalid dataset ZIP: size ${blob.size} exceeds ${MAX_DATASET_BYTES} bytes limit`,
    );
  }

  // Blob → Uint8Array for fflate unzip
  const arrayBuffer = await blob.arrayBuffer();
  const zipped = new Uint8Array(arrayBuffer);

  // Sync unzip: see the worker note in packageDataset — async fflate spawns
  // Workers the MV3 service worker cannot construct.
  const unzipped: Record<string, Uint8Array> = unzipSync(zipped);

  const dataFile = unzipped['data.json'];
  const metaFile = unzipped['meta.json'];

  if (!dataFile || !metaFile) {
    throw new Error('Invalid dataset ZIP: missing data.json or meta.json');
  }

  // Decode Uint8Array as UTF-8 string then parse JSON
  const decoder = new TextDecoder();
  const dataStr = decoder.decode(dataFile);
  const metaStr = decoder.decode(metaFile);

  const data: Record<string, StoreRecord> = JSON.parse(dataStr);
  const meta: DatasetMeta = JSON.parse(metaStr);

  const recordCount = Object.keys(data).length;
  if (recordCount > MAX_DATASET_RECORDS) {
    throw new Error(
      `Invalid dataset ZIP: ${recordCount} records exceeds ${MAX_DATASET_RECORDS} limit`,
    );
  }

  return { data, meta };
}
