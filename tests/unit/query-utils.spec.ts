import { test, expect } from '@playwright/test';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { queryPage, batchGet } from '@/engine/database/query-utils';
import type { PageQueryOptions } from '@/engine/database/query-utils';

/**
 * X12-A coverage wave — query-utils.ts (store-level cursor primitives).
 *
 * These functions take an IDBObjectStore directly, so they are exercised against
 * a hand-rolled single-store database instead of the production schema: the
 * cursor maths (advance-based offset, limit short-circuit, direction, index
 * ordering) and the batchGet normalization contract are all that is under test.
 *
 * Every query opens its own transaction: an IDBObjectStore cannot serve new
 * requests once its transaction has completed.
 */

const DB_NAME = 'query-utils-test';
const STORE = 'items';

// Playwright reuses one worker across spec files; capture the true originals
// at import time so withDb can leave globalThis exactly as it found it.
const ORIGINAL_INDEXEDDB = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
const ORIGINAL_IDB_KEY_RANGE = Object.getOwnPropertyDescriptor(globalThis, 'IDBKeyRange');

interface Row {
  name: string;
  status: number | string;
  updatedAt: string;
  [extra: string]: unknown;
}

function storeOf(db: IDBDatabase): IDBObjectStore {
  return db.transaction(STORE, 'readonly').objectStore(STORE);
}

