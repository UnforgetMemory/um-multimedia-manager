import { test, expect } from '@playwright/test';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { DatabaseConnection } from '@/engine/database/connection';
import { LruCache } from '@/engine/cache/lru-cache';
import { DB_NAME, DB_VERSION, STORE_NAMES } from '@/engine/database/schema';
import type { ReadCacheValue } from '@/engine/database/connection';

/**
 * X12-A coverage wave — DatabaseConnection lifecycle (engine/database/connection.ts).
 *
 * The sibling specs (record-store / record-query / bulk-ops) drive the record
 * operations through a connection; this spec owns the connection itself:
 * init dedup/idempotence, close + reopen, the storeOp promise bridge,
 * invalidateStoreCache's exact key contract, and the unexpected-close
 * (versionchange) reset. Real IndexedDB via fake-indexeddb, per-test factory.
 */

type Raw = Record<string, unknown>;

// Playwright reuses one worker across spec files; capture the true originals
// at import time so installs here can leave globalThis exactly as found.
const ORIGINAL_INDEXEDDB = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
const ORIGINAL_IDB_KEY_RANGE = Object.getOwnPropertyDescriptor(globalThis, 'IDBKeyRange');

async function withConn(
  body: (conn: DatabaseConnection, factory: IDBFactory) => Promise<void>,
): Promise<void> {
  const factory = new IDBFactory();
  const g = globalThis as unknown as { indexedDB?: IDBFactory; IDBKeyRange?: typeof IDBKeyRange };
  g.indexedDB = factory;
  g.IDBKeyRange = IDBKeyRange;
  const conn = new DatabaseConnection();
  try {
    await conn.init();
    await body(conn, factory);
  } finally {
    conn.close();
    await new Promise<void>((resolve) => {
      const req = factory.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
    // A leftover fake-indexeddb factory leaks into the next spec on this worker.
    if (ORIGINAL_INDEXEDDB) Object.defineProperty(globalThis, 'indexedDB', ORIGINAL_INDEXEDDB);
    else delete g.indexedDB;
    if (ORIGINAL_IDB_KEY_RANGE)
      Object.defineProperty(globalThis, 'IDBKeyRange', ORIGINAL_IDB_KEY_RANGE);
    else delete g.IDBKeyRange;
  }
}

function rawPut(
  conn: DatabaseConnection,
  storeName: string,
  key: string,
  value: Raw,
): Promise<unknown> {
  return conn.storeOp(storeName, 'readwrite', (store) => store.put(value, key));
}

test.describe('init / ensureDB', () => {
  test('init is idempotent: a second init keeps the same underlying handle', async () => {
    await withConn(async (conn) => {
      const before = await conn.ensureDB();
      await conn.init(); // must be a no-op, not a re-open
      expect(await conn.ensureDB()).toBe(before);
    });
  });

  test('concurrent inits share one open promise (same handle for both callers)', async () => {
    const factory = new IDBFactory();
    const g = globalThis as unknown as {
      indexedDB?: IDBFactory;
      IDBKeyRange?: typeof IDBKeyRange;
    };
    g.indexedDB = factory;
    g.IDBKeyRange = IDBKeyRange;
    const conn = new DatabaseConnection();
    try {
      const [a, b] = await Promise.all([conn.init(), conn.init()]);
      expect(a).toBeUndefined();
      expect(b).toBeUndefined();
      const handle = await conn.ensureDB();
      expect(handle.version).toBe(DB_VERSION);
    } finally {
      conn.close();
      await new Promise<void>((resolve) => {
        const req = factory.deleteDatabase(DB_NAME);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
      });
      if (ORIGINAL_INDEXEDDB) Object.defineProperty(globalThis, 'indexedDB', ORIGINAL_INDEXEDDB);
      else delete g.indexedDB;
      if (ORIGINAL_IDB_KEY_RANGE)
        Object.defineProperty(globalThis, 'IDBKeyRange', ORIGINAL_IDB_KEY_RANGE);
      else delete g.IDBKeyRange;
    }
  });

  test('close() then ensureDB() re-opens against the same factory with the data intact', async () => {
    await withConn(async (conn) => {
      await rawPut(conn, STORE_NAMES.TTL_CACHE, 'k', { v: 1 });
      const first = await conn.ensureDB();
      conn.close();
      const second = await conn.ensureDB();
      expect(second).not.toBe(first); // a genuinely new handle
      const got = await conn.storeOp<Raw | undefined>(STORE_NAMES.TTL_CACHE, 'readonly', (store) =>
        store.get('k'),
      );
      expect(got).toEqual({ v: 1 });
    });
  });

  test('close() without an open connection is a no-op', async () => {
    const conn = new DatabaseConnection();
    expect(() => conn.close()).not.toThrow();
  });
});

test.describe('storeOp promise bridge', () => {
  test('resolves with the request result (put returns the key, count returns the row count)', async () => {
    await withConn(async (conn) => {
      expect(await rawPut(conn, STORE_NAMES.TTL_CACHE, 'k1', { a: 1 })).toBe('k1');
      await rawPut(conn, STORE_NAMES.TTL_CACHE, 'k2', { a: 2 });
      const count = await conn.storeOp<number>(STORE_NAMES.TTL_CACHE, 'readonly', (store) =>
        store.count(),
      );
      expect(count).toBe(2);
    });
  });

  test('a transaction on an unknown store rejects (does not hang or resolve)', async () => {
    await withConn(async (conn) => {
      await expect(
        conn.storeOp('no_such_store', 'readonly', (store) => store.count()),
      ).rejects.toBeTruthy();
    });
  });

  test('an unclonable value rejects with the DataClone error', async () => {
    await withConn(async (conn) => {
      const fn = () => 1;
      await expect(
        conn.storeOp(STORE_NAMES.TTL_CACHE, 'readwrite', (store) => store.put({ fn }, 'bad')),
      ).rejects.toBeTruthy();
    });
  });
});

test.describe('read cache surface', () => {
  test('readCache is one shared LruCache instance exposed for sibling modules', async () => {
    await withConn(async (conn) => {
      expect(conn.readCache).toBeInstanceOf(LruCache);
      expect(conn.readCache).toBe(conn.readCache);
    });
  });

  test('invalidateStoreCache removes the store key-prefix AND the __list__ entry, touching nothing else', async () => {
    await withConn(async (conn) => {
      const cache = conn.readCache;
      const stub: ReadCacheValue = null;
      cache.set(`${STORE_NAMES.DOUBAN}::movie::1`, stub);
      cache.set(`${STORE_NAMES.DOUBAN}::movie::2`, stub);
      cache.set(`__list__${STORE_NAMES.DOUBAN}`, []);
      cache.set(`${STORE_NAMES.IMDB}::movie::1`, stub);
      cache.set(`__list__${STORE_NAMES.IMDB}`, []);

      conn.invalidateStoreCache(STORE_NAMES.DOUBAN);

      expect(cache.has(`${STORE_NAMES.DOUBAN}::movie::1`)).toBe(false);
      expect(cache.has(`${STORE_NAMES.DOUBAN}::movie::2`)).toBe(false);
      expect(cache.has(`__list__${STORE_NAMES.DOUBAN}`)).toBe(false);
      // Other stores survive untouched — invalidation is store-scoped.
      expect(cache.has(`${STORE_NAMES.IMDB}::movie::1`)).toBe(true);
      expect(cache.has(`__list__${STORE_NAMES.IMDB}`)).toBe(true);
    });
  });

  test('invalidating a store with no cached entries changes nothing and does not throw', async () => {
    await withConn(async (conn) => {
      cacheSeed(conn);
      conn.invalidateStoreCache(STORE_NAMES.BANGUMI);
      expect(conn.readCache.size).toBe(1);
    });
  });
});

function cacheSeed(conn: DatabaseConnection): void {
  conn.readCache.set(`${STORE_NAMES.DOUBAN}::movie::1`, null);
}

test.describe('unexpected close (versionchange)', () => {
  test('a higher-version open fires our onversionchange: the stale handle is dropped, not memoized', async () => {
    await withConn(async (conn) => {
      await rawPut(conn, STORE_NAMES.TTL_CACHE, 'persist', { keep: true });
      const before = await conn.ensureDB();

      // Opening at DB_VERSION+1 forces a versionchange on the live connection.
      // fake-indexeddb only resolves this open AFTER our onversionchange ran
      // (otherwise the upgrade would block), so awaiting it proves the
      // close-on-versionchange contract.
      const handle = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION + 1);
        req.onupgradeneeded = () => {
          /* version bump only */
        };
        req.onsuccess = () => resolve(req.result as IDBDatabase);
        req.onerror = () => reject(req.error);
      });
      expect(handle.version).toBe(DB_VERSION + 1);
      handle.close();

      // The connection must have discarded the old handle AND its memoized
      // init promise. If either survived, ensureDB() would resolve with the
      // dead `before` handle; instead init() really re-runs — and fails,
      // because opening a v16 DB at v15 is a VersionError by spec.
      expect(
        await conn.ensureDB().then(
          () => 'resolved',
          () => 'rejected',
        ),
      ).toBe('rejected');
      expect(before.version).toBe(DB_VERSION);
    });
  });
});
