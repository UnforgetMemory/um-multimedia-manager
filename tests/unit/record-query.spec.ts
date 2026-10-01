import { test, expect } from '@playwright/test';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { DatabaseConnection } from '@/engine/database/connection';
import { getAll, put, batchPut } from '@/engine/database/record-store';
import {
  queryPage,
  batchGet,
  count,
  getByIndex,
  getWatchedIds,
} from '@/engine/database/record-query';
import { DB_NAME, STORE_NAMES, ADULT_AV_ID_INDEX, isWatchedStatus } from '@/engine/database/schema';
import type { StoreRecord } from '@/types';

/**
 * X12-A coverage wave — record-query.ts (read-only query side of the models.ts split).
 *
 * Locks the split-owned read semantics that the facade (models.ts) delegates to:
 * which paths normalize, which write back, cursor ordering/range effects, the
 * `avId` index equivalence the v15 optimization claims, and the load-bearing
 * status-index watched scan (characterization of the OLD full scan lives in
 * get-watched-ids-characterization.spec.ts; this spec covers the rest).
 */

type Raw = Record<string, unknown>;

const DOUBAN = STORE_NAMES.DOUBAN;
const JAV = STORE_NAMES.JAV_IDS;

// Playwright reuses one worker across spec files; capture the true originals
// at import time so withDb can leave globalThis exactly as it found it.
const ORIGINAL_INDEXEDDB = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
const ORIGINAL_IDB_KEY_RANGE = Object.getOwnPropertyDescriptor(globalThis, 'IDBKeyRange');

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

function rawGet(conn: DatabaseConnection, storeName: string, key: string): Promise<Raw | null> {
  return conn.storeOp<Raw | null>(storeName, 'readonly', (store) => store.get(key));
}

/** Legacy v0 row (no schemaVersion) — the shape stored before record migration. */
function seedRaw(over: Raw = {}): Raw {
  return {
    url: 'https://movie.douban.com/subject/1/',
    status: 2,
    rating: 8,
    updatedAt: '2026-01-01T00:00:00.000Z',
    linkedIds: {},
    ...over,
  };
}

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

/** Deterministic padded key so lexicographic order equals numeric order. */
function key(i: number): string {
  return `movie::${String(i).padStart(4, '0')}`;
}

function seedRange(n: number, statusOf: (i: number) => number): Array<{ key: string; value: Raw }> {
  return Array.from({ length: n }, (_, i) => ({
    key: key(i),
    value: seedRaw({ schemaVersion: 2, status: statusOf(i), rating: i % 11 }),
  }));
}

