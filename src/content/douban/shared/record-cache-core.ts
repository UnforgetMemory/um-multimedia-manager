/**
 * Single core loading routine for Douban record maps from IndexedDB.
 *
 * Consolidates the loading logic shared between:
 * - load-record-map.ts  (plain async function)
 * - useRecordCache.ts   (reactive composable)
 *
 * Both callers delegate here so the DB → Map transformation lives in one place.
 */

import { Store } from '@/features/database'
import type { StoreRecord } from '@/types'

/**
 * Minimal Store API shape for dependency injection (testability).
 * Matches the two methods used by the loading routine.
 */
export interface StoreApi {
  dbGetBulk: typeof Store.dbGetBulk
  dbGetAll: typeof Store.dbGetAll
}

const DEFAULT_STORE: StoreApi = {
  dbGetBulk: (...args) => Store.dbGetBulk(...args),
  dbGetAll: (...args) => Store.dbGetAll(...args),
}

/**
 * Load douban_records from IndexedDB into a Map.
 *
 * @param prefix - Optional store key prefix (e.g. 'movie', 'music').
 *                 When provided, only records with that prefix are loaded
 *                 and the prefix is stripped from map keys.
 *                 When omitted, ALL douban_records are loaded and the
 *                 `{type}::` prefix is stripped from each key.
 * @param ids - Optional subject ids to batch-read. When provided, only
 *              `{prefix}::` keys for these ids are fetched (targeted
 *              batch read instead of full-store scan). Without prefix,
 *              ids are treated as full `{type}::` keys. When omitted,
 *              falls back to dbGetAll over the whole store.
 * @param storeApi - Optional store API override (for testing).
 */
export async function loadRecordEntries(
  prefix?: string,
  ids?: string[],
  storeApi: StoreApi = DEFAULT_STORE,
): Promise<Map<string, StoreRecord>> {
  const map = new Map<string, StoreRecord>()
  try {
    let entries: Array<{ key: string; record: StoreRecord }>
    if (ids && ids.length > 0) {
      const p = prefix ? `${prefix}::` : ''
      entries = await storeApi.dbGetBulk('douban_records', ids.map((id) => `${p}${id}`))
    } else {
      entries = await storeApi.dbGetAll('douban_records')
    }
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
