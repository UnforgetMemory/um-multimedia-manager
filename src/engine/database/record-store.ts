/**
 * Record store CRUD — read/write/delete of per-platform records (split from ./models).
 *
 * All functions take the shared DatabaseConnection (open handle + LRU read cache) and
 * keep the exact semantics models.ts had: copy-on-write put, in-transaction version
 * increment, adult-store `avId` derived-index maintenance, normalize-on-read with
 * batched write-back of migrated records.
 */

import type { StoreRecord } from '@/types';
import {
  normalizeStoreRecord,
  stampRecordVersion,
  MigrationError,
} from '@/engine/migration/models';
import type { WriteResult } from '@/feature/optimistic-lock/types';
import type { DatabaseConnection } from './connection';
import { ADULT_STORES, adultAvIdFromKey } from './schema';

/** 成人三表集合（写侧 avId 派生字段维护的判定源）。 */
const ADULT_STORE_SET: ReadonlySet<string> = new Set<string>(ADULT_STORES);

/**
 * 写侧单一维护点：成人三表的记录值内同步派生 `avId` = 键后缀
 * （ADULT_AV_ID_INDEX 索引字段），保证 L2 索引查询与键始终一致。
 * 非成人表原样返回（不新增字段）。
 */
function withAdultIndexFields(storeName: string, key: string, record: StoreRecord): StoreRecord {
  if (!ADULT_STORE_SET.has(storeName)) return record;
  return { ...record, avId: adultAvIdFromKey(key) };
}

/** Get a single record by key. Returns null if not found. Normalizes on read. */
export async function get(
  conn: DatabaseConnection,
  storeName: string,
  key: string,
): Promise<StoreRecord | null> {
  const cacheKey = `${storeName}::${key}`;
  const cached = conn.readCache.get(cacheKey) as StoreRecord | null | undefined;
  if (cached !== undefined) return cached;

  const result = await conn.storeOp(storeName, 'readonly', (store) => store.get(key));
  if (!result) {
    conn.readCache.set(cacheKey, null);
    return null;
  }

  try {
    const { record, migrated } = normalizeStoreRecord(result);
    if (migrated) {
      batchPut(conn, storeName, [{ key, record }]).catch((err) => {
        console.warn(`[DB] Failed to write back migrated record ${key}:`, err);
      });
    }
    conn.readCache.set(cacheKey, record);
    return record;
  } catch (err: unknown) {
    if (err instanceof MigrationError) {
      console.error(`[DB] Migration failed for ${storeName}/${key}:`, err.message, err.details);
      return result as StoreRecord;
    }
    throw err;
  }
}

/** Put (insert or update) a record. Stamps schema + record version. */
export async function put(
  conn: DatabaseConnection,
  storeName: string,
  key: string,
  record: StoreRecord,
): Promise<void> {
  // Copy-on-write: never mutate the caller's snapshot (domain immutability).
  const base: StoreRecord = {
    ...record,
    linkedIds: { ...record.linkedIds },
    updatedAt: record.updatedAt || new Date().toISOString(),
  };
  // 成人三表：写侧同步维护 avId 派生索引字段（键后缀）。
  const pending = withAdultIndexFields(storeName, key, base);

  // Read version and write in a single transaction to prevent race condition
  // where two concurrent calls both read version 0 and both write version 1.
  const db = await conn.ensureDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);

    const getReq = store.get(key);
    getReq.onsuccess = () => {
      const current = (getReq.result as StoreRecord | null) ?? null;
      const nextVersion = (current?.recordVersion ?? 0) + 1;
      store.put(stampRecordVersion({ ...pending, recordVersion: nextVersion }), key);
    };
    getReq.onerror = () => {
      // Fallback: write without version check
      store.put(stampRecordVersion({ ...pending, recordVersion: 1 }), key);
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

  conn.invalidateStoreCache(storeName);
}

/**
 * Put multiple records in a single readwrite transaction.
 * Each record is versioned exactly like put(): reads the current
 * recordVersion inside the same transaction and increments it (missing
 * keys start at 1). The store cache is invalidated once after commit.
 */
