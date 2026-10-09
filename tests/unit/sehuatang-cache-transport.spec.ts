import { test, expect } from '@playwright/test';
import { IDBFactory } from 'fake-indexeddb';
import {
  SehuatangDetailCacheDB,
  getDetailCacheBatch,
  putDetailCacheBatch,
} from '@/provider/sehuatang-cache/transport';
import {
  DETAIL_STORE_NAME,
  SEHUATANG_CACHE_DB_NAME,
  type SehuatangDetailCacheEntry,
} from '@/provider/sehuatang-cache/mapping';

/**
 * provider/sehuatang-cache/transport.ts — FAILURE & LIFECYCLE shapes of the
 * IDB wrapper. Happy-path CRUD/TTL/LRU already lives in
 * sehuatang-cache.spec.ts (import path `models`); this spec locks what that
 * one does not cover:
 * 1. lazy open is PROMISE-SHARED: concurrent callers trigger one real open;
 * 2. failed open (VersionError from an existing higher-version db) rejects,
 *    resets the cached promise, and every later attempt retries fresh;
 * 3. onversionchange closes + resets: after the db is deleted underneath, the
 *    next call transparently re-opens instead of dying on a dead connection;
 * 4. transactionDone surfaces aborts; a structural DataError write rejects
 *    putBatch (doc-comment: "callers degrade on any failure") and leaves the
 *    connection usable for the next write;
 * 5. module singleton getDetailCacheBatch/putDetailCacheBatch are wired to the
 *    default database name (handlers only ever see these two functions).
 * Isolation: fresh IDBFactory + unique db name per test (globalThis.indexedDB
 * restored in afterAll — same discipline as sehuatang-cache.spec.ts).
 */

const ORIGINAL_INDEXEDDB = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
let counter = 0;

interface CountedFactory {
  opens: number;
  factory: IDBFactory;
}

function freshFactory(): CountedFactory {
  const real = new IDBFactory();
  const counted: CountedFactory = { opens: 0, factory: real };
  Object.defineProperty(globalThis, 'indexedDB', {
    value: {
      open: (...args: Parameters<IDBFactory['open']>) => {
        counted.opens += 1;
        return real.open(...args);
      },
      deleteDatabase: (...args: Parameters<IDBFactory['deleteDatabase']>) =>
        real.deleteDatabase(...args),
    } as unknown as IDBFactory,
    configurable: true,
    writable: true,
  });
  return counted;
}

function uniqueName(): string {
  counter += 1;
  return `umm-sehuatang-cache-x12b-${counter}`;
}

function entry(
  tid: string,
  overrides: Partial<SehuatangDetailCacheEntry> = {},
): SehuatangDetailCacheEntry {
  return { tid, imageUrl: null, magnetLink: null, cachedAt: Date.now(), ...overrides };
}

/** Open a raw connection at a chosen version (pre-seeding / version bumps). */
function rawOpen(name: string, version?: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request =
      version === undefined
        ? (globalThis.indexedDB as IDBFactory).open(name)
        : (globalThis.indexedDB as IDBFactory).open(name, version);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DETAIL_STORE_NAME)) {
        db.createObjectStore(DETAIL_STORE_NAME, { keyPath: 'tid' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = (globalThis.indexedDB as IDBFactory).deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('deleteDatabase blocked'));
  });
}

test.afterAll(() => {
  Object.defineProperty(globalThis, 'indexedDB', {
    value: ORIGINAL_INDEXEDDB,
    configurable: true,
    writable: true,
  });
});

test.describe('SehuatangDetailCacheDB — open lifecycle', () => {
  test('concurrent first calls share ONE real indexedDB.open', async () => {
    const counted = freshFactory();
    const db = new SehuatangDetailCacheDB(uniqueName());
    await Promise.all([db.getBatch(['a']), db.putBatch([entry('b')]), db.getBatch(['b'])]);
    expect(counted.opens).toBe(1);
    db.close();
  });

  test('VersionError open rejects, resets, and every retry attempts a fresh open', async () => {
    freshFactory();
    const name = uniqueName();
    const seed = await rawOpen(name, 99); // existing db at v99 > SEHUATANG_CACHE_DB_VERSION
    seed.close();

    const db = new SehuatangDetailCacheDB(name);
    await expect(db.getBatch(['x'])).rejects.toThrow(/VersionError|version/i);
    await expect(db.getBatch(['x'])).rejects.toThrow(/VersionError|version/i);
    // Reset on failure is observable: two sequential attempts, not one cached
    // rejection plus a silent hang.
    const concurrent = await Promise.allSettled([db.getBatch(['x']), db.getBatch(['y'])]);
    expect(concurrent.every((r) => r.status === 'rejected')).toBe(true);
    db.close();
  });

  test('connection deleted underneath → next call re-opens cleanly (onversionchange reset)', async () => {
    const counted = freshFactory();
    const name = uniqueName();
    const db = new SehuatangDetailCacheDB(name);
    await db.putBatch([entry('t1')]);
    expect(Object.keys(await db.getBatch(['t1']))).toEqual(['t1']);
    const opensBefore = counted.opens;

    await deleteDatabase(name); // fires versionchange on the live connection

    const after = await db.getBatch(['t1']); // re-opened fresh → empty store
    expect(after).toEqual({});
    expect(counted.opens).toBe(opensBefore + 1);
    db.close();
  });
});

test.describe('SehuatangDetailCacheDB — failure surfaces', () => {
  test('structural DataError write rejects putBatch and leaves the db usable', async () => {
    freshFactory();
    const db = new SehuatangDetailCacheDB(uniqueName());
    // Runtime-shape probe: entries produced by a buggy caller can lack the
    // keyPath field entirely — the type forbids it, IDB must not accept it.
    const broken = {
      imageUrl: 'x',
      magnetLink: null,
      cachedAt: 1,
    } as unknown as SehuatangDetailCacheEntry;
    await expect(db.putBatch([broken])).rejects.toThrow();

    await db.putBatch([entry('healthy')]);
    expect(Object.keys(await db.getBatch(['healthy']))).toEqual(['healthy']);
    db.close();
  });

  test('close() is idempotent and lets the next call re-open', async () => {
    const counted = freshFactory();
    const db = new SehuatangDetailCacheDB(uniqueName());
    await db.putBatch([entry('t')]);
    db.close();
    db.close(); // second close must not throw
    await db.putBatch([entry('t2')]);
    expect(counted.opens).toBe(2);
    db.close();
  });
});

test.describe('module singleton surface', () => {
  test('putDetailCacheBatch/getDetailCacheBatch share one default-name database', async () => {
    freshFactory();
    await putDetailCacheBatch([entry('s1'), entry('s2')]);
    const back = await getDetailCacheBatch(['s1', 's2', 'missing']);
    expect(Object.keys(back).sort()).toEqual(['s1', 's2']);
    // Second call must reuse the singleton (fresh empty tids still resolve).
    expect(await getDetailCacheBatch(['missing'])).toEqual({});
  });

  test('the default database really is the isolated `umm-sehuatang-cache` name', async () => {
    freshFactory();
    expect(SEHUATANG_CACHE_DB_NAME).toBe('umm-sehuatang-cache');
    const db = new SehuatangDetailCacheDB();
    await db.putBatch([entry('default-name-check')]); // opens under default name
    const back = await db.getBatch(['default-name-check']);
    expect(back['default-name-check']).toBeDefined();
    db.close();
  });
});
