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

/** Store an array of strings as a set. */
export async function setAddItem(setKey: string, id: string): Promise<void> {
  const raw = await ttlCacheGet<string[]>(setKey)
  const arr: string[] = Array.isArray(raw) ? raw : []
  if (!arr.includes(id)) arr.push(id)
  await ttlCachePut(setKey, arr)
}

/** Check if a set contains an id. */
export async function setHasItem(setKey: string, id: string): Promise<boolean> {
  const raw = await ttlCacheGet<string[]>(setKey)
  return Array.isArray(raw) && raw.includes(id)
}

/** Delete an item from a set. */
export async function setDeleteItem(setKey: string, id: string): Promise<void> {
  const raw = await ttlCacheGet<string[]>(setKey)
  const arr: string[] = Array.isArray(raw) ? raw : []
  const idx = arr.indexOf(id)
  if (idx !== -1) arr.splice(idx, 1)
  await ttlCachePut(setKey, arr)
}

/** Add an expiring id (stored as map of id → expiry timestamp). */
export async function expMapAdd(mapKey: string, id: string, ttlMs: number): Promise<void> {
  const raw = await ttlCacheGet<Record<string, number>>(mapKey)
  const map: Record<string, number> = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {}
  map[id] = Date.now() + ttlMs
  await ttlCachePut(mapKey, map)
}

/** Check if an id exists in expiring map and hasn't expired. */
export async function expMapHas(mapKey: string, id: string): Promise<boolean> {
  const raw = await ttlCacheGet<Record<string, number>>(mapKey)
  const map: Record<string, number> = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {}
  const expiry = map[id]
  return expiry !== undefined && Date.now() < expiry
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

/** Get probe result from IndexedDB persistent cache (returns null if expired or missing). */
export async function probeCacheGet(mvId: string): Promise<ProbeCacheEntry | null> {
  const raw = await ttlCacheGet<ProbeCacheEntry>(`${MUKAKU_CONFIG.PROBE_CACHE_KEY}:${mvId}`)
  if (!raw || typeof raw !== 'object' || typeof raw.ts !== 'number') return null
  if (Date.now() - raw.ts > MUKAKU_CONFIG.PROBE_CACHE_TTL_MS) return null
  return raw as ProbeCacheEntry
}

/**
 * Get watched IDs (status >= 2) for a given type + provider.
 * Uses handler-level cache with 30s TTL to avoid repeated watched-id queries.
 */
export async function getIdSet(type: string, provider: string, cache?: { movieDoubanIds: Set<string>; imdbIds: Set<string>; ts: number } | null): Promise<Set<string>> {
  // Use handler-level cache if available and fresh
  if (cache) {
    const now = Date.now()
    if (now - cache.ts < MUKAKU_CONFIG.WATCHED_ID_CACHE_TTL) {
      if (provider === 'douban') return cache.movieDoubanIds
      if (provider === 'imdb') return cache.imdbIds
    }
  }

  const storeName = `${provider}_records`
  const results = await Store.dbGetWatchedIds([storeName])
  const ids = new Set<string>()
  const prefix = `${type}::`
  for (const key of results[storeName] || []) {
    if (key.startsWith(prefix)) {
      ids.add(key.slice(prefix.length))
    }
  }
  return ids
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
}

const DEFAULT_STORE: MukakuStoreApi = {
  dbGetBulk: (storeName, keys) => Store.dbGetBulk(storeName, keys),
  dbGetWatchedIds: (storeNames) => Store.dbGetWatchedIds(storeNames),
  dbPut: (storeName, key, value) =>
    (Store.dbPut as (s: string, k: string, v: unknown) => Promise<void>)(storeName, key, value),
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
 * Returns the entry when fresh, else null.
 */
export function filterFreshProbe(raw: unknown, now = Date.now()): ProbeCacheEntry | null {
  const entry = raw as ProbeCacheEntry
  if (!entry || typeof entry !== 'object' || typeof entry.ts !== 'number') return null
  if (now - entry.ts > MUKAKU_CONFIG.PROBE_CACHE_TTL_MS) return null
  return entry
}

/**
 * Batch probe read: ONE dbGetBulk instead of N probeCacheGet messages.
 * Expired/malformed entries are dropped; the Map is keyed by bare mvId.
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
 * instead of two getIdSet calls. Honors a 30s in-memory cache when provided.
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

/**
 * Batch flush of both sets in EXACTLY 2 writes, preserving the stored shapes:
 * watched → string[] (setAddItem's shape), unwatched → Record<string, number>
 * (expMapAdd's shape). Collapses the per-card setAddItem/setDeleteItem/
 * expMapAdd read-modify-write storm.
 */
export async function writeBatchedSets(
  watched: Set<string> | string[],
  unwatched: Record<string, number>,
  storeApi: MukakuStoreApi = DEFAULT_STORE,
): Promise<void> {
  const watchedArr = watched instanceof Set ? [...watched] : watched
  await storeApi.dbPut('ttl_cache', MUKAKU_CONFIG.WATCHED_SET_KEY, watchedArr)
  await storeApi.dbPut('ttl_cache', MUKAKU_CONFIG.UNWATCHED_TTL_KEY, unwatched)
}
