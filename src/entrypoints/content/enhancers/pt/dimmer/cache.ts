/**
 * PT Dimmer 缓存管理
 */

import { Store } from '@/features/database'
import type { CachedIdSets } from '../types'

/** 缓存 TTL（毫秒） */
export const CACHE_TTL = 30_000 // 30 seconds

/**
 * 获取缓存的 ID 集合（带 TTL）
 * 使用 dbGetWatchedIds 批量查询，单次消息获取所有 store 的 watched IDs
 */
export async function getCachedIdSets(
  debug: (...args: any[]) => void,
  idCache: CachedIdSets | null,
  cacheTimestamp: number,
): Promise<{ sets: CachedIdSets; updatedCache: CachedIdSets; updatedTimestamp: number }> {
  const now = Date.now()
  if (idCache && (now - cacheTimestamp) < CACHE_TTL) {
    debug('[Cache] Using cached ID sets (age:', (now - cacheTimestamp) / 1000, 's)')
    return { sets: idCache, updatedCache: idCache, updatedTimestamp: cacheTimestamp }
  }

  debug('[DB] Fetching watched IDs from douban_records + imdb_records...')
  const raw = await Store.dbGetWatchedIds(['douban_records', 'imdb_records'])

  const movieDoubanIds = new Set<string>()
  const musicDoubanIds = new Set<string>()
  const imdbIds = new Set<string>()

  const doubanKeys = raw['douban_records'] || []
  const imdbKeys = raw['imdb_records'] || []
  debug('[DB] Raw douban_records keys:', doubanKeys.length, '| imdb_records keys:', imdbKeys.length)
  // Show raw key samples to diagnose key format mismatches
  if (doubanKeys.length > 0) debug('[DB] Sample douban raw keys:', doubanKeys.slice(0, 5))
  if (imdbKeys.length > 0) debug('[DB] Sample imdb raw keys:', imdbKeys.slice(0, 5))
  if (doubanKeys.length === 0) debug('[DB] ⚠️ douban_records returned ZERO watched keys - status may be missing/non-numeric')
  if (imdbKeys.length === 0) debug('[DB] ⚠️ imdb_records returned ZERO watched keys - status may be missing/non-numeric')

  for (const key of doubanKeys) {
    if (key.startsWith('movie::')) movieDoubanIds.add(key.slice(7))
    else if (key.startsWith('music::')) musicDoubanIds.add(key.slice(7))
  }
  for (const key of imdbKeys) {
    if (key.startsWith('movie::')) imdbIds.add(key.slice(7))
  }

  debug('[DB] Parsed IDs — movieDouban:', movieDoubanIds.size, 'musicDouban:', musicDoubanIds.size, 'imdb:', imdbIds.size)
  if (movieDoubanIds.size > 0) debug('[DB] Sample movieDouban IDs:', [...movieDoubanIds].slice(0, 5))
  else if (doubanKeys.length > 0) debug('[DB] ⚠️ douban keys found but none matched movie:: or music:: prefix — key format mismatch!')
  if (musicDoubanIds.size > 0) debug('[DB] Sample musicDouban IDs:', [...musicDoubanIds].slice(0, 5))
  if (imdbIds.size > 0) debug('[DB] Sample IMDb IDs:', [...imdbIds].slice(0, 5))
  else if (imdbKeys.length > 0) debug('[DB] ⚠️ imdb keys found but none matched movie:: prefix — key format mismatch!')

  const updatedCache = { movieDoubanIds, musicDoubanIds, imdbIds }
  return { sets: updatedCache, updatedCache, updatedTimestamp: now }
}

/**
 * 获取电影类已看 ID 集合（Douban + IMDb）
 */
export async function getMovieSets(
  debug: (...args: any[]) => void,
  idCache: CachedIdSets | null,
  cacheTimestamp: number,
): Promise<{ doubanIds: Set<string>; imdbIds: Set<string> }> {
  const { sets } = await getCachedIdSets(debug, idCache, cacheTimestamp)
  return { doubanIds: sets.movieDoubanIds, imdbIds: sets.imdbIds }
}

