import { test, expect } from '@playwright/test';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { DatabaseConnection } from '@/engine/database/connection';
import { DB_NAME, STORE_NAMES, RECORD_STORES, ADULT_AV_ID_INDEX } from '@/engine/database/schema';

/**
 * X12-A coverage wave — migrate.ts per-version upgrade branches.
 *
 * Deliberately NON-overlapping with the neighbours: contract-freeze.spec owns
 * the fresh v0→v15 schema and DB_VERSION; db-migration.spec owns the clean
 * v12→v15 key moves/copy; adult-av-index-migration owns the v14→v15 backfill.
 * This spec drives the branches none of them reach: v6 and v7 starts (store
 * creation with data preservation, the upgrade-only `sehuatang_avids` store),
 * the v13 key-COLLISION path and non-string / foreign-prefix key passthrough,
 * the v13 jav_ids copy stamping `avId`, and the v15 path where the index
 * ALREADY exists (the createIndex guard must not throw ConstraintError).
 *
 * Each test hand-builds an old-shape DB with fake-indexeddb, then lets the
 * REAL DatabaseConnection.init() run migrateSchema at v15 with real deps.
 */

type Raw = Record<string, unknown>;

// Playwright reuses one worker across spec files; capture the true originals
// at import time so withUpgraded can leave globalThis exactly as it found it.
const ORIGINAL_INDEXEDDB = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
const ORIGINAL_IDB_KEY_RANGE = Object.getOwnPropertyDescriptor(globalThis, 'IDBKeyRange');

const FOUR_RECORDS = [STORE_NAMES.DOUBAN, STORE_NAMES.IMDB, STORE_NAMES.NEODB, STORE_NAMES.TMDB];
const RECORD_INDEXES = ['status', 'updatedAt'];

function createStore(db: IDBDatabase, name: string, indexes: string[]): void {
  if (db.objectStoreNames.contains(name)) return;
  const store = db.createObjectStore(name);
  for (const idx of indexes) store.createIndex(idx, idx, { unique: false });
}

function createPreV7(db: IDBDatabase): void {
  for (const name of FOUR_RECORDS) createStore(db, name, RECORD_INDEXES);
  createStore(db, STORE_NAMES.TTL_CACHE, ['expiry']);
}

function createPreV13(db: IDBDatabase): void {
  for (const name of RECORD_STORES) createStore(db, name, RECORD_INDEXES);
  createStore(db, STORE_NAMES.TTL_CACHE, ['expiry']);
  createStore(db, STORE_NAMES.PT_ID_CACHE, ['updatedAt']);
  createStore(db, STORE_NAMES.JAV_IDS, ['updatedAt']);
  createStore(db, 'sehuatang_avids', ['updatedAt']);
}

/** Open at `version` (no upgrade handler — migrate.ts must NOT see v15 shape). */
function buildOldDb(version: number, create: (db: IDBDatabase) => void): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, version);
    req.onupgradeneeded = () => create(req.result as IDBDatabase);
    req.onsuccess = () => {
      (req.result as IDBDatabase).close();
      resolve();
    };
    req.onerror = () => reject(req.error);
  });
}

function seedTx(
  db: IDBDatabase,
  stores: string[],
  work: (tx: IDBTransaction) => void,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(stores, 'readwrite');
    work(tx);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** Build old DB, seed through it, then upgrade to v15 through DatabaseConnection. */
async function withUpgraded(
  version: number,
  create: (db: IDBDatabase) => void,
  seed: ((db: IDBDatabase) => Promise<void>) | null,
  body: (conn: DatabaseConnection) => Promise<void>,
): Promise<void> {
  const factory = new IDBFactory();
  const g = globalThis as unknown as { indexedDB?: IDBFactory; IDBKeyRange?: typeof IDBKeyRange };
  g.indexedDB = factory;
  g.IDBKeyRange = IDBKeyRange;
  const conn = new DatabaseConnection();
  try {
    await buildOldDb(version, (db) => {
      create(db);
    });
    if (seed) {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, version);
        req.onsuccess = () => resolve(req.result as IDBDatabase);
        req.onerror = () => reject(req.error);
      });
      try {
        await seed(db);
      } finally {
        db.close();
      }
    }
    await conn.init(); // real onupgradeneeded → migrateSchema(db, oldVersion, request, deps)
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

function rawGet(
  conn: DatabaseConnection,
  storeName: string,
  key: IDBValidKey,
): Promise<Raw | undefined> {
  return conn.storeOp<Raw | undefined>(storeName, 'readonly', (store) => store.get(key));
}

function rawKeys(conn: DatabaseConnection, storeName: string): Promise<IDBValidKey[]> {
  return conn.storeOp<IDBValidKey[]>(storeName, 'readonly', (store) => store.getAllKeys());
}

