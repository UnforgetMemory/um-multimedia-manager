/**
 * Sehuatang detail cache — pure seam: domain types, storage constants, and
 * TTL/LRU policy predicates. Zero I/O (the IndexedDB transport lives in
 * `./transport.ts`).
 */

export interface SehuatangDetailCacheEntry {
  tid: string;
  imageUrl: string | null;
  magnetLink: string | null;
  cachedAt: number;
}

export const SEHUATANG_CACHE_DB_NAME = 'umm-sehuatang-cache';
/**
 * v2：`details` store 新增 `cachedAt` 升序索引，供 putBatch LRU 淘汰走
 * 只读键游标（openKeyCursor），替代 v1 每次写入全表 getAll() 物化全部
 * 条目（含大 payload）的做法。旧 v1 库升级时在同一 upgrade 事务建索引。
 */
export const SEHUATANG_CACHE_DB_VERSION = 2;
export const DETAIL_STORE_NAME = 'details';
/** LRU 淘汰扫描所用索引名（值字段 = cachedAt，主键 = tid）。 */
export const CACHED_AT_INDEX = 'cachedAt';

/** Cache TTL: 7 days (exported for tests). */
export const TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** LRU cap: entries beyond this limit are evicted oldest-first by cachedAt. */
export const MAX_ENTRIES = 500;

/** Entry is fresh while its age is strictly below the TTL (>= TTL = miss). */
export function isEntryFresh(entry: SehuatangDetailCacheEntry, now: number): boolean {
  return now - entry.cachedAt < TTL_MS;
}

/** Number of entries to evict to bring `count` back under MAX_ENTRIES (0 = none). */
export function planEvictionExcess(count: number): number {
  return count > MAX_ENTRIES ? count - MAX_ENTRIES : 0;
}
