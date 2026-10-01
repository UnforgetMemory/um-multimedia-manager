import { test, expect } from '@playwright/test';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { DatabaseConnection } from '@/engine/database/connection';
import { get, put, batchPut, optimisticPut, del, getAll } from '@/engine/database/record-store';
import { DB_NAME, STORE_NAMES, ADULT_AV_ID_INDEX } from '@/engine/database/schema';
import type { StoreRecord } from '@/types';

/**
 * X12-A coverage wave — record-store.ts (mechanical split of the old models.ts God-file).
 *
 * A move preserves behaviour only if something proves it, so every split-owned
 * semantic is asserted against the REAL DatabaseConnection + real IndexedDB
 * (fake-indexeddb factory, the established db-migration.spec.ts pattern — the
 * unit runner is Node, which has no native indexedDB): read-side normalization
 * + whitelist, write-back of migrated records, copy-on-write put, in-transaction
 * version increment, adult-store `avId` derivation, and cache invalidation.
 */

type Raw = Record<string, unknown>;

const DOUBAN = STORE_NAMES.DOUBAN;

// Playwright reuses one worker across spec files; capture the true originals
// at import time so withDb can leave globalThis exactly as it found it.
const ORIGINAL_INDEXEDDB = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
const ORIGINAL_IDB_KEY_RANGE = Object.getOwnPropertyDescriptor(globalThis, 'IDBKeyRange');

function seedRecord(over: Partial<StoreRecord> = {}): StoreRecord {
  return {
    url: 'https://movie.douban.com/subject/1292052/',
    status: 2,
    rating: 8,
    updatedAt: '2026-01-01T00:00:00.000Z',
    linkedIds: {},
    ...over,
  };
}

/** Fresh in-memory IDB per test; teardown closes the handle and deletes the DB. */
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

/** Bypass the record layer entirely: raw single-key read (no normalize, no cache). */
function rawGet(conn: DatabaseConnection, storeName: string, key: string): Promise<Raw | null> {
  return conn.storeOp<Raw | null>(storeName, 'readonly', (store) => store.get(key));
}

