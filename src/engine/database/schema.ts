/**
 * IndexedDB schema constants + pure key helpers (split from ./models, 2026-09-26).
 *
 * Pure data and pure functions only — no IDB access, no framework deps. The
 * `MediaDatabase` class and the `mediaDB` singleton live in ./models, which
 * re-exports everything here so existing '@engine/database/models' consumers
 * are unaffected.
 */

export const DB_NAME = 'umm-media-db';
export const DB_VERSION = 15;

/**
 * 成人三表（jav_ids / usav_ids / sehuatang_ids）的键后缀索引名（v15）。
 * 索引字段值 = store 键去掉 `${source}::` 前缀后的番号部分，
 * 由写侧（MediaDatabase.put/batchPut）与 v15 迁移回填写入，
 * 供 ADULT_AV_CHECK L2 精确查询，消除全表游标扫描。
 */
export const ADULT_AV_ID_INDEX = 'avId';

/**
 * 从成人三表 store 键推导 avId 索引字段值（键后缀）。
 * 与 ADULT_AV_CHECK 旧 L2 的后缀语义逐字符一致：
 * 有 '::' 时取第一个 '::' 之后的全部剩余（后缀自身可再含 '::'），
 * 无 '::' 时即整个键。
 */
export function adultAvIdFromKey(key: string): string {
  return key.includes('::') ? key.slice(key.indexOf('::') + 2) : key;
}

export const STORE_NAMES = {
  DOUBAN: 'douban_records',
  IMDB: 'imdb_records',
  NEODB: 'neodb_records',
  TMDB: 'tmdb_records',
  BILIBILI: 'bilibili_records',
  YOUTUBE: 'youtube_records',
  BANGUMI: 'bangumi_records',
  TTL_CACHE: 'ttl_cache',
  PT_ID_CACHE: 'pt_id_cache',
  JAV_IDS: 'jav_ids',
  USAV_IDS: 'usav_ids',
  SEHUATANG_IDS: 'sehuatang_ids',
} as const;

/** All per-platform record store names */
export const RECORD_STORES: readonly string[] = [
  STORE_NAMES.DOUBAN,
  STORE_NAMES.IMDB,
  STORE_NAMES.NEODB,
  STORE_NAMES.TMDB,
  STORE_NAMES.BILIBILI,
  STORE_NAMES.YOUTUBE,
  STORE_NAMES.BANGUMI,
];

/** Adult watched-record stores (ADR-025 三表拆分：日系 / 美欧 / 帖子浏览) */
export const ADULT_STORES: readonly string[] = [
  STORE_NAMES.JAV_IDS,
  STORE_NAMES.USAV_IDS,
  STORE_NAMES.SEHUATANG_IDS,
];

/** All per-platform record stores PLUS adult stores (backup/export) */
export const BACKUP_STORES: readonly string[] = [...RECORD_STORES, ...ADULT_STORES];

/**
 * Public semantic contract for the watched-status gate (status === 2 or legacy 'done').
 *
 * Referenced by tests/unit/watched-status.spec.ts; not called by getWatchedIds (which
 * queries the `status` index directly) — keep in sync with that index query.
 *
 * Returns true ONLY for status=2 (done/watched). Doing (3) and wishlist (1)
 * are excluded: in-progress records must not trigger PT dimming or watched
 * badges. Accepts legacy string statuses from earlier code ("done"→2,
 * "wish"→1) and treats any other value (missing, null, unknown string) as
 * status 0 (none).
 */
export function isWatchedStatus(rawStatus: unknown): boolean {
  const status =
    typeof rawStatus === 'number'
      ? rawStatus
      : rawStatus === 'done'
        ? 2
        : rawStatus === 'wish'
          ? 1
          : 0;
  return status === 2;
}

/**
 * Normalize a legacy video record key to the canonical movie format (decision-3).
 *
 * Bilibili/youtube content scripts historically keyed records as 'video::X' or
 * bare 'X'; the canonical key format is 'type::providerId' where video content
 * belongs under 'movie::X' (v13 migration rewrites stored keys accordingly).
 *
 * Rules:
 * - 'video::X'  → 'movie::X'  (legacy video prefix)
 * - bare 'X'    → 'movie::X'  (legacy un-prefixed key)
 * - 'movie::X'  → unchanged
 * - any other prefixed key ('tv::X', 'music::X', …) → unchanged (callers may report)
 */
export function normalizeVideoKey(oldKey: string): string {
  if (oldKey.startsWith('video::')) return `movie::${oldKey.slice('video::'.length)}`;
  if (!oldKey.includes('::')) return `movie::${oldKey}`;
  return oldKey;
}

/**
 * Normalize a record key for a specific store (video platforms only).
 * Single source of truth for WebDAV download/sync and import paths.
 */
export function normalizeStoreRecordKey(storeName: string, recordKey: string): string {
  if (storeName !== STORE_NAMES.BILIBILI && storeName !== STORE_NAMES.YOUTUBE) return recordKey;
  return normalizeVideoKey(recordKey);
}