function seed(
  db: IDBDatabase,
  entries: Array<{ key: IDBValidKey; value: unknown }>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    for (const { key, value } of entries) store.put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** Read with a fresh readonly transaction, bypassing the utilities. */
function readRaw(db: IDBDatabase, key: IDBValidKey): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Fresh in-memory DB per test with one store + the two secondary indexes used below. */
async function withDb(run: (db: IDBDatabase) => Promise<void>): Promise<void> {
  const factory = new IDBFactory();
  const g = globalThis as unknown as { indexedDB?: IDBFactory; IDBKeyRange?: typeof IDBKeyRange };
  g.indexedDB = factory;
  g.IDBKeyRange = IDBKeyRange;

  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = factory.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const opened = req.result;
      const store = opened.createObjectStore(STORE);
      store.createIndex('status', 'status', { unique: false });
      store.createIndex('updatedAt', 'updatedAt', { unique: false });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  try {
    await run(db);
  } finally {
    db.close();
    await new Promise<void>((resolve) => {
      const req = factory.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
    // Release the installed globals, not just the handle: a leftover
    // fake-indexeddb factory leaks into the next spec on this worker.
    if (ORIGINAL_INDEXEDDB) Object.defineProperty(globalThis, 'indexedDB', ORIGINAL_INDEXEDDB);
    else delete g.indexedDB;
    if (ORIGINAL_IDB_KEY_RANGE)
      Object.defineProperty(globalThis, 'IDBKeyRange', ORIGINAL_IDB_KEY_RANGE);
    else delete g.IDBKeyRange;
  }
}

function row(name: string, over: Partial<Row> = {}): Row {
  return { name, status: 2, updatedAt: '2026-01-01T00:00:00.000Z', ...over };
}

/** 26 rows keyed 'a'..'z' in insertion order; status cycles 0..3 by index. */
function alphabetRows(): Array<{ key: string; value: Row }> {
  return Array.from({ length: 26 }, (_, i) => {
    const letter = String.fromCharCode(97 + i);
    return { key: letter, value: row(`row-${letter}`, { status: i % 4, order: i }) };
  });
}
const ALL_NAMES = alphabetRows().map((e) => e.value.name);

test.describe('queryPage — limit / offset / hasMore', () => {
  test('no options: default limit 50 covers a small store in full, no more pages', async () => {
    await withDb(async (db) => {
      await seed(db, alphabetRows());
      const page = await queryPage<Row>(storeOf(db));
      expect(page.items.map((v) => v.name)).toEqual(ALL_NAMES);
      expect(page.total).toBe(26);
      expect(page.hasMore).toBe(false);
    });
  });

  test('hasMore is exactly "page filled", so a full final page reports a false positive', async () => {
    await withDb(async (db) => {
      await seed(db, alphabetRows());
      const opts: PageQueryOptions = { limit: 13 };

      const first = await queryPage<Row>(storeOf(db), opts);
      expect(first.items.map((v) => v.name)).toEqual(ALL_NAMES.slice(0, 13));
      expect(first.hasMore).toBe(true);

      // 26 rows / limit 13 → the second page is also full and also claims
      // "hasMore" although nothing follows it. Callers must probe, not trust.
      const second = await queryPage<Row>(storeOf(db), { limit: 13, offset: 13 });
      expect(second.items.map((v) => v.name)).toEqual(ALL_NAMES.slice(13));
      expect(second.hasMore).toBe(true);

      const third = await queryPage<Row>(storeOf(db), { limit: 13, offset: 26 });
      expect(third.items).toEqual([]);
      expect(third.hasMore).toBe(false);
    });
  });

  test('limit 0 still emits one row (the short-circuit runs after the push)', async () => {
    await withDb(async (db) => {
      await seed(db, alphabetRows());
      const page = await queryPage<Row>(storeOf(db), { limit: 0 });
      expect(page.items.map((v) => v.name)).toEqual(['row-a']);
      expect(page.hasMore).toBe(false); // items.length(1) === limit(0) is false
    });
  });

  test('offset is consumed with cursor.advance and works past the end in either direction', async () => {
    await withDb(async (db) => {
      await seed(db, alphabetRows());

      expect(
        (await queryPage<Row>(storeOf(db), { limit: 3, offset: 23 })).items.map((v) => v.name),
      ).toEqual(['row-x', 'row-y', 'row-z']);
      expect((await queryPage<Row>(storeOf(db), { limit: 3, offset: 24 })).items).toHaveLength(2);
      expect((await queryPage<Row>(storeOf(db), { limit: 3, offset: 26 })).items).toEqual([]);
      expect((await queryPage<Row>(storeOf(db), { limit: 3, offset: 500 })).items).toEqual([]);

      const prevTail = await queryPage<Row>(storeOf(db), {
        limit: 3,
        offset: 25,
        direction: 'prev',
      });
      expect(prevTail.items.map((v) => v.name)).toEqual(['row-a']);
      const prevBeyond = await queryPage<Row>(storeOf(db), {
        limit: 3,
        offset: 500,
        direction: 'prev',
      });
      expect(prevBeyond.items).toEqual([]);
    });
  });

  test('limit larger than the store returns everything once', async () => {
    await withDb(async (db) => {
      await seed(db, alphabetRows());
      const page = await queryPage<Row>(storeOf(db), { limit: 1000 });
      expect(page.items).toHaveLength(26);
      expect(page.total).toBe(26);
      expect(page.hasMore).toBe(false);
    });
  });

  test('total is the live store count, never the filtered count', async () => {
    await withDb(async (db) => {
      await seed(db, alphabetRows());
      const filtered = await queryPage<Row>(storeOf(db), {
        indexName: 'status',
        range: IDBKeyRange.only(1),
      });
      expect(filtered.items).toHaveLength(7); // letters b,f,j,n,r,v,z
      expect(filtered.total).toBe(26);
    });
  });

  test('index ordering wins over insertion order; equal index keys keep primary-key order', async () => {
    await withDb(async (db) => {
      await seed(db, alphabetRows());
      const page = await queryPage<Row>(storeOf(db), { indexName: 'status' });
      const expectedStatuses = alphabetRows()
        .map((e) => e.value.status as number)
        .sort((a, b) => a - b);
      expect(page.items.map((v) => v.status)).toEqual(expectedStatuses);

      // Within status 1 the keys ascend: b < f < j < n < r < v < z
      expect(page.items.filter((v) => v.status === 1).map((v) => v.name)).toEqual([
        'row-b',
        'row-f',
        'row-j',
        'row-n',
        'row-r',
        'row-v',
        'row-z',
      ]);
    });
  });

  test('a secondary index on a non-numeric field orders by that field', async () => {
    await withDb(async (db) => {
      await seed(db, [
        { key: 'k3', value: row('third', { updatedAt: '2026-03-01T00:00:00.000Z' }) },
        { key: 'k1', value: row('first', { updatedAt: '2026-01-01T00:00:00.000Z' }) },
        { key: 'k2', value: row('second', { updatedAt: '2026-02-01T00:00:00.000Z' }) },
      ]);
      const asc = await queryPage<Row>(storeOf(db), { indexName: 'updatedAt' });
      expect(asc.items.map((v) => v.name)).toEqual(['first', 'second', 'third']);

      const desc = await queryPage<Row>(storeOf(db), {
        indexName: 'updatedAt',
        direction: 'prev',
        limit: 2,
      });
      expect(desc.items.map((v) => v.name)).toEqual(['third', 'second']);
    });
  });

  test('records missing the indexed field are skipped by the index cursor', async () => {
    await withDb(async (db) => {
      await seed(db, [
        { key: 'a', value: row('a', { status: 2 }) },
        { key: 'b', value: { name: 'b-no-status', updatedAt: '2026-01-01T00:00:00.000Z' } },
        { key: 'c', value: row('c', { status: 2 }) },
      ]);
      const page = await queryPage<Row>(storeOf(db), { indexName: 'status' });
      expect(page.items.map((v) => v.name)).toEqual(['a', 'c']);
      expect(page.total).toBe(3);
    });
  });

  test('an open-bounded range narrows the index cursor to the window', async () => {
    await withDb(async (db) => {
      await seed(db, alphabetRows());
      const page = await queryPage<Row>(storeOf(db), {
        indexName: 'status',
        range: IDBKeyRange.lowerBound(2, true),
      });
      expect(page.items.map((v) => v.status)).toEqual([3, 3, 3, 3, 3, 3]);
    });
  });

  test('queryPage returns stored values verbatim (no normalization, no writes)', async () => {
    await withDb(async (db) => {
      const legacy: Row = { name: 'legacy', status: 'done', updatedAt: '2020-01-01T00:00:00.000Z' };
      await seed(db, [{ key: 'x', value: legacy }]);

      const page = await queryPage<Row>(storeOf(db));
      expect(page.items[0]).toEqual(legacy);
      expect(await readRaw(db, 'x')).toEqual(legacy);
    });
  });

  test('an unknown index name rejects the call', async () => {
    await withDb(async (db) => {
      await seed(db, alphabetRows());
      await expect(queryPage(storeOf(db), { indexName: 'nope' })).rejects.toBeTruthy();
    });
  });
});

test.describe('batchGet', () => {
  test('missing keys are omitted and key types are preserved', async () => {
    await withDb(async (db) => {
      // Marker must be a whitelisted field: batchGet normalizes, so `name` is dropped.
      await seed(db, [
        { key: 5, value: row('numeric-five', { url: 'numeric-five', rating: 1 }) },
        { key: '5', value: row('string-five', { url: 'string-five', rating: 2 }) },
      ]);

      const got = await batchGet<Row>(storeOf(db), [5, '5', 6, 'nope']);
      expect(got.get(5)?.url).toBe('numeric-five');
      expect(got.get('5')?.url).toBe('string-five');
      expect(got.get(5)?.rating).toBe(1);
      expect(got.size).toBe(2);
    });
  });

  test('rows are normalized with the read whitelist, matching get/getAll', async () => {
    await withDb(async (db) => {
      const legacy = row('legacy', { isAdmin: true, rating: 99, linkedIds: ['bad'] });
      await seed(db, [{ key: 'movie::1', value: legacy }]);

      const value = (await batchGet<Record<string, unknown>>(storeOf(db), ['movie::1'])).get(
        'movie::1',
      );
      expect(value?.schemaVersion).toBe(2);
      expect(value?.isAdmin).toBeUndefined(); // unknown field stripped
      expect(value?.name).toBeUndefined(); // unknown field stripped
      expect(value?.rating).toBe(0); // out of range → dropped → migration default
      expect(value?.url).toBe(''); // required field back-filled by the v0→v1 step
      expect(value?.linkedIds).toEqual({}); // non-object linkedIds dropped → default

      // batchGet never writes back.
      expect(await readRaw(db, 'movie::1')).toEqual(legacy);
    });
  });

  test('a row whose migration fails keeps its raw value', async () => {
    await withDb(async (db) => {
      const tooNew = row('too-new', { schemaVersion: 99 });
      await seed(db, [{ key: 'too-new', value: tooNew }]);
      const got = await batchGet<Row>(storeOf(db), ['too-new']);
      expect(got.get('too-new')).toEqual(tooNew);
    });
  });

  test('a non-object stored value falls back to the raw payload instead of throwing', async () => {
    await withDb(async (db) => {
      await seed(db, [{ key: 'str', value: 'just-a-string' }]);
      const got = await batchGet<string>(storeOf(db), ['str']);
      expect(got.get('str')).toBe('just-a-string');
    });
  });

  test('an empty key list resolves to an empty map without touching the store', async () => {
    await withDb(async (db) => {
      await seed(db, alphabetRows());
      expect((await batchGet(storeOf(db), [])).size).toBe(0);
    });
  });
});
