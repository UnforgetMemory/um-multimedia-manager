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
  const raw: any = await Store.dbGet(TTL, key)
  return raw as T | null
}

/** Typed wrapper for ttl_cache put. Cast is contained here. */
async function ttlCachePut<T>(key: string, value: T): Promise<void> {
  await (Store as any).dbPut(TTL, key, value)
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
 * Uses handler-level cache with 30s TTL to avoid repeated dbGetAll calls.
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
  const entries = await Store.dbGetAll(storeName)
  const ids = new Set<string>()
  const prefix = `${type}::`
  for (const { key, record } of entries) {
    if (key.startsWith(prefix) && record.status >= 2) {
      ids.add(key.slice(prefix.length))
    }
  }
  return ids
}