import { test, expect } from '@playwright/test';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import {
  ADULT_AV_ID_INDEX,
  DB_NAME,
  DB_VERSION,
  MediaDatabase,
  STORE_NAMES,
  adultAvIdFromKey,
} from '@/engine/database/models';
import {
  JAV_IDS_STORE_NAME,
  USAV_IDS_STORE_NAME,
  SEHUATANG_IDS_STORE_NAME,
  normalizeAvId,
} from '@/provider/adult-av/models';
import { handleAdultAvCheck } from '@/entrypoints/background/handlers/adult-av';
import type { StoreRecord, StoreRecordSnapshot } from '@/types';

/**
 * v15 迁移 + ADULT_AV_CHECK L2 索引化回归（审计 §P-C1）。
 *
 * 覆盖四件事：
 * 1. v14→v15：成人三表补 `avId` 索引并在 upgrade 事务上回填存量记录；
 * 2. 迁移后 L2（新索引路径）能命中含历史形态键的旧库存量记录；
 * 3. 写侧（put/batchPut）与读侧 L2 的 avId 派生一致性；
 * 4. 对照测试：同一数据集下，新索引路径与**旧全表扫描算法**（本文件逐行
 *    复刻的旧 handleAdultAvCheck L1+L2）输出 {exists, watched, record} 逐值一致。
 *
 * 对照确定性：夹具记录预盖 schemaVersion/recordVersion，normalizeStoreRecord
 * 不再触发迁移回写——两侧响应不随读取顺序漂移。
 *
 * 基建沿用 fake-indexeddb + 每测试新实例（不触碰 mediaDB 单例）。
 */

const ORIGINAL_INDEXEDDB = (globalThis as { indexedDB?: IDBFactory }).indexedDB;

test.afterAll(() => {
  (globalThis as { indexedDB?: IDBFactory }).indexedDB = ORIGINAL_INDEXEDDB;
});

function freshIndexedDB(): void {
  const g = globalThis as unknown as { indexedDB: IDBFactory; IDBKeyRange: typeof IDBKeyRange };
  g.indexedDB = new IDBFactory();
  // getByIndex 走 IDBKeyRange.only —— 浏览器原生全局，node 测试环境需显式安装
  // （同 get-watched-ids-characterization.spec.ts 的先例）。
  g.IDBKeyRange = IDBKeyRange;
}

/** 预盖 schemaVersion/recordVersion 的存量记录（杜绝读侧迁移回写干扰对照）。 */
function legacy(status: number, url: string): Record<string, unknown> {
  return {
    url,
    status,
    rating: 0,
    updatedAt: '2025-01-01T00:00:00.000Z',
    linkedIds: {},
    schemaVersion: 2,
    recordVersion: 1,
  };
}

function rec(status: number): StoreRecord {
  return { url: '', status, rating: 0, updatedAt: '2025-01-01T00:00:00.000Z', linkedIds: {} };
}

const V14_RECORD_STORES = [
  STORE_NAMES.DOUBAN,
  STORE_NAMES.IMDB,
  STORE_NAMES.NEODB,
  STORE_NAMES.TMDB,
  STORE_NAMES.BILIBILI,
  STORE_NAMES.YOUTUBE,
  STORE_NAMES.BANGUMI,
];
const V14_ADULT_STORES = [STORE_NAMES.JAV_IDS, STORE_NAMES.USAV_IDS, STORE_NAMES.SEHUATANG_IDS];

type LegacySeed = Array<{ store: string; key: string; record: Record<string, unknown> }>;

/** 构造 v14 形态旧库：成人三表仅 updatedAt 索引，存量记录不含 avId 字段。 */
function createV14LegacyDatabase(seed: LegacySeed): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 14);
    req.onupgradeneeded = (ev) => {
      const db = (ev.target as IDBOpenDBRequest).result;
      for (const name of V14_RECORD_STORES) {
        const store = db.createObjectStore(name);
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
      const ttl = db.createObjectStore(STORE_NAMES.TTL_CACHE);
      ttl.createIndex('expiry', 'expiry', { unique: false });
      const pt = db.createObjectStore(STORE_NAMES.PT_ID_CACHE);
      pt.createIndex('updatedAt', 'updatedAt', { unique: false });
      for (const name of V14_ADULT_STORES) {
        const store = db.createObjectStore(name);
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(V14_ADULT_STORES, 'readwrite');
      for (const { store, key, record } of seed) {
        tx.objectStore(store).put(record, key);
      }
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  });
}

