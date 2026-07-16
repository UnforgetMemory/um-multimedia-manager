/**
 * Unified Douban record map loader from IndexedDB.
 *
 * Consolidates 3 implementations:
 * - shared/composables/useRecordCache.ts  (reactive composable)
 * - search/search-data.ts → loadRecordMapImpl()
 * - albums/albums-data.ts → loadRecordMapImpl()
 *
 * Usage:
 *   const map = await loadRecordMap('movie')    // load movie:: records
 *   const map = await loadRecordMap('music')    // load music:: records
 *   const map = await loadRecordMap()           // load all, strip type:: prefix
 */

import { Store } from '@/features/database'
import type { StoreRecord } from '@/types'

/**
 * Load douban_records from IndexedDB into a Map.
 * @param prefix - Optional store key prefix (e.g. 'movie', 'music').
 *                 When provided, only records with that prefix are loaded
 *                 and the prefix is stripped from map keys.
 *                 When omitted, ALL douban_records are loaded and the
 *                 `{type}::` prefix is stripped from each key.
 */
export async function loadRecordMap(prefix?: string): Promise<Map<string, StoreRecord>> {
  const map = new Map<string, StoreRecord>()
  try {
    const entries = await Store.dbGetAll('douban_records')
    if (prefix) {
      const p = `${prefix}::`
      for (const { key, record } of entries) {
        if (key.startsWith(p)) {
          map.set(key.slice(p.length), record)
        }
      }
    } else {
      for (const { key, record } of entries) {
        const id = key.split('::')[1]
        if (id) {
          map.set(id, {
            status: record.status ?? 0,
            rating: record.rating ?? 0,
          } as StoreRecord)
        }
      }
    }
  } catch {
    // DB errors are non-critical for record loading
  }
  return map
}

export { useRecordCache } from './composables/useRecordCache'
