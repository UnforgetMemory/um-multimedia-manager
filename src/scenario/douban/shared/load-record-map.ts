/**
 * Unified Douban record map loader from IndexedDB.
 *
 * Delegates to record-cache-core.ts for the actual DB → Map transformation.
 *
 * This is the **full-store** entry point: no id list means "walk every record".
 * A page that only needs the rows it can see must use {@link loadRecordMapForIds}
 * or {@link loadRecordMapForKeys} instead — those resolve an empty list to an
 * empty map rather than paying a store scan on the mount path (ADR-015 §7.1).
 *
 * Usage:
 *   const map = await loadRecordMap('movie')    // load movie:: records
 *   const map = await loadRecordMap('music')    // load music:: records
 *   const map = await loadRecordMap()           // load all, strip type:: prefix
 */

import type { StoreRecord } from '@/types';
import { loadRecordEntries } from './record-cache-core';

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
export async function loadRecordMap(
  prefix?: string,
  ids?: string[],
): Promise<Map<string, StoreRecord>> {
  return loadRecordEntries(prefix, ids);
}

/**
 * Batch-read the records behind an id list (recommendation grids, list rows).
 *
 * Unlike {@link loadRecordMap}, a missing or empty id list resolves to an empty
 * map here instead of falling through to the full-store scan — a page whose
 * section is empty (or whose parse produced nothing yet) must not pay a store
 * walk for it.
 */
export async function loadRecordMapForIds(
  prefix: string,
  ids: readonly string[] | undefined,
): Promise<Map<string, StoreRecord>> {
  const unique = [...new Set((ids ?? []).filter((id) => id.length > 0))];
  if (unique.length === 0) return new Map<string, StoreRecord>();
  return loadRecordEntries(prefix, unique);
}

/**
 * {@link loadRecordMapForIds} for callers holding full `{type}::{id}` keys
 * (cross-type sections such as a doulist, where movie and book rows mix).
 */
export async function loadRecordMapForKeys(
  keys: readonly string[] | undefined,
): Promise<Map<string, StoreRecord>> {
  return loadRecordMapForIds('', keys);
}

export { useRecordCache } from './composables/use-record-cache';
