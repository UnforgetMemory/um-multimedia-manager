/**
 * IndexedDB Database Manager — public facade (v7)
 *
 * Architecture:
 * - Each platform gets its own object store: douban_records, imdb_records, neodb_records, tmdb_records
 * - Record key format: "type::providerId" (e.g. "movie::37332784")
 * - Cross-platform links stored in `linkedIds` map on each record
 * - TTL cache store maintained for supporting functionality
 * - PT ID cache stores PT→platform ID mappings from detail pages
 *
 * Record-level schema migration:
 * - Records carry a `schemaVersion` field (0 or undefined = legacy)
 * - On read, records are normalized via iterative migration steps
 * - On write, records are stamped with CURRENT_RECORD_VERSION
 * - Migration errors are logged and surfaced to the user
 *
 * v7 adds pt_id_cache store for caching PT torrent → platform ID associations.
 * v6 migration drops all old stores and creates fresh per-platform stores.
 *
 * Implementation split (2026-09-27 size gate, ADR-026 req 9) — this file keeps
 * only the facade + singleton; the responsibilities live in:
 * - ./connection    IDBDatabase handle, open/upgrade wiring, storeOp, LRU read cache
 * - ./record-store  record CRUD (get/put/batchPut/optimisticPut/delete/getAll)
 * - ./record-query  paginated/batch/index/count/watched-scan read ops
 * - ./pt-id-cache   PT ID cache store operations
 * - ./bulk-ops      cross-store export/clear maintenance
 * - ./schema        constants + pure key helpers (re-exported below)
 *
 * All DB access stays behind background + data-scheduler; content scripts must
 * use the `@/engine/database` message facade, never this deep path.
 */

import type { StoreRecord, PtIdCacheEntry } from '@/types';
import type { WriteResult } from '@/feature/optimistic-lock/types';
import { DatabaseConnection } from './connection';
import * as recordStore from './record-store';
import * as recordQuery from './record-query';
import * as ptIdCache from './pt-id-cache';
import * as bulkOps from './bulk-ops';
import type { PageQueryOptions, PageResult } from './query-utils';

// Schema constants + pure key helpers moved to ./schema (2026-09-26 god-file split);
// re-exported so existing '@engine/database/models' consumers are unaffected.
export {
  DB_NAME,
  DB_VERSION,
  STORE_NAMES,
  RECORD_STORES,
  ADULT_STORES,
  BACKUP_STORES,
  isWatchedStatus,
  normalizeVideoKey,
  normalizeStoreRecordKey,
  ADULT_AV_ID_INDEX,
  adultAvIdFromKey,
} from './schema';

export class MediaDatabase {
  private conn = new DatabaseConnection();

  async init(): Promise<void> {
    return this.conn.init();
  }

  /** Get a single record by key. Returns null if not found. Normalizes on read. */
  get(storeName: string, key: string): Promise<StoreRecord | null> {
    return recordStore.get(this.conn, storeName, key);
  }

  /** Put (insert or update) a record. Stamps schema + record version. */
  put(storeName: string, key: string, record: StoreRecord): Promise<void> {
    return recordStore.put(this.conn, storeName, key, record);
  }

  /**
   * Put multiple records in a single readwrite transaction.
   * Each record is versioned exactly like put(); the store cache is
   * invalidated once after commit.
   */
  batchPut(storeName: string, records: Array<{ key: string; record: StoreRecord }>): Promise<void> {
    return recordStore.batchPut(this.conn, storeName, records);
  }

  /**
   * Optimistic put — only writes if the record's version matches expectedVersion.
   * Returns { ok: true, version } on success, { ok: false, conflict } on mismatch.
   */
  optimisticPut(
    storeName: string,
    key: string,
    record: StoreRecord,
    expectedVersion: number,
  ): Promise<WriteResult> {
    return recordStore.optimisticPut(this.conn, storeName, key, record, expectedVersion);
  }

  /** Delete a record by key. */
  delete(storeName: string, key: string): Promise<void> {
    return recordStore.del(this.conn, storeName, key);
  }

  /** Get all records from a store. Normalizes each record on read. */
  getAll(storeName: string): Promise<Array<{ key: string; record: StoreRecord }>> {
    return recordStore.getAll(this.conn, storeName);
  }

  /**
   * Cursor-based paginated query with limit and offset.
   * Supports optional index + key range filtering.
   */
  queryPage<T = StoreRecord>(storeName: string, opts?: PageQueryOptions): Promise<PageResult<T>> {
    return recordQuery.queryPage<T>(this.conn, storeName, opts);
  }

  /**
   * Get multiple records by key in a single transaction.
   * Keys not found are omitted from the result.
   */
  batchGet<T = StoreRecord>(storeName: string, keys: IDBValidKey[]): Promise<Map<IDBValidKey, T>> {
    return recordQuery.batchGet<T>(this.conn, storeName, keys);
  }

  /** Count records in a store. */
  count(storeName: string): Promise<number> {
    return recordQuery.count(this.conn, storeName);
  }

  /**
   * Exact-match lookup on a secondary index (e.g. ADULT_AV_CHECK L2 `avId`),
   * records normalized like getAll(). See ./record-query for full semantics.
   */
  getByIndex<T = StoreRecord>(
    storeName: string,
    indexName: string,
    query: IDBValidKey,
  ): Promise<Array<{ key: string; record: T }>> {
    return recordQuery.getByIndex<T>(this.conn, storeName, indexName, query);
  }

  /**
   * Get all keys with status == 2 (watched/done only) via the `status` index
   * key-cursors — O(watched), zero per-record clone. See ./record-query for
   * the load-bearing performance constraints.
   */
  getWatchedIds(storeName: string): Promise<Set<string>> {
    return recordQuery.getWatchedIds(this.conn, storeName);
  }

  /** Get a PT ID cache entry by URL. Normalizes on read. */
  getCacheEntry(ptUrl: string): Promise<PtIdCacheEntry | null> {
    return ptIdCache.getCacheEntry(this.conn, ptUrl);
  }

  /** Batch get PT ID cache entries by URL in a single transaction. Missing keys are omitted. */
  getCacheEntries(ptUrls: string[]): Promise<Record<string, PtIdCacheEntry>> {
    return ptIdCache.getCacheEntries(this.conn, ptUrls);
  }

  putCacheEntry(entry: PtIdCacheEntry): Promise<void> {
    return ptIdCache.putCacheEntry(this.conn, entry);
  }

  /** Get all records from all record stores + adult stores (for export). */
  getAllStores(): Promise<Record<string, Record<string, StoreRecord>>> {
    return bulkOps.getAllStores(this.conn);
  }

  /** Clear all records from all stores. */
  clearAll(): Promise<void> {
    return bulkOps.clearAll(this.conn);
  }

  /** Close the database connection. */
  close(): void {
    this.conn.close();
  }
}

/** Singleton instance */
export const mediaDB = new MediaDatabase();
