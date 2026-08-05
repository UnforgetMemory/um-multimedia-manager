/**
 * Unified Douban record map loader from IndexedDB.
 *
 * Delegates to record-cache-core.ts for the actual DB → Map transformation.
 * This module preserves the original public API for backward compatibility.
 *
 * Usage:
 *   const map = await loadRecordMap('movie')    // load movie:: records
 *   const map = await loadRecordMap('music')    // load music:: records
 *   const map = await loadRecordMap()           // load all, strip type:: prefix
 */

import type { StoreRecord } from '@/types'
import { loadRecordEntries } from './record-cache-core'

/**
 * Load douban_records from IndexedDB into a Map.
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
 */
export async function loadRecordMap(prefix?: string, ids?: string[]): Promise<Map<string, StoreRecord>> {
  return loadRecordEntries(prefix, ids)
}

export { useRecordCache } from './composables/useRecordCache'
