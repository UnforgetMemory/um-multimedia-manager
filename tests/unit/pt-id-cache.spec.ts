import { test, expect } from '@playwright/test';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { DatabaseConnection } from '@/engine/database/connection';
import { getCacheEntry, getCacheEntries, putCacheEntry } from '@/engine/database/pt-id-cache';
import { DB_NAME, STORE_NAMES } from '@/engine/database/schema';
import { CURRENT_CACHE_VERSION } from '@/engine/migration/models';
import type { PtIdCacheEntry } from '@/types';

/**
 * X12-A coverage wave — pt-id-cache.ts (PT torrent URL → platform ID cache store).
 *
 * Pinned contracts: the store key is always `entry.ptUrl`, every write is stamped
 * with the current cache version (entries are overwrite-only, no version counter),
 * reads normalize + write back migrated rows, un-migratable rows fall back to the
 * raw payload, and missing URLs are simply absent from the batch result.
 */

type Raw = Record<string, unknown>;

// Playwright reuses one worker across spec files; capture the true originals
// at import time so withDb can leave globalThis exactly as it found it.
const ORIGINAL_INDEXEDDB = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
const ORIGINAL_IDB_KEY_RANGE = Object.getOwnPropertyDescriptor(globalThis, 'IDBKeyRange');

const PT = 'https://hdhome.org/details.php?id=12345';
const PT2 = 'https://pterclub.net/details.php?id=999';