/**
 * 获取 M-Team 专用 ID 集合（包含音乐）
 */
export async function getMTeamSets(
  debug: (...args: any[]) => void,
  idCache: CachedIdSets | null,
  cacheTimestamp: number,
): Promise<CachedIdSets> {
  const { sets } = await getCachedIdSets(debug, idCache, cacheTimestamp)
  return sets
}

/**
 * Cache fallback: for rows without direct platform IDs, look up pt_id_cache by detail URL.
 * Uses bulk query to minimize DB calls.
 */
export async function applyCacheFallback(
  debug: (...args: any[]) => void,
  rows: Element[],
  extractDetailUrl: (row: Element) => string | null,
  movieDoubanIds: Set<string>,
  musicDoubanIds: Set<string>,
  imdbIds: Set<string>,
  dimElement: (element: HTMLElement) => void,
): Promise<void> {
  if (rows.length === 0) {
    debug('[CacheFallback] No unresolved rows to check')
    return
  }

  // Collect detail URLs from unresolved rows
  const urlMap = new Map<string, Element[]>()
  for (const row of rows) {
    const rawUrl = extractDetailUrl(row)
    if (!rawUrl) continue
    try {
      const u = new URL(rawUrl, location.origin)
      const key = `${u.origin}${u.pathname}${u.search}`
      const existing = urlMap.get(key)
      if (existing) existing.push(row)
      else urlMap.set(key, [row])
    } catch {
      // ignore invalid URLs
    }
  }
  if (urlMap.size === 0) {
    debug('[CacheFallback] No detail URLs found in unresolved rows')
    return
  }

  debug('[CacheFallback] Looking up', urlMap.size, 'detail URLs in pt_id_cache...')
  const cacheMap = await Store.ptIdCacheGetBulk([...urlMap.keys()])
  const cacheEntries = Object.keys(cacheMap).length
  debug('[CacheFallback] Cache hits:', cacheEntries, '| missed:', urlMap.size - cacheEntries)

  let hitDimmed = 0
  for (const [ptUrl, entry] of Object.entries(cacheMap)) {
    if (!entry) continue
    const rowsForUrl = urlMap.get(ptUrl)
    if (!rowsForUrl) continue

    const cachedDouban = entry.doubanId
    const cachedImdb = entry.imdbId

    const matched =
      (cachedDouban && (movieDoubanIds.has(cachedDouban) || musicDoubanIds.has(cachedDouban))) ||
      (cachedImdb && imdbIds.has(cachedImdb))

    debug('[CacheFallback] URL:', ptUrl.slice(0, 80), '| Cached:', JSON.stringify({ doubanId: cachedDouban, imdbId: cachedImdb }), '→', matched ? 'DIMMED ✓' : 'no match')

    for (const row of rowsForUrl) {
      if (matched) {
        dimElement(row as HTMLElement)
        hitDimmed++
      }
      // Mark as resolved after cache lookup to prevent re-querying every cycle
      row.setAttribute('data-umm-mteam-resolved', 'true')
    }
  }
  debug('[CacheFallback] Done — dimmed via cache:', hitDimmed)

  // Mark rows with no cache entry as resolved to prevent re-querying
  const resolvedUrls = new Set(Object.keys(cacheMap))
  for (const [ptUrl, rowsForUrl] of urlMap) {
    if (!resolvedUrls.has(ptUrl)) {
      for (const row of rowsForUrl) {
        row.setAttribute('data-umm-mteam-resolved', 'true')
      }
    }
  }
}

/**
 * 使 ID 缓存失效
 */
export function invalidateIdCache(
  setCacheNull: () => void,
  debug: (...args: any[]) => void,
): void {
  debug('[Cache] Storage changed — invalidating ID cache')
  setCacheNull()
}