function indexNames(conn: DatabaseConnection, storeName: string): Promise<string[]> {
  return conn.ensureDB().then(
    (db) =>
      new Promise<string[]>((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const names = Array.from(tx.objectStore(storeName).indexNames);
        tx.oncomplete = () => resolve(names);
        tx.onerror = () => reject(tx.error);
      }),
  );
}

test.describe('v6 → v15 (record stores pre-bilibili)', () => {
  test('creates the missing stores, keeps pre-v7 data, and gains the upgrade-only sehuatang_avids', async () => {
    await withUpgraded(
      6,
      (db) => {
        for (const name of FOUR_RECORDS) createStore(db, name, RECORD_INDEXES);
        createStore(db, STORE_NAMES.TTL_CACHE, ['expiry']);
      },
      async (db) => {
        await seedTx(db, [STORE_NAMES.DOUBAN], (tx) => {
          tx.objectStore(STORE_NAMES.DOUBAN).put(
            {
              url: 'https://movie.douban.com/subject/1/',
              status: 2,
              rating: 8,
              updatedAt: 'x',
              linkedIds: {},
            },
            'movie::keepme',
          );
        });
      },
      async (conn) => {
        const db = await conn.ensureDB();
        for (const name of [
          ...RECORD_STORES,
          STORE_NAMES.JAV_IDS,
          STORE_NAMES.USAV_IDS,
          STORE_NAMES.SEHUATANG_IDS,
          STORE_NAMES.PT_ID_CACHE,
        ]) {
          expect(db.objectStoreNames.contains(name), name).toBe(true);
        }
        // Fresh installs never see this store (contract-freeze locks that);
        // v6/7 upgrades DO — the `oldVersion >= 6 && < 8` branch is the seam.
        expect(db.objectStoreNames.contains('sehuatang_avids')).toBe(true);

        expect(await indexNames(conn, STORE_NAMES.PT_ID_CACHE)).toEqual(['updatedAt']);
        expect(await indexNames(conn, STORE_NAMES.BILIBILI)).toEqual(RECORD_INDEXES);
        expect(await rawKeys(conn, STORE_NAMES.BILIBILI)).toEqual([]);
        // The v6-era data survived every later branch untouched.
        expect((await rawGet(conn, STORE_NAMES.DOUBAN, 'movie::keepme'))?.url).toBe(
          'https://movie.douban.com/subject/1/',
        );
      },
    );
  });
});

test.describe('v7 → v15 (pt_id_cache already exists)', () => {
  test('the <7 creation guard is skipped and existing cache rows are preserved', async () => {
    await withUpgraded(
      7,
      (db) => {
        createPreV7(db);
        createStore(db, STORE_NAMES.PT_ID_CACHE, ['updatedAt']);
      },
      async (db) => {
        await seedTx(db, [STORE_NAMES.PT_ID_CACHE], (tx) => {
          tx.objectStore(STORE_NAMES.PT_ID_CACHE).put(
            { ptUrl: 'https://pt.example/t/1', doubanId: 'movie::1', updatedAt: 'old' },
            'https://pt.example/t/1',
          );
        });
      },
      async (conn) => {
        const row = await rawGet(conn, STORE_NAMES.PT_ID_CACHE, 'https://pt.example/t/1');
        expect(row).toMatchObject({ doubanId: 'movie::1', updatedAt: 'old' });
      },
    );
  });
});