export async function batchPut(
  conn: DatabaseConnection,
  storeName: string,
  records: Array<{ key: string; record: StoreRecord }>,
): Promise<void> {
  if (records.length === 0) return;

  const db = await conn.ensureDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);

    for (const { key, record } of records) {
      const base: StoreRecord = {
        ...record,
        linkedIds: { ...record.linkedIds },
        updatedAt: record.updatedAt || new Date().toISOString(),
      };
      // 成人三表：写侧同步维护 avId 派生索引字段（与 put() 同一维护点语义）。
      const pending = withAdultIndexFields(storeName, key, base);

      const getReq = store.get(key);
      getReq.onsuccess = () => {
        const current = (getReq.result as StoreRecord | null) ?? null;
        const nextVersion = (current?.recordVersion ?? 0) + 1;
        store.put(stampRecordVersion({ ...pending, recordVersion: nextVersion }), key);
      };
      getReq.onerror = () => {
        // Fallback: write without version check
        store.put(stampRecordVersion({ ...pending, recordVersion: 1 }), key);
      };
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

  conn.invalidateStoreCache(storeName);
}

/**
 * Optimistic put — only writes if the record's version matches expectedVersion.
 * Prevents last-write-wins data loss when multiple content scripts write concurrently.
 *
 * Returns WriteResult: { ok: true, version } on success, { ok: false, conflict } on mismatch.
 */
export async function optimisticPut(
  conn: DatabaseConnection,
  storeName: string,
  key: string,
  record: StoreRecord,
  expectedVersion: number,
): Promise<WriteResult> {
  const current = await get(conn, storeName, key);
  const currentVersion = current?.recordVersion ?? 0;

  if (currentVersion !== expectedVersion) {
    console.warn(
      `[OptimisticLock] Conflict ${storeName}::${key}: ` +
        `current=v${currentVersion}, expected=v${expectedVersion}`,
    );
    return {
      ok: false,
      conflict: { currentVersion, expectedVersion },
    };
  }

  // put() re-reads version in-tx and stamps current+1 (== expected+1 here).
  await put(conn, storeName, key, record);
  return { ok: true, version: expectedVersion + 1 };
}

/** Delete a record by key. */
export async function del(conn: DatabaseConnection, storeName: string, key: string): Promise<void> {
  await conn.storeOp(storeName, 'readwrite', (store) => store.delete(key));
  conn.invalidateStoreCache(storeName);
}

/** Get all records from a store. Normalizes each record on read. */
export async function getAll(
  conn: DatabaseConnection,
  storeName: string,
): Promise<Array<{ key: string; record: StoreRecord }>> {
  const listCacheKey = `__list__${storeName}`;
  const cached = conn.readCache.get(listCacheKey) as
    | Array<{ key: string; record: StoreRecord }>
    | undefined;
  if (cached !== undefined) return cached;

  const db = await conn.ensureDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.openCursor();
    const results: Array<{ key: string; record: StoreRecord }> = [];
    // L7: collect migrated records during the cursor pass and write them
    // back in a single batchPut after the readonly tx completes, instead of
    // fire-and-forget put() per record (storm on first read after upgrade).
    const migratedRecords: Array<{ key: string; record: StoreRecord }> = [];

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        try {
          const { record, migrated } = normalizeStoreRecord(cursor.value);
          results.push({ key: cursor.key as string, record });
          if (migrated) {
            migratedRecords.push({ key: cursor.key as string, record });
          }
        } catch (err: unknown) {
          if (err instanceof MigrationError) {
            console.error(`[DB] Migration failed for ${storeName}/${cursor.key}:`, err.message);
            results.push({ key: cursor.key as string, record: cursor.value as StoreRecord });
          } else {
            throw err;
          }
        }
        cursor.continue();
      } else {
        conn.readCache.set(listCacheKey, results, 5_000);
        if (migratedRecords.length > 0) {
          batchPut(conn, storeName, migratedRecords).catch((err) => {
            console.warn(
              `[DB] Failed to write back ${migratedRecords.length} migrated records in ${storeName}:`,
              err,
            );
          });
        }
        resolve(results);
      }
    };
    request.onerror = () => reject(request.error);
    tx.onerror = () => reject(tx.error);
  });
}