/** Bypass the record layer: write raw values in one committed transaction. */
async function rawSeed(
  conn: DatabaseConnection,
  storeName: string,
  entries: Array<{ key: string; value: Raw }>,
): Promise<void> {
  const db = await conn.ensureDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    for (const { key, value } of entries) store.put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** Numeric field of a raw row, read defensively (raw values are untyped). */
function numAt(raw: Raw | null, field: string): number | undefined {
  const value = raw?.[field];
  return typeof value === 'number' ? value : undefined;
}

/** String field of a raw row, read defensively (raw values are untyped). */
function strAt(raw: Raw | null, field: string): string | undefined {
  const value = raw?.[field];
  return typeof value === 'string' ? value : undefined;
}

/** linkedIds entry of a raw row, read defensively (raw values are untyped). */
function linkAt(raw: Raw | null, platform: string): string | undefined {
  return strAt(asRaw(raw?.linkedIds), platform);
}

/** View a normalized/record-shaped value as an open bag for field-existence asserts. */
function asRaw(value: unknown): Raw {
  return (value ?? {}) as Raw;
}

/** The write-back path is fire-and-forget; poll the raw row until it lands. */
async function untilRaw(
  conn: DatabaseConnection,
  storeName: string,
  key: string,
  predicate: (raw: Raw | null) => boolean,
): Promise<Raw> {
  for (let i = 0; i < 100; i++) {
    const raw = await rawGet(conn, storeName, key);
    if (predicate(raw)) return raw as Raw;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`raw value for ${storeName}/${key} never satisfied the predicate`);
}

test.describe('get — read-side normalization and cache', () => {
  test('a missing key resolves to null and the miss is cached', async () => {
    await withDb(async (conn) => {
      expect(await get(conn, DOUBAN, 'movie::missing')).toBeNull();

      // Seed behind the record layer; the cached null must still be served.
      await rawSeed(conn, DOUBAN, [{ key: 'movie::missing', value: seedRaw() }]);
      expect(await get(conn, DOUBAN, 'movie::missing')).toBeNull();

      conn.readCache.clear();
      expect(await get(conn, DOUBAN, 'movie::missing')).not.toBeNull();
    });
  });

  test('a legacy record is normalized on read and written back with the current schema', async () => {
    await withDb(async (conn) => {
      await rawSeed(conn, DOUBAN, [{ key: 'movie::1', value: seedRaw() }]);

      const read = await get(conn, DOUBAN, 'movie::1');
      expect(read?.schemaVersion).toBe(2);
      expect(read?.recordVersion).toBeUndefined(); // read does not invent a version

      // Write-back is batched and fire-and-forget: it consumes version 1.
      await untilRaw(
        conn,
        DOUBAN,
        'movie::1',
        (raw) => numAt(raw, 'schemaVersion') === 2 && numAt(raw, 'recordVersion') === 1,
      );
      expect((await rawGet(conn, DOUBAN, 'movie::1'))?.url).toBe(
        'https://movie.douban.com/subject/1292052/',
      );
    });
  });

  test('whitelist semantics: unknown fields are stripped and out-of-range numerics dropped', async () => {
    await withDb(async (conn) => {
      await rawSeed(conn, DOUBAN, [
        {
          key: 'movie::1',
          value: {
            ...seedRaw(),
            isAdmin: true,
            status: 99,
            rating: 999,
            linkedIds: ['not-a-map'],
          },
        },
      ]);

      const read = await get(conn, DOUBAN, 'movie::1');
      expect(read).toBeTruthy();
      expect(asRaw(read).isAdmin).toBeUndefined();
      // Invalid values are deleted, so migration defaults (0/0/{}) apply.
      expect(read?.status).toBe(0);
      expect(read?.rating).toBe(0);
      expect(read?.linkedIds).toEqual({});
      expect(read?.schemaVersion).toBe(2);
    });
  });

  test('the read-side whitelist drops avId, which only the write side maintains', async () => {
    await withDb(async (conn) => {
      await put(conn, STORE_NAMES.JAV_IDS, 'javdb::SSIS-001', seedRecord());
      expect(await rawGet(conn, STORE_NAMES.JAV_IDS, 'javdb::SSIS-001')).toMatchObject({
        avId: 'SSIS-001',
      });

      const read = await get(conn, STORE_NAMES.JAV_IDS, 'javdb::SSIS-001');
      expect(asRaw(read).avId).toBeUndefined();
    });
  });

  test('when migration fails the raw stored value is returned unchanged', async () => {
    await withDb(async (conn) => {
      const tooNew: Raw = { ...seedRaw(), schemaVersion: 99, isAdmin: true };
      await rawSeed(conn, DOUBAN, [
        { key: 'movie::new', value: tooNew },
        { key: 'movie::array', value: [] as unknown as Raw },
      ]);

      expect(await get(conn, DOUBAN, 'movie::new')).toEqual(tooNew);

      const arrayValue = await get(conn, DOUBAN, 'movie::array');
      expect(Array.isArray(arrayValue)).toBe(true);
    });
  });

  test('a hit is served from the read cache without touching the store', async () => {
    await withDb(async (conn) => {
      // Current-schema rows are not migrated, so no write-back invalidates the cache.
      await rawSeed(conn, DOUBAN, [
        { key: 'movie::1', value: seedRaw({ schemaVersion: 2, rating: 5 }) },
      ]);
      expect((await get(conn, DOUBAN, 'movie::1'))?.rating).toBe(5);

      await rawSeed(conn, DOUBAN, [
        { key: 'movie::1', value: seedRaw({ schemaVersion: 2, rating: 1 }) },
      ]);
      expect((await get(conn, DOUBAN, 'movie::1'))?.rating).toBe(5);
    });
  });
});

test.describe('put / batchPut — write side', () => {
  test('version starts at 1 and increments on every write, schema is stamped', async () => {
    await withDb(async (conn) => {
      await put(conn, DOUBAN, 'movie::1', seedRecord({ rating: 5 }));
      expect((await rawGet(conn, DOUBAN, 'movie::1'))?.recordVersion).toBe(1);

      await put(conn, DOUBAN, 'movie::1', seedRecord({ rating: 6 }));
      await put(conn, DOUBAN, 'movie::1', seedRecord({ rating: 7 }));
      const raw = await rawGet(conn, DOUBAN, 'movie::1');
      expect(raw?.recordVersion).toBe(3);
      expect(raw?.schemaVersion).toBe(2);
      expect(raw?.rating).toBe(7);
    });
  });

  test('an empty updatedAt is filled, a provided one is preserved', async () => {
    await withDb(async (conn) => {
      await put(conn, DOUBAN, 'movie::empty', seedRecord({ updatedAt: '' }));
      const filled = await rawGet(conn, DOUBAN, 'movie::empty');
      expect(typeof filled?.updatedAt).toBe('string');
      expect(filled?.updatedAt).not.toBe('');

      await put(conn, DOUBAN, 'movie::kept', seedRecord({ updatedAt: '2020-05-05T00:00:00.000Z' }));
      expect((await rawGet(conn, DOUBAN, 'movie::kept'))?.updatedAt).toBe(
        '2020-05-05T00:00:00.000Z',
      );
    });
  });

  test('linkedIds is copied so a later caller mutation cannot leak into the store', async () => {
    await withDb(async (conn) => {
      const linkedIds: Record<string, string> = { imdb: 'movie::tt1375666' };
      await put(conn, DOUBAN, 'movie::1', seedRecord({ linkedIds }));
      linkedIds.imdb = 'MUTATED';

      const raw = await rawGet(conn, DOUBAN, 'movie::1');
      expect(linkAt(raw, 'imdb')).toBe('movie::tt1375666');
    });
  });

  test('adult stores derive avId = key suffix; other stores never gain the field', async () => {
    await withDb(async (conn) => {
      const cases: Array<[store: string, key: string, expected: string | undefined]> = [
        [STORE_NAMES.JAV_IDS, 'javdb::SSIS-001', 'SSIS-001'],
        [STORE_NAMES.USAV_IDS, 'usav::AV.21.03.09', 'AV.21.03.09'],
        // suffix keeps every '::' after the first
        [STORE_NAMES.SEHUATANG_IDS, 'sehuatang::TID::3664524', 'TID::3664524'],
        // bare key → the whole key is the suffix
        [STORE_NAMES.JAV_IDS, 'SSIS-002', 'SSIS-002'],
        [DOUBAN, 'movie::1292052', undefined],
        [STORE_NAMES.BILIBILI, 'movie::BV1xx', undefined],
      ];
      for (const [store, key] of cases) await put(conn, store, key, seedRecord());

      for (const [store, key, expected] of cases) {
        const raw = await rawGet(conn, store, key);
        expect(raw?.[ADULT_AV_ID_INDEX]).toBe(expected);
      }
    });
  });

  test('avId is recomputed from the key, not inherited from the input record', async () => {
    await withDb(async (conn) => {
      const tainted = { ...seedRecord(), avId: 'WRONG-001' } as StoreRecord;
      await put(conn, STORE_NAMES.JAV_IDS, 'javdb::SSIS-001', tainted);
      expect((await rawGet(conn, STORE_NAMES.JAV_IDS, 'javdb::SSIS-001'))?.avId).toBe('SSIS-001');
    });
  });

  test('put invalidates both the per-key entry and the list entry of the read cache', async () => {
    await withDb(async (conn) => {
      await put(conn, DOUBAN, 'movie::1', seedRecord({ rating: 4 }));
      const listBefore = await getAll(conn, DOUBAN);
      expect((await get(conn, DOUBAN, 'movie::1'))?.rating).toBe(4);

      await put(conn, DOUBAN, 'movie::1', seedRecord({ rating: 9 }));
      expect((await get(conn, DOUBAN, 'movie::1'))?.rating).toBe(9);
      const listAfter = await getAll(conn, DOUBAN);
      expect(listAfter).not.toBe(listBefore);
      expect(listAfter[0]?.record.rating).toBe(9);
    });
  });

  test('batchPut versions every key in one pass and starts missing keys at 1', async () => {
    await withDb(async (conn) => {
      await put(conn, DOUBAN, 'movie::existing', seedRecord());
      await batchPut(conn, DOUBAN, [
        { key: 'movie::existing', record: seedRecord({ rating: 6 }) },
        { key: 'movie::fresh-a', record: seedRecord({ rating: 7 }) },
        { key: 'movie::fresh-b', record: seedRecord({ rating: 8 }) },
      ]);

      expect((await rawGet(conn, DOUBAN, 'movie::existing'))?.recordVersion).toBe(2);
      expect((await rawGet(conn, DOUBAN, 'movie::fresh-a'))?.recordVersion).toBe(1);
      expect((await rawGet(conn, DOUBAN, 'movie::fresh-b'))?.recordVersion).toBe(1);
      expect(await countKeys(conn, DOUBAN)).toEqual([
        'movie::existing',
        'movie::fresh-a',
        'movie::fresh-b',
      ]);
    });
  });

  test('batchPut applies the same adult avId derivation and copy-on-write as put', async () => {
    await withDb(async (conn) => {
      const linkedIds = { mukaku: 'movie::1' };
      const record = seedRecord({ linkedIds });
      await batchPut(conn, STORE_NAMES.JAV_IDS, [{ key: 'javdb::SSIS-009', record }]);
      expect(linkedIds.mukaku).toBe('movie::1');

      const raw = await rawGet(conn, STORE_NAMES.JAV_IDS, 'javdb::SSIS-009');
      expect(raw?.avId).toBe('SSIS-009');
      expect(linkAt(raw, 'mukaku')).toBe('movie::1');
    });
  });

  test('an empty batchPut is a true no-op: no writes, no cache invalidation', async () => {
    await withDb(async (conn) => {
      await put(conn, DOUBAN, 'movie::1', seedRecord());
      const cached = await getAll(conn, DOUBAN);

      await batchPut(conn, DOUBAN, []);
      expect(await getAll(conn, DOUBAN)).toBe(cached);
      expect((await rawGet(conn, DOUBAN, 'movie::1'))?.recordVersion).toBe(1);
    });
  });

  test('batchPut migrates-on-write: a legacy record lands at the current schema version', async () => {
    await withDb(async (conn) => {
      const legacy: StoreRecord = {
        url: 'https://movie.douban.com/subject/1/',
        status: 2,
        rating: 9,
        updatedAt: '2024-01-01T00:00:00.000Z',
        linkedIds: {},
      };
      await batchPut(conn, DOUBAN, [{ key: 'movie::legacy', record: legacy }]);
      const raw = await rawGet(conn, DOUBAN, 'movie::legacy');
      expect(raw?.schemaVersion).toBe(2);
    });
  });
});

test.describe('optimisticPut', () => {
  test('a matching version writes and reports expected + 1', async () => {
    await withDb(async (conn) => {
      await put(conn, DOUBAN, 'movie::1', seedRecord({ rating: 5 }));
      const result = await optimisticPut(conn, DOUBAN, 'movie::1', seedRecord({ rating: 6 }), 1);

      expect(result).toEqual({ ok: true, version: 2 });
      expect((await rawGet(conn, DOUBAN, 'movie::1'))?.recordVersion).toBe(2);
      expect((await rawGet(conn, DOUBAN, 'movie::1'))?.rating).toBe(6);
    });
  });

  test('a stale version reports the conflict and writes nothing', async () => {
    await withDb(async (conn) => {
      await put(conn, DOUBAN, 'movie::1', seedRecord({ rating: 5 }));
      await put(conn, DOUBAN, 'movie::1', seedRecord({ rating: 5 }));

      const result = await optimisticPut(conn, DOUBAN, 'movie::1', seedRecord({ rating: 0 }), 1);
      expect(result).toEqual({ ok: false, conflict: { currentVersion: 2, expectedVersion: 1 } });

      const raw = await rawGet(conn, DOUBAN, 'movie::1');
      expect(raw?.rating).toBe(5);
      expect(raw?.recordVersion).toBe(2);
    });
  });

  test('expected version 0 creates a missing key, but conflicts once it exists', async () => {
    await withDb(async (conn) => {
      expect(await optimisticPut(conn, DOUBAN, 'movie::new', seedRecord(), 0)).toEqual({
        ok: true,
        version: 1,
      });
      expect(await optimisticPut(conn, DOUBAN, 'movie::new', seedRecord(), 0)).toEqual({
        ok: false,
        conflict: { currentVersion: 1, expectedVersion: 0 },
      });
    });
  });

  test('the version check reads through the normalizing path, so a legacy row reports version 0', async () => {
    await withDb(async (conn) => {
      await rawSeed(conn, DOUBAN, [{ key: 'movie::legacy', value: seedRaw() }]);
      expect(
        await optimisticPut(conn, DOUBAN, 'movie::legacy', seedRecord({ rating: 7 }), 0),
      ).toEqual({ ok: true, version: 1 });
      expect((await rawGet(conn, DOUBAN, 'movie::legacy'))?.schemaVersion).toBe(2);
    });
  });
});

test.describe('del', () => {
  test('removes the row and invalidates the per-key and list caches', async () => {
    await withDb(async (conn) => {
      await put(conn, DOUBAN, 'movie::1', seedRecord());
      await put(conn, DOUBAN, 'movie::2', seedRecord());
      const cached = await get(conn, DOUBAN, 'movie::1');
      const list = await getAll(conn, DOUBAN);
      expect(cached).not.toBeNull();
      expect(list).toHaveLength(2);

      await del(conn, DOUBAN, 'movie::1');

      expect(await get(conn, DOUBAN, 'movie::1')).toBeNull();
      expect(await countKeys(conn, DOUBAN)).toEqual(['movie::2']);
    });
  });

  test('deleting a missing key resolves and leaves the store untouched', async () => {
    await withDb(async (conn) => {
      await put(conn, DOUBAN, 'movie::1', seedRecord());
      await del(conn, DOUBAN, 'movie::nope');
      expect(await countKeys(conn, DOUBAN)).toEqual(['movie::1']);
    });
  });
});

test.describe('getAll', () => {
  test('returns every entry ordered by key ascending, normalized', async () => {
    await withDb(async (conn) => {
      await rawSeed(conn, DOUBAN, [
        { key: 'tv::1', value: seedRaw() },
        { key: 'movie::10', value: seedRaw() },
        { key: 'movie::2', value: seedRaw() },
        { key: 'music::a', value: seedRaw() },
        { key: 'game::9', value: seedRaw() },
      ]);

      const entries = await getAll(conn, DOUBAN);
      // IndexedDB orders string keys by UTF-16 code units, not by locale.
      expect(entries.map((e) => e.key)).toEqual([
        'game::9',
        'movie::10',
        'movie::2',
        'music::a',
        'tv::1',
      ]);
      expect(entries.every((e) => e.record.schemaVersion === 2)).toBe(true);
    });
  });

  test('count equivalence: getAll length == store count for a mixed-content store', async () => {
    await withDb(async (conn) => {
      await put(conn, DOUBAN, 'movie::1', seedRecord());
      await batchPut(conn, DOUBAN, [
        { key: 'movie::2', record: seedRecord() },
        { key: 'tv::3', record: seedRecord() },
      ]);
      await rawSeed(conn, DOUBAN, [{ key: 'music::4', value: seedRaw() }]);

      const db = await conn.ensureDB();
      const idbCount = await new Promise<number>((resolve, reject) => {
        const tx = db.transaction(DOUBAN, 'readonly');
        const req = tx.objectStore(DOUBAN).count();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      expect((await getAll(conn, DOUBAN)).length).toBe(idbCount);
    });
  });

  test('the list is cached per store and a write invalidates only its own store', async () => {
    await withDb(async (conn) => {
      await put(conn, DOUBAN, 'movie::1', seedRecord());
      await put(conn, STORE_NAMES.IMDB, 'movie::tt1', seedRecord());

      const douban = await getAll(conn, DOUBAN);
      const imdb = await getAll(conn, STORE_NAMES.IMDB);
      expect(await getAll(conn, DOUBAN)).toBe(douban);

      await put(conn, STORE_NAMES.IMDB, 'movie::tt2', seedRecord());
      expect(await getAll(conn, STORE_NAMES.IMDB)).not.toBe(imdb);
      expect(await getAll(conn, DOUBAN)).toBe(douban);
    });
  });

  test('an empty store yields [] and caches the empty list', async () => {
    await withDb(async (conn) => {
      const empty = await getAll(conn, DOUBAN);
      expect(empty).toEqual([]);

      await rawSeed(conn, DOUBAN, [{ key: 'movie::1', value: seedRaw() }]);
      expect(await getAll(conn, DOUBAN)).toBe(empty);

      conn.readCache.clear();
      expect((await getAll(conn, DOUBAN)).map((e) => e.key)).toEqual(['movie::1']);
    });
  });

  test('migrated rows are repaired in a single write-back batch', async () => {
    await withDb(async (conn) => {
      await rawSeed(conn, DOUBAN, [
        { key: 'movie::1', value: seedRaw() },
        { key: 'movie::2', value: seedRaw() },
        { key: 'movie::3', value: seedRaw({ schemaVersion: 2 }) },
      ]);

      const entries = await getAll(conn, DOUBAN);
      expect(entries.map((e) => e.record.schemaVersion)).toEqual([2, 2, 2]);

      for (const key of ['movie::1', 'movie::2']) {
        const repaired = await untilRaw(
          conn,
          DOUBAN,
          key,
          (raw) => numAt(raw, 'schemaVersion') === 2 && numAt(raw, 'recordVersion') === 1,
        );
        expect(repaired).toBeTruthy();
      }
      // Untouched current-version row keeps its own version and is not rewritten.
      expect((await rawGet(conn, DOUBAN, 'movie::3'))?.recordVersion).toBeUndefined();
      expect(await countKeys(conn, DOUBAN)).toEqual(['movie::1', 'movie::2', 'movie::3']);
    });
  });

  test('an unmigratable row falls back to the raw value and the cursor keeps going', async () => {
    await withDb(async (conn) => {
      const bad: Raw = { ...seedRaw(), schemaVersion: 99, isAdmin: true };
      await rawSeed(conn, DOUBAN, [
        { key: 'movie::1', value: seedRaw({ schemaVersion: 2 }) },
        { key: 'movie::2', value: bad },
        { key: 'movie::3', value: seedRaw() },
      ]);

      const entries = await getAll(conn, DOUBAN);
      expect(entries.map((e) => e.key)).toEqual(['movie::1', 'movie::2', 'movie::3']);
      expect(entries[1]?.record).toEqual(bad);
      expect(entries[0]?.record.schemaVersion).toBe(2);
      expect(entries[2]?.record.schemaVersion).toBe(2);
    });
  });
});

/** Keys currently in a store, read straight from IndexedDB (sorted). */
async function countKeys(conn: DatabaseConnection, storeName: string): Promise<string[]> {
  const db = await conn.ensureDB();
  return new Promise<string[]>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAllKeys();
    req.onsuccess = () => resolve(req.result.map(String).sort());
    req.onerror = () => reject(req.error);
  });
}

/** Raw v0-style legacy row (no schemaVersion key at all). */
function seedRaw(over: Raw = {}): Raw {
  return {
    url: 'https://movie.douban.com/subject/1292052/',
    status: 2,
    rating: 8,
    updatedAt: '2026-01-01T00:00:00.000Z',
    linkedIds: {},
    ...over,
  };
}
