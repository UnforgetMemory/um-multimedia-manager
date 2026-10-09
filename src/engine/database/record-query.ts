/**
 * Record store read-only queries — pagination, batch get, index lookups, watched-set
 * scan (split from ./models). Cursor-performance constraints documented on
 * getWatchedIds are load-bearing; keep them when touching this module.
 */

import type { StoreRecord } from '@/types';
import { normalizeStoreRecord, MigrationError } from '@/engine/migration/models';
import { queryPage as queryPageUtil, batchGet as batchGetUtil } from './query-utils';
import type { PageQueryOptions, PageResult } from './query-utils';
import type { DatabaseConnection } from './connection';

/**
 * Cursor-based paginated query with limit and offset.
 * Supports optional index + key range filtering.
 */
export async function queryPage<T = StoreRecord>(
  conn: DatabaseConnection,
  storeName: string,
  opts?: PageQueryOptions,
): Promise<PageResult<T>> {
  const db = await conn.ensureDB();
  const tx = db.transaction(storeName, 'readonly');
  const store = tx.objectStore(storeName);
  return queryPageUtil<T>(store, opts);
}

/**
 * Get multiple records by key in a single transaction.
 * Keys not found are omitted from the result.
 */
export async function batchGet<T = StoreRecord>(
  conn: DatabaseConnection,
  storeName: string,
  keys: IDBValidKey[],
): Promise<Map<IDBValidKey, T>> {
  const db = await conn.ensureDB();
  const tx = db.transaction(storeName, 'readonly');
  const store = tx.objectStore(storeName);
  return batchGetUtil<T>(store, keys);
}

/** Count records in a store. */
export async function count(conn: DatabaseConnection, storeName: string): Promise<number> {
  return conn.storeOp(storeName, 'readonly', (store) => store.count());
}

/**
 * Exact-match lookup on a secondary index. Returns every entry whose index
 * value equals `query`, as `{ key, record }` pairs ordered by primary key,
 * with records normalized the same way as getAll() (whitelist + record-level
 * migration; no write-back — bulk readers still repair via getAll()).
 *
 * Used by ADULT_AV_CHECK L2 (`avId` index) to replace the old full-store
 * cursor scan; results are value-identical to the old suffix comparison
 * because the write side (put/batchPut) and the v15 migration backfill keep
 * the indexed field in sync with the key suffix.
 */
export async function getByIndex<T = StoreRecord>(
  conn: DatabaseConnection,
  storeName: string,
  indexName: string,
  query: IDBValidKey,
): Promise<Array<{ key: string; record: T }>> {
  const db = await conn.ensureDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.index(indexName).openCursor(IDBKeyRange.only(query));
    const results: Array<{ key: string; record: T }> = [];

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve(results);
        return;
      }
      try {
        const { record } = normalizeStoreRecord(cursor.value);
        results.push({ key: cursor.primaryKey as string, record: record as T });
      } catch (err: unknown) {
        if (err instanceof MigrationError) {
          console.error(
            `[DB] Migration failed for ${storeName}/${cursor.primaryKey}:`,
            err.message,
          );
          results.push({ key: cursor.primaryKey as string, record: cursor.value as T });
        } else {
          throw err;
        }
      }
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Get all keys with status == 2 (watched/done only).
 *
 * Uses the `status` index with two key-range cursors (numeric 2 and legacy
 * string "done") instead of a full-store cursor scan:
 * - Old records may have string status ("done", "wish") saved from earlier code
 * - IndexedDB key ranges are type-sensitive (numeric 2 and string 'done' are
 *   DIFFERENT index keys), so both keys are queried explicitly
 * - isWatchedStatus accepts only numeric 2 and string 'done' as watched, so
 *   the union of these two index cursors is exactly the watched set
 *
 * CRITICAL: this MUST use `openKeyCursor` (plain IDBCursor, index key +
 * primary key only). `index.openCursor()` returns IDBCursorWithValue and the
 * browser structured-clones the FULL record value for every visited entry
 * even when `cursor.value` is never read — a large watched library then
 * takes seconds and blows the 8s scheduler task budget (DB_GET_WATCHED_IDS
 * timeout cascade on PT sites). Key cursors never deserialize values, so the
 * cost is strictly O(watched) with zero per-record clone.
 *
 * NOTE: Only status=2 (watched) is returned — wishlist (status=1) and doing (status=3)
 * records are excluded because they should NOT trigger PT site dimming or UI
 * "watched" badges.
 *
 * Returns a Set of record primary keys (e.g., "movie::37332784").
 */
export async function getWatchedIds(
  conn: DatabaseConnection,
  storeName: string,
): Promise<Set<string>> {
  const db = await conn.ensureDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const index = store.index('status');
    const ids = new Set<string>();
    let pending = 2;
    // Guard against double settlement (e.g. one cursor errors while the
    // other finishes, or tx.onerror fires after resolve) — JS ignores the
    // second call.
    let settled = false;

    const finish = () => {
      pending--;
      if (pending === 0) {
        if (!settled) {
          settled = true;
          resolve(ids);
        }
      }
    };

    // Key-only cursor: `cursor.primaryKey` is the record's primary key.
    const walk = (request: IDBRequest<IDBCursor | null>): void => {
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          ids.add(cursor.primaryKey as string);
          cursor.continue();
        } else {
          finish();
        }
      };
      request.onerror = () => {
        console.error(
          `[DB] getWatchedIds(${storeName}) status-index cursor failed:`,
          request.error,
        );
        if (!settled) {
          settled = true;
          reject(request.error);
        }
      };
    };

    // Cursor 1: numeric status 2 (watched). Cursor 2: legacy string 'done'.
    // A record cannot have both statuses, so the union is the exact watched set.
    walk(index.openKeyCursor(IDBKeyRange.only(2)));
    walk(index.openKeyCursor(IDBKeyRange.only('done')));

    tx.onerror = () => {
      console.error(`[DB] Transaction error on ${storeName}:`, tx.error);
      if (!settled) {
        settled = true;
        reject(tx.error);
      }
    };
  });
}
