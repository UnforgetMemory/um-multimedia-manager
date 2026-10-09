import { test, expect } from '@playwright/test';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { DatabaseConnection } from '@/engine/database/connection';
import { getAllStores, clearAll } from '@/engine/database/bulk-ops';
import { getAll, get, put } from '@/engine/database/record-store';
import {
  DB_NAME,
  STORE_NAMES,
  RECORD_STORES,
  ADULT_STORES,
  BACKUP_STORES,
} from '@/engine/database/schema';
import type { StoreRecord } from '@/types';

/**
 * X12-A coverage wave — bulk-ops.ts (cross-store export read + full wipe).
 *
 * These two functions are the whole WebDAV backup / reset surface, so the store
 * whitelist (what may leave the device) and the wipe scope (what gets destroyed)
 * are both pinned, together with the read-cache flush clearAll owes the LRU layer.
 */

type Raw = Record<string, unknown>;
type StoreMap = Record<string, StoreRecord>;

// Playwright reuses one worker across spec files; capture the true originals
// at import time so withDb can leave globalThis exactly as it found it.
const ORIGINAL_INDEXEDDB = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
const ORIGINAL_IDB_KEY_RANGE = Object.getOwnPropertyDescriptor(globalThis, 'IDBKeyRange');

function seedRecord(over: Partial<StoreRecord> = {}): StoreRecord {
  return {
    url: 'https://movie.douban.com/subject/1/',
    status: 2,
    rating: 8,
    updatedAt: '2026-01-01T00:00:00.000Z',
    linkedIds: {},
    ...over,
  };
}