test.describe('v12 → v15: v13 key normalization edge branches', () => {
  test('collision keeps the canonical row, non-string and foreign-prefix keys pass through', async () => {
    await withUpgraded(
      12,
      createPreV13,
      async (db) => {
        await seedTx(db, [STORE_NAMES.BILIBILI], (tx) => {
          const bili = tx.objectStore(STORE_NAMES.BILIBILI);
          bili.put({ tag: 'legacy-a' }, 'video::BVa');
          bili.put({ tag: 'canonical-a' }, 'movie::BVa'); // collision victim stays, legacy dropped
          bili.put({ tag: 'legacy-b' }, 'video::BVb'); // clean move
          bili.put({ tag: 'foreign' }, 'tv::BVc'); // other prefix: left as-is
          bili.put({ tag: 'numeric' }, 42); // non-string key: skipped
          bili.put({ tag: 'bare' }, 'BVd'); // bare → movie::BVd
        });
        await seedTx(db, ['sehuatang_avids', STORE_NAMES.JAV_IDS], (tx) => {
          tx.objectStore('sehuatang_avids').put(
            { url: 'https://sehuatang.net/z', updatedAt: 'z' },
            'avZ',
          );
          // jav_ids deliberately empty: every copy lands, nothing to defend.
        });
      },
      async (conn) => {
        expect((await rawKeys(conn, STORE_NAMES.BILIBILI)).map(String).sort()).toEqual([
          '42',
          'movie::BVa',
          'movie::BVb',
          'movie::BVd',
          'tv::BVc',
        ]);
        // Collision case: the PRE-EXISTING canonical entry wins — the stale
        // 'video::BVa' value must be dropped, not merged or moved over.
        expect((await rawGet(conn, STORE_NAMES.BILIBILI, 'movie::BVa'))?.tag).toBe('canonical-a');
        expect((await rawGet(conn, STORE_NAMES.BILIBILI, 'movie::BVb'))?.tag).toBe('legacy-b');
        expect((await rawGet(conn, STORE_NAMES.BILIBILI, 'tv::BVc'))?.tag).toBe('foreign');
        expect((await rawGet(conn, STORE_NAMES.BILIBILI, 42))?.tag).toBe('numeric');

        // v13 copy stamps avId alongside the move (index never misses a row).
        const copied = await rawGet(conn, STORE_NAMES.JAV_IDS, 'avZ');
        expect(copied).toMatchObject({
          url: 'https://sehuatang.net/z',
          [ADULT_AV_ID_INDEX]: 'avZ',
        });
      },
    );
  });

  test('an existing jav_ids row is NOT overwritten by the stale sehuatang_avids copy', async () => {
    await withUpgraded(
      12,
      createPreV13,
      async (db) => {
        await seedTx(db, ['sehuatang_avids', STORE_NAMES.JAV_IDS], (tx) => {
          tx.objectStore('sehuatang_avids').put({ url: 'stale', updatedAt: 's' }, 'avDup');
          tx.objectStore(STORE_NAMES.JAV_IDS).put({ url: 'fresh', updatedAt: 'f' }, 'avDup');
        });
      },
      async (conn) => {
        expect((await rawGet(conn, STORE_NAMES.JAV_IDS, 'avDup'))?.url).toBe('fresh');
        expect(await rawKeys(conn, STORE_NAMES.JAV_IDS)).toEqual(['avDup']);
      },
    );
  });
});

test.describe('v13 start → v15: pre-existing avId index guard', () => {
  test('the avId createIndex guard is skipped (no ConstraintError) and backfill still repairs dirty rows', async () => {
    await withUpgraded(
      13,
      (db) => {
        for (const name of RECORD_STORES) createStore(db, name, RECORD_INDEXES);
        createStore(db, STORE_NAMES.TTL_CACHE, ['expiry']);
        createStore(db, STORE_NAMES.PT_ID_CACHE, ['updatedAt']);
        // Hand-seeded v13 variant: jav_ids already carries the avId index,
        // while usav_ids / sehuatang_ids are still missing (they arrive via
        // the <14 branch and must gain their avId index in <15).
        createStore(db, STORE_NAMES.JAV_IDS, [ADULT_AV_ID_INDEX, 'updatedAt']);
      },
      async (db) => {
        await seedTx(db, [STORE_NAMES.JAV_IDS], (tx) => {
          const jav = tx.objectStore(STORE_NAMES.JAV_IDS);
          jav.put({ url: 'a', updatedAt: 'u1', [ADULT_AV_ID_INDEX]: 'AAA' }, 'javdb::AAA'); // clean
          jav.put({ url: 'b', updatedAt: 'u2', [ADULT_AV_ID_INDEX]: 'WRONG' }, 'javdb::BBB'); // dirty
        });
      },
      async (conn) => {
        // Reaching this point at all means the upgrade did not abort on a
        // duplicate createIndex. The index survived exactly once.
        expect(await indexNames(conn, STORE_NAMES.JAV_IDS)).toEqual([
          ADULT_AV_ID_INDEX,
          'updatedAt',
        ]);
        expect((await rawGet(conn, STORE_NAMES.JAV_IDS, 'javdb::BBB'))?.[ADULT_AV_ID_INDEX]).toBe(
          'BBB',
        );
        expect((await rawGet(conn, STORE_NAMES.JAV_IDS, 'javdb::AAA'))?.[ADULT_AV_ID_INDEX]).toBe(
          'AAA',
        );

        // Backfilled rows are findable through the (pre-existing) index.
        const hits = await conn.storeOp<IDBValidKey[]>(STORE_NAMES.JAV_IDS, 'readonly', (store) =>
          store.index(ADULT_AV_ID_INDEX).getAllKeys(IDBKeyRange.only('BBB')),
        );
        expect(hits).toEqual(['javdb::BBB']);

        // The stores v14 adds were still created and gained their own avId index.
        // (Compared as a sorted set: indexNames ordering is not asserted anywhere.)
        const db = await conn.ensureDB();
        expect(db.objectStoreNames.contains(STORE_NAMES.USAV_IDS)).toBe(true);
        expect((await indexNames(conn, STORE_NAMES.USAV_IDS)).sort()).toEqual(
          [ADULT_AV_ID_INDEX, 'updatedAt'].sort(),
        );
      },
    );
  });
});