test.describe('queryPage', () => {
  test('default page: first 50 keys in store order, total is the whole store, hasMore true', async () => {
    await withDb(async (conn) => {
      await rawSeed(
        conn,
        DOUBAN,
        seedRange(60, () => 2),
      );

      const page = await queryPage<Raw>(conn, DOUBAN);
      expect(page.items.map((v) => v.url)).toHaveLength(50);
      expect(page.total).toBe(60);
      expect(page.hasMore).toBe(true);
    });
  });

  test('limit/offset window the primary-key cursor; total stays the store count', async () => {
    await withDb(async (conn) => {
      await rawSeed(
        conn,
        DOUBAN,
        seedRange(10, () => 2),
      );

      const first = await queryPage<Raw>(conn, DOUBAN, { limit: 4 });
      const second = await queryPage<Raw>(conn, DOUBAN, { limit: 4, offset: 4 });
      const tail = await queryPage<Raw>(conn, DOUBAN, { limit: 4, offset: 8 });

      expect(first.items.map((v) => v.rating)).toEqual([0, 1, 2, 3]);
      expect(second.items.map((v) => v.rating)).toEqual([4, 5, 6, 7]);
      expect(tail.items.map((v) => v.rating)).toEqual([8, 9]);
      expect([first.total, second.total, tail.total]).toEqual([10, 10, 10]);
      expect([first.hasMore, second.hasMore, tail.hasMore]).toEqual([true, true, false]);

      // Offset past the end yields an empty page rather than throwing.
      const beyond = await queryPage<Raw>(conn, DOUBAN, { limit: 4, offset: 99 });
      expect(beyond.items).toEqual([]);
      expect(beyond.hasMore).toBe(false);
    });
  });

  test('direction prev walks the store backwards from the last key', async () => {
    await withDb(async (conn) => {
      await rawSeed(
        conn,
        DOUBAN,
        seedRange(6, () => 2),
      );

      const page = await queryPage<Raw>(conn, DOUBAN, { limit: 3, direction: 'prev' });
      expect(page.items.map((v) => v.rating)).toEqual([5, 4, 3]);

      const next = await queryPage<Raw>(conn, DOUBAN, { limit: 3, direction: 'prev', offset: 3 });
      expect(next.items.map((v) => v.rating)).toEqual([2, 1, 0]);
    });
  });

  test('index + IDBKeyRange filters before limit/offset are applied', async () => {
    await withDb(async (conn) => {
      // statuses: 0,1,2,3,0,1,2,3,0,1 → only status 2 is in range
      await rawSeed(
        conn,
        DOUBAN,
        seedRange(10, (i) => i % 4),
      );

      const watched = await queryPage<Raw>(conn, DOUBAN, {
        indexName: 'status',
        range: IDBKeyRange.only(2),
      });
      expect(watched.items.map((v) => v.status)).toEqual([2, 2]);
      // total is deliberately the STORE count, not the filtered count.
      expect(watched.total).toBe(10);
      expect(watched.hasMore).toBe(false);

      const paged = await queryPage<Raw>(conn, DOUBAN, {
        indexName: 'status',
        range: IDBKeyRange.bound(1, 2),
        limit: 3,
        offset: 1,
      });
      // Index order is (index key, primary key): 1::0001 1::0005 1::0009 2::0002 2::0006.
      expect(paged.items.map((v) => v.status)).toEqual([1, 1, 2]);
    });
  });

  test('a bare value as range behaves as an exact index match', async () => {
    await withDb(async (conn) => {
      await rawSeed(
        conn,
        DOUBAN,
        seedRange(8, (i) => i % 4),
      );
      const page = await queryPage<Raw>(conn, DOUBAN, { indexName: 'status', range: 3 });
      expect(page.items.map((v) => v.status)).toEqual([3, 3]);
    });
  });

  test('indexName without a range walks the whole index in index order', async () => {
    await withDb(async (conn) => {
      await rawSeed(
        conn,
        DOUBAN,
        seedRange(8, (i) => i % 4),
      );
      const page = await queryPage<Raw>(conn, DOUBAN, { indexName: 'status' });
      expect(page.items.map((v) => v.status)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    });
  });

  test('queryPage does NOT normalize: items are the stored rows verbatim', async () => {
    await withDb(async (conn) => {
      await rawSeed(conn, DOUBAN, [{ key: key(1), value: seedRaw() }]); // legacy v0 row
      const page = await queryPage<Raw>(conn, DOUBAN);
      expect(page.items[0]?.schemaVersion).toBeUndefined();

      // Contrast: getAll on the same store reports the migrated schema version.
      const entries = await getAll(conn, DOUBAN);
      expect(entries[0]?.record.schemaVersion).toBe(2);
    });
  });
});

test.describe('batchGet', () => {
  test('missing keys are omitted and the Map is keyed by the requested key', async () => {
    await withDb(async (conn) => {
      await rawSeed(conn, DOUBAN, [
        { key: 'movie::1', value: seedRaw({ rating: 7 }) },
        { key: 'movie::2', value: seedRaw({ rating: 6 }) },
      ]);

      const got = await batchGet<Raw>(conn, DOUBAN, ['movie::1', 'movie::absent', 'movie::2']);
      expect([...got.keys()].sort()).toEqual(['movie::1', 'movie::2']);
      expect(got.get('movie::1')?.rating).toBe(7);
      expect(got.has('movie::absent')).toBe(false);
    });
  });

  test('an empty key list yields an empty map', async () => {
    await withDb(async (conn) => {
      expect((await batchGet(conn, DOUBAN, [])).size).toBe(0);
    });
  });

  test('repeated keys collapse to a single entry', async () => {
    await withDb(async (conn) => {
      await rawSeed(conn, DOUBAN, [{ key: 'movie::1', value: seedRaw() }]);
      const got = await batchGet(conn, DOUBAN, ['movie::1', 'movie::1', 'movie::1']);
      expect(got.size).toBe(1);
    });
  });

  test('batchGet normalizes like get/getAll (no write-back from this path)', async () => {
    await withDb(async (conn) => {
      await rawSeed(conn, DOUBAN, [{ key: 'movie::1', value: seedRaw({ status: 'done' }) }]);
      const got = await batchGet<Raw>(conn, DOUBAN, ['movie::1']);
      expect(got.get('movie::1')?.schemaVersion).toBe(2);
      expect(got.get('movie::1')?.status).toBe(0); // legacy string status is dropped to 0

      const raw = await rawGet(conn, DOUBAN, 'movie::1');
      expect(raw?.schemaVersion).toBeUndefined(); // still the legacy row on disk
    });
  });

  test('an unmigratable row falls back to the raw value, like getAll', async () => {
    await withDb(async (conn) => {
      const bad: Raw = { ...seedRaw(), schemaVersion: 99, isAdmin: true };
      await rawSeed(conn, DOUBAN, [{ key: 'movie::1', value: bad }]);

      const got = await batchGet<Raw>(conn, DOUBAN, ['movie::1']);
      expect(got.get('movie::1')).toEqual(bad);
    });
  });
});

test.describe('count', () => {
  test('count equals the getAll length across mixed write paths', async () => {
    await withDb(async (conn) => {
      expect(await count(conn, DOUBAN)).toBe(0);

      await put(conn, DOUBAN, 'movie::1', seedRecord());
      await batchPut(conn, DOUBAN, [
        { key: 'movie::2', record: seedRecord() },
        { key: 'tv::3', record: seedRecord() },
      ]);
      await rawSeed(conn, DOUBAN, [{ key: 'music::4', value: seedRaw() }]);

      expect(await count(conn, DOUBAN)).toBe(4);
      expect((await getAll(conn, DOUBAN)).length).toBe(await count(conn, DOUBAN));
    });
  });

  test('counting an unknown store rejects rather than returning 0', async () => {
    await withDb(async (conn) => {
      await expect(count(conn, 'nope_records')).rejects.toBeTruthy();
    });
  });
});

test.describe('getByIndex', () => {
  test('exact index match returns every hit ordered by primary key', async () => {
    await withDb(async (conn) => {
      await rawSeed(
        conn,
        DOUBAN,
        seedRange(12, (i) => i % 3),
      );

      const hits = await getByIndex<Raw>(conn, DOUBAN, 'status', 1);
      expect(hits.map((h) => h.key)).toEqual([key(1), key(4), key(7), key(10)]);
      expect(hits.every((h) => h.record.status === 1)).toBe(true);
    });
  });

  test('a value with no index hit yields an empty array', async () => {
    await withDb(async (conn) => {
      await rawSeed(
        conn,
        DOUBAN,
        seedRange(4, () => 2),
      );
      expect(await getByIndex(conn, DOUBAN, 'status', 'never')).toEqual([]);
    });
  });

  test('records are normalized exactly like getAll', async () => {
    await withDb(async (conn) => {
      await rawSeed(conn, DOUBAN, [
        { key: 'movie::1', value: seedRaw({ status: 2 }) },
        { key: 'movie::2', value: seedRaw({ status: 'done' }) }, // string → dropped to 0
      ]);

      const hits = await getByIndex<Raw>(conn, DOUBAN, 'status', 2);
      expect(hits.map((h) => h.key)).toEqual(['movie::1']);
      expect(hits[0]?.record.schemaVersion).toBe(2);

      // Documented asymmetry: getByIndex repairs nothing (getAll is the repair path).
      expect((await rawGet(conn, DOUBAN, 'movie::2'))?.schemaVersion).toBeUndefined();
    });
  });

  test('the avId index is value-identical to the old key-suffix scan', async () => {
    await withDb(async (conn) => {
      const keys = [
        'javdb::SSIS-001',
        'mukaku::SSIS-001',
        'javdb::SSIS-002',
        'sehuatang::TID-3664524',
        'bare-no-prefix',
      ];
      for (const k of keys) await put(conn, JAV, k, seedRecord());

      // Independent oracle: the pre-v15 L2 rule — everything after the FIRST '::',
      // or the whole key when there is no separator.
      const keySuffix = (k: string): string =>
        k.includes('::') ? k.slice(k.indexOf('::') + 2) : k;

      for (const wanted of ['SSIS-001', 'SSIS-002', 'TID-3664524', 'bare-no-prefix', 'MISSING']) {
        const viaIndex = (await getByIndex(conn, JAV, ADULT_AV_ID_INDEX, wanted))
          .map((h) => h.key)
          .sort();
        const viaScan = (await getAll(conn, JAV))
          .filter((e) => keySuffix(e.key) === wanted)
          .map((e) => e.key)
          .sort();
        expect([wanted, viaIndex]).toEqual([wanted, viaScan]);
      }
    });
  });

  test('a legacy row that misses the avId index is invisible until the write side repairs it', async () => {
    await withDb(async (conn) => {
      // Pre-v15 rows have no avId field, so the index cannot see them.
      await rawSeed(conn, JAV, [{ key: 'javdb::SSIS-001', value: seedRaw() }]);
      expect(await getByIndex(conn, JAV, ADULT_AV_ID_INDEX, 'SSIS-001')).toEqual([]);

      await put(conn, JAV, 'javdb::SSIS-001', seedRecord());
      const hits = await getByIndex(conn, JAV, ADULT_AV_ID_INDEX, 'SSIS-001');
      expect(hits.map((h) => h.key)).toEqual(['javdb::SSIS-001']);
    });
  });

  test('querying a missing index rejects', async () => {
    await withDb(async (conn) => {
      await rawSeed(conn, DOUBAN, [{ key: 'movie::1', value: seedRaw() }]);
      await expect(getByIndex(conn, DOUBAN, 'nopeIndex', 2)).rejects.toBeTruthy();
    });
  });
});

test.describe('getWatchedIds', () => {
  test('returns the union of numeric 2 and legacy string done, excluding all other statuses', async () => {
    await withDb(async (conn) => {
      await rawSeed(conn, DOUBAN, [
        { key: 'movie::num2', value: seedRaw({ status: 2 }) },
        { key: 'movie::done', value: seedRaw({ status: 'done' }) },
        { key: 'movie::wish', value: seedRaw({ status: 'wish' }) },
        { key: 'movie::str2', value: seedRaw({ status: '2' }) },
        { key: 'tv::doing', value: seedRaw({ status: 3 }) },
        { key: 'tv::wishnum', value: seedRaw({ status: 1 }) },
        { key: 'music::none', value: seedRaw({ status: 0 }) },
        { key: 'game::null', value: seedRaw({ status: null }) },
        { key: 'book::missing', value: { url: 'x', updatedAt: '2026-01-01T00:00:00.000Z' } },
      ]);

      const watched = await getWatchedIds(conn, DOUBAN);
      expect([...watched].sort()).toEqual(['movie::done', 'movie::num2']);
    });
  });

  test('agrees with the getAll + isWatchedStatus reference path on the same store', async () => {
    await withDb(async (conn) => {
      const statuses: Array<number | string> = [2, 'done', 1, 3, 0, 'wish'];
      await rawSeed(
        conn,
        DOUBAN,
        seedRange(36, (i) => statuses[i % statuses.length] as number),
      );

      const watched = await getWatchedIds(conn, DOUBAN);
      const reference = (await getAll(conn, DOUBAN))
        .filter((e) => isWatchedStatus(e.record.status))
        .map((e) => e.key)
        .sort();

      // 36 rows over a 6-status cycle → 6 numeric-2 and 6 legacy 'done' rows.
      // The index scan reads the stored value, so it sees both; getAll normalizes
      // string statuses away, so the JS reference only sees the numeric ones.
      expect([...watched].sort()).toEqual(
        [0, 6, 12, 18, 24, 30, 1, 7, 13, 19, 25, 31].map((i) => key(i)).sort(),
      );
      expect(watched.size).toBe(12);
      expect(reference.length).toBe(6);
      expect(reference).toEqual([0, 6, 12, 18, 24, 30].map((i) => key(i)));
    });
  });

  test('an empty store and a fully unwatched store both yield an empty set', async () => {
    await withDb(async (conn) => {
      expect((await getWatchedIds(conn, DOUBAN)).size).toBe(0);

      await rawSeed(
        conn,
        DOUBAN,
        seedRange(5, () => 1),
      );
      expect((await getWatchedIds(conn, DOUBAN)).size).toBe(0);
    });
  });

  test('a store without a status index rejects (record stores only)', async () => {
    await withDb(async (conn) => {
      await put(conn, JAV, 'javdb::SSIS-001', seedRecord());
      await expect(getWatchedIds(conn, JAV)).rejects.toBeTruthy();
    });
  });
});