async function withDb(body: (conn: DatabaseConnection) => Promise<void>): Promise<void> {
  const factory = new IDBFactory();
  const g = globalThis as unknown as { indexedDB?: IDBFactory; IDBKeyRange?: typeof IDBKeyRange };
  g.indexedDB = factory;
  g.IDBKeyRange = IDBKeyRange;
  const conn = new DatabaseConnection();
  try {
    await conn.init();
    await body(conn);
  } finally {
    conn.close();
    await new Promise<void>((resolve) => {
      const req = factory.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
    // Release the installed globals, not just the connection: a leftover
    // fake-indexeddb factory leaks into the next spec on this worker.
    if (ORIGINAL_INDEXEDDB) Object.defineProperty(globalThis, 'indexedDB', ORIGINAL_INDEXEDDB);
    else delete g.indexedDB;
    if (ORIGINAL_IDB_KEY_RANGE)
      Object.defineProperty(globalThis, 'IDBKeyRange', ORIGINAL_IDB_KEY_RANGE);
    else delete g.IDBKeyRange;
  }
}

function rawSeed(
  conn: DatabaseConnection,
  storeName: string,
  entries: Array<{ key: string; value: Raw }>,
): Promise<void> {
  return conn.ensureDB().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        for (const { key, value } of entries) store.put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

/** Every store name in the live schema. */
function storeNames(conn: DatabaseConnection): Promise<string[]> {
  return conn.ensureDB().then((db) => Array.from(db.objectStoreNames).sort());
}

/** Raw key count of a store, read straight from IndexedDB. */
async function keyCount(conn: DatabaseConnection, storeName: string): Promise<number> {
  const keys = await conn.storeOp<IDBValidKey[]>(storeName, 'readonly', (store) =>
    store.getAllKeys(),
  );
  return keys.length;
}

function mapOf(exported: Record<string, StoreMap>, storeName: string): StoreMap {
  const map = exported[storeName];
  if (!map) throw new Error(`export is missing store ${storeName}`);
  return map;
}

test.describe('getAllStores — export read', () => {
  test('an untouched database exports every record store as an empty map and no adult store', async () => {
    await withDb(async (conn) => {
      const exported = await getAllStores(conn);

      expect(Object.keys(exported).sort()).toEqual([...RECORD_STORES].sort());
      for (const storeName of RECORD_STORES) expect(mapOf(exported, storeName)).toEqual({});
      for (const storeName of ADULT_STORES) expect(exported[storeName]).toBeUndefined();
    });
  });

  test('adult stores join the export only when they hold data', async () => {
    await withDb(async (conn) => {
      await put(conn, STORE_NAMES.JAV_IDS, 'javdb::SSIS-001', seedRecord());

      const exported = await getAllStores(conn);
      expect(Object.keys(exported).sort()).toEqual([...RECORD_STORES, STORE_NAMES.JAV_IDS].sort());
      expect(Object.keys(mapOf(exported, STORE_NAMES.JAV_IDS))).toEqual(['javdb::SSIS-001']);
    });
  });

  test('key → record maps are exactly what getAll reports per store', async () => {
    await withDb(async (conn) => {
      await put(conn, STORE_NAMES.DOUBAN, 'movie::1', seedRecord({ rating: 9 }));
      await put(conn, STORE_NAMES.DOUBAN, 'tv::2', seedRecord({ rating: 7 }));
      await put(conn, STORE_NAMES.IMDB, 'movie::tt1', seedRecord({ rating: 6 }));
      await put(conn, STORE_NAMES.SEHUATANG_IDS, 'sehuatang::TID-1', seedRecord({ rating: 5 }));

      const exported = await getAllStores(conn);
      expect(Object.keys(mapOf(exported, STORE_NAMES.DOUBAN)).sort()).toEqual([
        'movie::1',
        'tv::2',
      ]);
      expect(mapOf(exported, STORE_NAMES.DOUBAN)['movie::1']?.rating).toBe(9);
      expect(mapOf(exported, STORE_NAMES.IMDB)['movie::tt1']?.rating).toBe(6);
      expect(Object.keys(mapOf(exported, STORE_NAMES.SEHUATANG_IDS))).toEqual(['sehuatang::TID-1']);

      // Count + key equivalence against the single-store reader.
      for (const storeName of RECORD_STORES) {
        const entries = await getAll(conn, storeName);
        expect(Object.keys(mapOf(exported, storeName)).sort()).toEqual(
          entries.map((e) => e.key).sort(),
        );
      }
    });
  });

  test('exported records are normalized copies (read-side migration and whitelist apply)', async () => {
    await withDb(async (conn) => {
      await rawSeed(conn, STORE_NAMES.DOUBAN, [
        {
          key: 'movie::legacy',
          value: {
            url: 'https://movie.douban.com/subject/2/',
            status: 'done',
            rating: 8,
            updatedAt: '2024-01-01T00:00:00.000Z',
            linkedIds: {},
            isAdmin: true,
          },
        },
      ]);

      const record = mapOf(await getAllStores(conn), STORE_NAMES.DOUBAN)['movie::legacy'];
      expect(record?.schemaVersion).toBe(2);
      expect(record?.status).toBe(0); // legacy string status is not a valid code
      expect(record?.rating).toBe(8);
      expect(asRaw(record).isAdmin).toBeUndefined();
    });
  });

  test('support stores never enter the export (ttl_cache / pt_id_cache)', async () => {
    await withDb(async (conn) => {
      await rawSeed(conn, STORE_NAMES.TTL_CACHE, [{ key: 'ttl::1', value: { expiry: 1 } }]);
      await rawSeed(conn, STORE_NAMES.PT_ID_CACHE, [
        { key: 'https://pt/1', value: { ptUrl: 'https://pt/1', updatedAt: '2026-01-01' } },
      ]);

      const exported = await getAllStores(conn);
      expect(Object.keys(exported)).toHaveLength(RECORD_STORES.length);
      expect(exported[STORE_NAMES.TTL_CACHE]).toBeUndefined();
      expect(exported[STORE_NAMES.PT_ID_CACHE]).toBeUndefined();
      // Nothing outside the backup whitelist may leak in, not even as an empty map.
      for (const name of Object.keys(exported)) expect(BACKUP_STORES).toContain(name);
    });
  });
});

test.describe('clearAll — full wipe', () => {
  test('empties every object store in the database, support stores included', async () => {
    await withDb(async (conn) => {
      await put(conn, STORE_NAMES.DOUBAN, 'movie::1', seedRecord());
      await put(conn, STORE_NAMES.JAV_IDS, 'javdb::SSIS-001', seedRecord());
      await rawSeed(conn, STORE_NAMES.TTL_CACHE, [{ key: 'ttl::1', value: { expiry: 1 } }]);
      await rawSeed(conn, STORE_NAMES.PT_ID_CACHE, [
        { key: 'https://pt/1', value: { ptUrl: 'https://pt/1', updatedAt: '2026-01-01' } },
      ]);
      expect((await storeNames(conn)).length).toBeGreaterThan(0);

      await clearAll(conn);

      for (const name of await storeNames(conn)) {
        expect([name, await keyCount(conn, name)]).toEqual([name, 0]);
      }
      expect(await getAllStores(conn)).toEqual(
        Object.fromEntries(RECORD_STORES.map((s) => [s, {}])),
      );
    });
  });

  test('flushes the read cache so later reads observe the emptied stores', async () => {
    await withDb(async (conn) => {
      await put(conn, STORE_NAMES.DOUBAN, 'movie::1', seedRecord());
      const cachedList = await getAll(conn, STORE_NAMES.DOUBAN);
      expect(await get(conn, STORE_NAMES.DOUBAN, 'movie::1')).not.toBeNull();
      const cachedOne = await get(conn, STORE_NAMES.DOUBAN, 'movie::1');
      expect(cachedOne).not.toBeNull();

      await clearAll(conn);

      // Without the flush these two would still serve the pre-wipe cached values.
      expect(await getAll(conn, STORE_NAMES.DOUBAN)).not.toBe(cachedList);
      expect(await getAll(conn, STORE_NAMES.DOUBAN)).toEqual([]);
      expect(await get(conn, STORE_NAMES.DOUBAN, 'movie::1')).toBeNull();
      expect(cachedOne).not.toBeNull(); // the caller's object was never mutated
    });
  });

  test('clearing an already empty database resolves and leaves the schema intact', async () => {
    await withDb(async (conn) => {
      const before = await storeNames(conn);
      await clearAll(conn);
      await clearAll(conn);
      expect(await storeNames(conn)).toEqual(before);
      expect(before).toContain(STORE_NAMES.DOUBAN);
    });
  });

  test('writes after a wipe restart the version sequence at 1', async () => {
    await withDb(async (conn) => {
      await put(conn, STORE_NAMES.DOUBAN, 'movie::1', seedRecord());
      await put(conn, STORE_NAMES.DOUBAN, 'movie::1', seedRecord());
      expect((await getAll(conn, STORE_NAMES.DOUBAN))[0]?.record.recordVersion).toBe(2);

      await clearAll(conn);
      await put(conn, STORE_NAMES.DOUBAN, 'movie::1', seedRecord());

      expect((await getAll(conn, STORE_NAMES.DOUBAN))[0]?.record.recordVersion).toBe(1);
    });
  });
});

function asRaw(value: unknown): Raw {
  return (value ?? {}) as Raw;
}
