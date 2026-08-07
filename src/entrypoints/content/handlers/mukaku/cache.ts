// ─── TTL Cache 层 ──────────────────────────────────
/**
 * TTL cache: serialize arbitrary data into ttl_cache store.
 * Provides typed wrappers to eliminate (Store as any) casts at call sites.
 * The underlying IndexedDB accepts any value; the cast is contained here.
 */

import { Store } from '@/features/database'
import { MUKAKU_CONFIG } from './config'

const TTL = 'ttl_cache'

/** Typed wrapper for ttl_cache get. */
async function ttlCacheGet<T>(key: string): Promise<T | null> {
  const raw: unknown = await Store.dbGet(TTL, key)
  return raw as T | null
}

/** Typed wrapper for ttl_cache put. Cast is contained here. */
async function ttlCachePut<T>(key: string, value: T): Promise<void> {
  await (Store.dbPut as (storeName: string, key: string, value: unknown) => Promise<void>)(TTL, key, value)
}

/** Probe cache entry structure. */
export interface ProbeCacheEntry {
  doubanId: string | null
  imdbId: string | null
  ts: number
}

/** Save probe result to IndexedDB persistent cache. */
export async function probeCacheSet(mvId: string, entry: ProbeCacheEntry): Promise<void> {
  await ttlCachePut(`${MUKAKU_CONFIG.PROBE_CACHE_KEY}:${mvId}`, entry)
}

/**
 * Get probe result from IndexedDB persistent cache (returns null if expired or missing).
 * A fresh entry with BOTH ids null is also a miss — null-null entries from the
 * past 7d window are never trusted (cards get re-probed; "confirmed no
 * association" now lives only in the handler's session cooldown set).
 */
export async function probeCacheGet(mvId: string): Promise<ProbeCacheEntry | null> {
  const raw = await ttlCacheGet<ProbeCacheEntry>(`${MUKAKU_CONFIG.PROBE_CACHE_KEY}:${mvId}`)
  if (!raw || typeof raw !== 'object' || typeof raw.ts !== 'number') return null
  if (Date.now() - raw.ts > MUKAKU_CONFIG.PROBE_CACHE_TTL_MS) return null
  if (raw.doubanId === null && raw.imdbId === null) return null
  return raw as ProbeCacheEntry
}

// ─── Batch APIs (S2/S3: collapse the per-card message storm) ────────────

/**
 * Minimal Store API shape used by the batch cache functions.
 * Injectable for tests (same pattern as record-cache-core's StoreApi).
 * ttl_cache values are arbitrary JSON, so `record` is typed unknown here.
 */
export interface MukakuStoreApi {
  dbGetBulk: (storeName: string, keys: string[]) => Promise<Array<{ key: string; record: unknown }>>
  dbGetWatchedIds: (storeNames: string[]) => Promise<Record<string, string[]>>
  dbPut: (storeName: string, key: string, value: unknown) => Promise<void>
  dbDelete: (storeName: string, key: string) => Promise<void>
}

const DEFAULT_STORE: MukakuStoreApi = {
  dbGetBulk: (storeName, keys) => Store.dbGetBulk(storeName, keys),
  dbGetWatchedIds: (storeNames) => Store.dbGetWatchedIds(storeNames),
  dbPut: (storeName, key, value) =>
    (Store.dbPut as (s: string, k: string, v: unknown) => Promise<void>)(storeName, key, value),
  dbDelete: (storeName, key) => Store.dbDelete(storeName, key),
}

/** In-memory cache slot for watched ID sets (ts = fill time, 30s TTL). */
export interface WatchedIdCache {
  ts: number
  movieDoubanIds: Set<string>
  imdbIds: Set<string>
}

/** Pure: build the ttl_cache key for a probe result. */
export function probeCacheKey(mvId: string): string {
  return `${MUKAKU_CONFIG.PROBE_CACHE_KEY}:${mvId}`
}

/**
 * Pure: TTL filter for probe cache entries (mirrors probeCacheGet's check).
 * Returns the entry when fresh, else null. A fresh entry with BOTH ids null
 * is also rejected — null-null is never trusted as "confirmed no
 * association", so the card gets re-probed.
 */
export function filterFreshProbe(raw: unknown, now = Date.now()): ProbeCacheEntry | null {
  const entry = raw as ProbeCacheEntry
  if (!entry || typeof entry !== 'object' || typeof entry.ts !== 'number') return null
  if (now - entry.ts > MUKAKU_CONFIG.PROBE_CACHE_TTL_MS) return null
  if (entry.doubanId === null && entry.imdbId === null) return null
  return entry
}

/**
 * Batch probe read: ONE dbGetBulk instead of N probeCacheGet messages.
 * Expired/malformed/null-null entries are dropped; the Map is keyed by bare mvId.
 */
export async function probeCacheGetBulk(
  mvIds: string[],
  storeApi: MukakuStoreApi = DEFAULT_STORE,
): Promise<Map<string, ProbeCacheEntry>> {
  if (mvIds.length === 0) return new Map()
  const entries = await storeApi.dbGetBulk('ttl_cache', mvIds.map(probeCacheKey))
  const now = Date.now()
  const map = new Map<string, ProbeCacheEntry>()
  for (const { key, record } of entries) {
    const fresh = filterFreshProbe(record, now)
    if (fresh) map.set(key.slice(MUKAKU_CONFIG.PROBE_CACHE_KEY.length + 1), fresh)
  }
  return map
}

/**
 * Batch watched-ID read: ONE dbGetWatchedIds over douban_records + imdb_records
 * instead of two per-provider lookups. Honors a 30s in-memory cache when provided.
 * Keys are `{type}::{id}`; movie entries (movie:: prefix) are parsed per the
 * PT dimmer getCachedIdSets pattern. Returns bare ids.
 */
export async function getWatchedIdSets(
  cache?: WatchedIdCache | null,
  storeApi: MukakuStoreApi = DEFAULT_STORE,
): Promise<{ movieDoubanIds: Set<string>; imdbIds: Set<string> }> {
  if (cache && Date.now() - cache.ts < MUKAKU_CONFIG.WATCHED_ID_CACHE_TTL) {
    return { movieDoubanIds: cache.movieDoubanIds, imdbIds: cache.imdbIds }
  }

  const results = await storeApi.dbGetWatchedIds(['douban_records', 'imdb_records'])
  const movieDoubanIds = new Set<string>()
  const imdbIds = new Set<string>()
  for (const key of results.douban_records || []) {
    if (key.startsWith('movie::')) movieDoubanIds.add(key.slice('movie::'.length))
  }
  for (const key of results.imdb_records || []) {
    if (key.startsWith('movie::')) imdbIds.add(key.slice('movie::'.length))
  }
  return { movieDoubanIds, imdbIds }
}

/** Best-effort deletion of the two legacy judgment-cache keys (no TTL on those entries, so they'd persist forever). Idempotent. */
export async function cleanupLegacyMukakuCaches(storeApi: MukakuStoreApi = DEFAULT_STORE): Promise<void> {
  await storeApi.dbDelete('ttl_cache', 'umm:cache:mukaku:watched')
  await storeApi.dbDelete('ttl_cache', 'umm:cache:mukaku:unwatched')
}