function entry(over: Partial<PtIdCacheEntry> = {}): PtIdCacheEntry {
  return {
    ptUrl: PT,
    doubanId: 'movie::37332784',
    updatedAt: '2026-01-01T00:00:00.000Z',
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

function rawGet(conn: DatabaseConnection, key: string): Promise<Raw | null> {
  return conn.storeOp<Raw | null>(STORE_NAMES.PT_ID_CACHE, 'readonly', (store) => store.get(key));
}

function rawSeed(
  conn: DatabaseConnection,
  entries: Array<{ key: string; value: Raw }>,
): Promise<void> {
  return conn.ensureDB().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAMES.PT_ID_CACHE, 'readwrite');
        const store = tx.objectStore(STORE_NAMES.PT_ID_CACHE);
        for (const { key, value } of entries) store.put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

function allKeys(conn: DatabaseConnection): Promise<string[]> {
  return conn
    .storeOp<IDBValidKey[]>(STORE_NAMES.PT_ID_CACHE, 'readonly', (store) => store.getAllKeys())
    .then((keys) => keys.map(String).sort());
}

/** The write-back path is fire-and-forget; poll the raw row until it lands. */
async function untilSchema(conn: DatabaseConnection, key: string, want: number): Promise<Raw> {
  for (let i = 0; i < 100; i++) {
    const raw = await rawGet(conn, key);
    if (typeof raw?.schemaVersion === 'number' && raw.schemaVersion === want) return raw;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`cache row ${key} never reached schemaVersion ${want}`);
}

test.describe('putCacheEntry', () => {
  test('keys the row by entry.ptUrl and stamps the current cache version', async () => {
    await withDb(async (conn) => {
      await putCacheEntry(conn, entry());

      expect(await allKeys(conn)).toEqual([PT]);
      expect(await rawGet(conn, PT)).toMatchObject({
        ptUrl: PT,
        doubanId: 'movie::37332784',
        schemaVersion: CURRENT_CACHE_VERSION,
      });
    });
  });

  test('the stored key follows ptUrl, not any pre-existing key', async () => {
    await withDb(async (conn) => {
      // A row whose store key disagrees with its ptUrl is invisible to lookups
      // by ptUrl — the write side always keys by ptUrl, so this cannot happen
      // through the API, only through a hand-seeded store.
      await rawSeed(conn, [{ key: 'stale-key', value: { ...entry(), ptUrl: PT } }]);
      expect(await getCacheEntry(conn, PT)).toBeNull();
      expect(await allKeys(conn)).toEqual(['stale-key']);

      await putCacheEntry(conn, entry({ ptUrl: PT2 }));
      expect(await allKeys(conn)).toEqual([PT2, 'stale-key'].sort());
      expect((await getCacheEntry(conn, PT2))?.ptUrl).toBe(PT2);
    });
  });

  test('a second write overwrites in place and adds no version counter', async () => {
    await withDb(async (conn) => {
      await putCacheEntry(conn, entry({ doubanId: 'movie::1' }));
      await putCacheEntry(conn, entry({ doubanId: 'movie::2' }));

      const raw = await rawGet(conn, PT);
      expect(raw?.doubanId).toBe('movie::2');
      expect(raw?.recordVersion).toBeUndefined(); // cache rows are not optimistic-locked
      expect(await allKeys(conn)).toEqual([PT]);
    });
  });

  test('cache entries are not field-whitelisted, so extra fields survive the round trip', async () => {
    await withDb(async (conn) => {
      const withExtra: PtIdCacheEntry & { site: string } = { ...entry(), site: 'hdhome' };
      await putCacheEntry(conn, withExtra);

      const raw = await rawGet(conn, PT);
      expect(raw?.site).toBe('hdhome');
      expect((await getCacheEntry(conn, PT))?.ptUrl).toBe(PT);
    });
  });
});

test.describe('getCacheEntry', () => {
  test('an unknown URL resolves to null', async () => {
    await withDb(async (conn) => {
      expect(await getCacheEntry(conn, 'https://nope/1')).toBeNull();
    });
  });

  test('a legacy row is normalized and written back at the current version', async () => {
    await withDb(async (conn) => {
      await rawSeed(conn, [{ key: PT, value: { ptUrl: PT, doubanId: 'movie::1' } }]);

      const read = await getCacheEntry(conn, PT);
      expect(read?.schemaVersion).toBe(CURRENT_CACHE_VERSION);
      expect(read?.updatedAt).toBeTruthy(); // v0→v1 back-fills the timestamp

      await untilSchema(conn, PT, CURRENT_CACHE_VERSION);
    });
  });

  test('a row newer than the supported version is returned raw', async () => {
    await withDb(async (conn) => {
      const tooNew: Raw = { ...entry(), schemaVersion: CURRENT_CACHE_VERSION + 5 };
      await rawSeed(conn, [{ key: PT, value: tooNew }]);

      expect(await getCacheEntry(conn, PT)).toEqual(tooNew);
    });
  });

  test('reads are served from IndexedDB every time — this layer adds no caching', async () => {
    await withDb(async (conn) => {
      await putCacheEntry(conn, entry({ doubanId: 'movie::before' }));
      expect((await getCacheEntry(conn, PT))?.doubanId).toBe('movie::before');

      await rawSeed(conn, [{ key: PT, value: { ...entry(), doubanId: 'movie::after' } }]);
      expect((await getCacheEntry(conn, PT))?.doubanId).toBe('movie::after');
    });
  });
});

test.describe('getCacheEntries', () => {
  test('an empty request short-circuits without opening a transaction', async () => {
    await withDb(async (conn) => {
      expect(await getCacheEntries(conn, [])).toEqual({});
    });
  });

  test('found entries come back keyed by URL and missing ones are absent', async () => {
    await withDb(async (conn) => {
      await putCacheEntry(conn, entry());
      await putCacheEntry(conn, entry({ ptUrl: PT2, imdbId: 'movie::tt1375666' }));

      const got = await getCacheEntries(conn, [PT, PT2, 'https://absent/1']);
      expect(Object.keys(got).sort()).toEqual([PT, PT2].sort());
      expect(got[PT]?.doubanId).toBe('movie::37332784');
      expect(got[PT2]?.imdbId).toBe('movie::tt1375666');
    });
  });

  test('duplicate URLs collapse to one entry', async () => {
    await withDb(async (conn) => {
      await putCacheEntry(conn, entry());
      const got = await getCacheEntries(conn, [PT, PT, PT]);
      expect(Object.keys(got)).toEqual([PT]);
    });
  });

  test('legacy rows in a batch are normalized and written back', async () => {
    await withDb(async (conn) => {
      await rawSeed(conn, [
        { key: PT, value: { ptUrl: PT, doubanId: 'movie::1' } },
        { key: PT2, value: { ptUrl: PT2, imdbId: 'movie::tt2' } },
      ]);

      const got = await getCacheEntries(conn, [PT, PT2]);
      expect(got[PT]?.schemaVersion).toBe(CURRENT_CACHE_VERSION);
      expect(got[PT2]?.schemaVersion).toBe(CURRENT_CACHE_VERSION);

      await untilSchema(conn, PT, CURRENT_CACHE_VERSION);
      await untilSchema(conn, PT2, CURRENT_CACHE_VERSION);
    });
  });

  test('an unmigratable row in a batch falls back to its raw value but the batch still resolves', async () => {
    await withDb(async (conn) => {
      const tooNew: Raw = { ...entry(), schemaVersion: 99 };
      await rawSeed(conn, [
        { key: PT, value: tooNew },
        { key: PT2, value: { ...entry(), ptUrl: PT2, schemaVersion: CURRENT_CACHE_VERSION } },
      ]);

      const got = await getCacheEntries(conn, [PT, PT2]);
      expect(got[PT]).toEqual(tooNew);
      expect(got[PT2]?.schemaVersion).toBe(CURRENT_CACHE_VERSION);
    });
  });

  test('the batch never fabricates keys that were not requested', async () => {
    await withDb(async (conn) => {
      await putCacheEntry(conn, entry());
      await putCacheEntry(conn, entry({ ptUrl: PT2 }));

      const got = await getCacheEntries(conn, [PT]);
      expect(Object.keys(got)).toEqual([PT]);
    });
  });
});