/** 原始连接读取（绕过 MediaDatabase 归一化），验证落库值与索引集合。 */
function openRawDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function rawEntries(
  storeName: string,
): Promise<Array<{ key: string; value: Record<string, unknown> }>> {
  const db = await openRawDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const out: Array<{ key: string; value: Record<string, unknown> }> = [];
      const req = tx.objectStore(storeName).openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          out.push({ key: String(cursor.key), value: cursor.value as Record<string, unknown> });
          cursor.continue();
        } else {
          resolve(out);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function rawIndexNames(storeName: string): Promise<string[]> {
  const db = await openRawDb();
  try {
    const tx = db.transaction(storeName, 'readonly');
    return Array.from(tx.objectStore(storeName).indexNames).sort();
  } finally {
    db.close();
  }
}

// —— v14 旧库夹具：含历史形态键（错表混存 / 未知 source / 裸键 / 双分号键 /
//    带脏 avId 的记录），全部不带可用索引字段。 ——
const LEGACY_SEED: LegacySeed = [
  { store: JAV_IDS_STORE_NAME, key: 'sehuatang::SSIS-001', record: legacy(2, 'u1') },
  { store: JAV_IDS_STORE_NAME, key: 'mukaku::SSIS-999', record: legacy(2, 'u2') },
  { store: JAV_IDS_STORE_NAME, key: 'ABC-999', record: legacy(1, 'u3') }, // 裸键 + 未看
  { store: JAV_IDS_STORE_NAME, key: 'x::y::SSIS-2', record: legacy(2, 'u4') }, // 双分号后缀
  { store: JAV_IDS_STORE_NAME, key: 'aaa-src::ZZZ-1', record: legacy(1, 'u5') }, // 同后缀多键
  { store: JAV_IDS_STORE_NAME, key: 'zzz-src::ZZZ-1', record: legacy(2, 'u6') },
  {
    store: JAV_IDS_STORE_NAME,
    key: 'stale::ZZZ-2',
    record: { ...legacy(2, 'u7'), avId: 'WRONG-STALE' },
  },
  {
    store: USAV_IDS_STORE_NAME,
    key: 'sehuatang::BIGTITSROUNDASSES.23.06.10',
    record: legacy(2, 'u8'),
  },
  { store: USAV_IDS_STORE_NAME, key: 'other::BLACKED.RAW.21.03.09', record: legacy(0, 'u9') },
  { store: SEHUATANG_IDS_STORE_NAME, key: 'sehuatang::TID-3664524', record: legacy(2, 'u10') },
];

async function upgradedV15Db(): Promise<MediaDatabase> {
  freshIndexedDB();
  await createV14LegacyDatabase(LEGACY_SEED);
  const mdb = new MediaDatabase();
  await mdb.init();
  return mdb;
}

type CheckResponse = {
  success: boolean;
  exists?: boolean;
  watched?: boolean;
  record?: StoreRecordSnapshot | null;
};

async function runCheck(db: MediaDatabase, id: string): Promise<CheckResponse> {
  let response: CheckResponse | undefined;
  await handleAdultAvCheck(
    { id },
    (r?: unknown) => {
      response = r as CheckResponse;
    },
    db,
  );
  return response!;
}

/**
 * 旧算法逐行复刻（v14 及以前 handleAdultAvCheck 的 L1 + L2 全表扫描）。
 * L2 用 getAll 主键序游标 + 后缀 candidates.includes 判断、首个命中即停。
 */
async function runCheckOld(db: MediaDatabase, id: string): Promise<CheckResponse> {
  const KNOWN_SOURCES = ['javdb', 'sehuatang'];
  const ALL_WATCHED_STORES = [JAV_IDS_STORE_NAME, USAV_IDS_STORE_NAME, SEHUATANG_IDS_STORE_NAME];

  const cleanId = normalizeAvId(id);
  const baseId = cleanId.replace(/-(U|C|UC|CU)$/i, '');
  const candidates = baseId !== cleanId ? [cleanId, baseId] : [cleanId];
  let found: { key: string; record: StoreRecordSnapshot } | null = null;
  let watched = false;

  outer: for (const storeName of ALL_WATCHED_STORES) {
    for (const source of KNOWN_SOURCES) {
      for (const candidate of candidates) {
        const key = `${source}::${candidate}`;
        const record = await db.get(storeName, key);
        if (record) {
          found = { key, record };
          watched = (record.status ?? 0) >= 2;
          break outer;
        }
      }
    }
  }

  if (!found) {
    outer2: for (const storeName of ALL_WATCHED_STORES) {
      const allEntries = await db.getAll(storeName);
      for (const entry of allEntries) {
        const keySuffix = entry.key.includes('::')
          ? entry.key.slice(entry.key.indexOf('::') + 2)
          : entry.key;
        if (candidates.includes(keySuffix)) {
          found = { key: entry.key, record: entry.record };
          watched = (entry.record.status ?? 0) >= 2;
          break outer2;
        }
      }
    }
  }

  return { success: true, exists: !!found, watched, record: found?.record };
}

test.describe('DB v15 migration（成人三表 avId 索引 + 回填）', () => {
  test('v14 → v15：三表补 avId 索引，存量记录回填与键后缀一致（含脏值纠正）', async () => {
    const mdb = await upgradedV15Db();

    expect(DB_VERSION).toBe(15);
    for (const storeName of V14_ADULT_STORES) {
      expect(await rawIndexNames(storeName)).toEqual(['avId', 'updatedAt']);
    }

    for (const storeName of V14_ADULT_STORES) {
      const entries = await rawEntries(storeName);
      expect(entries.length).toBeGreaterThan(0);
      for (const entry of entries) {
        // 回填后：值内 avId 恒等于键的 `::` 后缀（脏值 'WRONG-STALE' 被纠正）。
        expect(entry.value[ADULT_AV_ID_INDEX]).toBe(adultAvIdFromKey(entry.key));
      }
    }

    mdb.close();
  });

  test('迁移后存量历史形态键可被新 L2 索引路径命中', async () => {
    const mdb = await upgradedV15Db();

    // 未知 source（mukaku）后缀键 → L2 命中，status 2 → watched
    expect(await runCheck(mdb, 'SSIS-999')).toMatchObject({ exists: true, watched: true });
    // 裸键（无 '::' 前缀）：avId = 整键；normalizeAvId 大写归一后命中
    expect(await runCheck(mdb, 'abc-999')).toMatchObject({ exists: true, watched: false });
    // 旧版混存落错表（美欧番号存进 jav_ids）也能命中
    expect(await runCheck(mdb, 'BigTitsRoundAsses.23.06.10')).toMatchObject({
      exists: true,
      watched: true,
    });
    // TID 键在 sehuatang_ids
    expect(await runCheck(mdb, 'TID-3664524')).toMatchObject({ exists: true, watched: true });
    // 双分号键的后缀是 'y::SSIS-2'，'SSIS-2' 不构成命中（与旧算法一致）
    expect(await runCheck(mdb, 'SSIS-2')).toMatchObject({ exists: false, watched: false });

    mdb.close();
  });

  test('写侧同步维护：put/batchPut 成人表补 avId，非成人表不受影响', async () => {
    const mdb = await upgradedV15Db();

    await mdb.put(JAV_IDS_STORE_NAME, 'novel::ABC-1234', rec(2));
    await mdb.batchPut(USAV_IDS_STORE_NAME, [{ key: 'novel::STUDIO.24.01.02', record: rec(2) }]);
    await mdb.put(STORE_NAMES.DOUBAN, 'movie::12345', rec(2));

    const jav = await rawEntries(JAV_IDS_STORE_NAME);
    expect(jav.find((e) => e.key === 'novel::ABC-1234')?.value.avId).toBe('ABC-1234');
    const usav = await rawEntries(USAV_IDS_STORE_NAME);
    expect(usav.find((e) => e.key === 'novel::STUDIO.24.01.02')?.value.avId).toBe(
      'STUDIO.24.01.02',
    );
    const douban = await rawEntries(STORE_NAMES.DOUBAN);
    expect(douban[0]!.value).not.toHaveProperty('avId');

    // 新写入立即对 L2 索引可见
    expect(await runCheck(mdb, 'ABC-1234')).toMatchObject({ exists: true, watched: true });
    mdb.close();
  });
});

test.describe('ADULT_AV_CHECK L2 新旧算法对照（逐值等价）', () => {
  // 查询集覆盖：L1 命中 / L2 多候选（-UC 后缀）/ 同后缀多键（主键序）/
  // 跨表 store 顺序 / 脏 avId 回填键 / 双分号键 / status<2 / 不存在 /
  // 大写与空格归一化变体。
  const QUERY_IDS = [
    'SSIS-001', // L1 sehuatang source 精确命中
    'SSIS-999', // L2 mukaku source 后缀命中
    'ssis 999', // normalizeAvId：小写 + 空格→连字符
    'ABC-999', // 裸键，status 1（exists 真但 watched 假）
    'ZZZ-1', // 同后缀两键：主键序首个 'aaa-src::ZZZ-1'（status 1）胜出
    'ZZZ-1-UC', // 双候选：cleanId 无命中、baseId 'ZZZ-1' 命中
    'ZZZ-2', // 脏 avId 已被回填纠正后命中
    'STALE::WRONG', // 任何键的后缀都不是它
    'y::SSIS-2', // 归一后 'Y::SSIS-2'，与真实后缀 'y::SSIS-2' 大小写不同 → 双侧皆 miss
    'SSIS-2', // 双分号键：旧算法同样不命中
    'BLACKED.RAW.21.03.09', // usav 表 status 0
    'blacked.raw.21.03.09', // 小写变体
    'TID-3664524', // sehuatang_ids 表
    'TID-9999999', // 不存在
    'FC2-NOPE', // 不存在
  ];

  for (const id of QUERY_IDS) {
    test(`id="${id}"：新索引路径与旧全表扫描逐值一致`, async () => {
      const mdb = await upgradedV15Db();
      const oldResult = await runCheckOld(mdb, id);
      const newResult = await runCheck(mdb, id);
      expect(newResult).toEqual(oldResult);
      mdb.close();
    });
  }
});
