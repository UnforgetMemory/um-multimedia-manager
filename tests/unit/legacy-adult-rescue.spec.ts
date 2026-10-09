import { test, expect } from '@playwright/test';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';
import { DB_NAME, DB_VERSION, STORE_NAMES, adultAvIdFromKey } from '@/engine/database/schema';
import { DatabaseConnection } from '@/engine/database/connection';
import {
  LEGACY_ADULT_STORE,
  rescueLegacyAdultRecords,
} from '@/engine/database/legacy-store-rescue';

/**
 * 遗留 sehuatang_avids 救援（umreview U2）。
 *
 * 复现的真实前置态：一个**已经到 v15** 的库，里面还留着 `sehuatang_avids`（v8 时代的
 * 旧名 store）+ 条目。生产路径上这种残留只可能来自「v13 一次性拷贝部分失败」—— 因为它
 * 只在 `oldVersion < 13` 时跑一次、每条失败都被 `preventDefault` 容错；而旧 store 从不
 * 删除、也不在任何读路径或备份白名单里 ⇒ 残留条目**既看不见也不进备份**。
 *
 * 覆盖：init 时自动救援（不显式调用也能观测到）、已存在键不被旧值覆盖、补写的记录带
 * `avId` 派生字段、幂等（第二次 rescued=0）、无遗留 store 时零成本返回。
 *
 * 基建：fake-indexeddb + 每用例新实例（沿用 adult-av-index-migration.spec 的先例）。
 */

initFileSandbox();
defineGlobal('IDBKeyRange', IDBKeyRange);

function freshIndexedDB(): void {
  defineGlobal('indexedDB', new IDBFactory());
}

/** 手工构造「v15 + 遗留 store 残留」的前置态（绕过生产迁移，直接搭出目标状态）。 */
async function buildResidualDb(
  legacyEntries: Array<{ key: string; value: Record<string, unknown> }>,
  existingJavEntries: Array<{ key: string; value: Record<string, unknown> }>,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      const jav = db.createObjectStore(STORE_NAMES.JAV_IDS);
      jav.createIndex('updatedAt', 'updatedAt', { unique: false });
      jav.createIndex('avId', 'avId', { unique: false });
      // 遗留旧名 store：v8 时代创建，实际库升级后**不会被删除**。
      const legacy = db.createObjectStore(LEGACY_ADULT_STORE);
      legacy.createIndex('updatedAt', 'updatedAt', { unique: false });
      for (const { key, value } of existingJavEntries) jav.put(value, key);
      for (const { key, value } of legacyEntries) legacy.put(value, key);
    };
    req.onsuccess = () => {
      req.result.close();
      resolve();
    };
    req.onerror = () => reject(req.error);
  });
}

async function readAll(
  conn: DatabaseConnection,
  store: string,
): Promise<Map<string, Record<string, unknown>>> {
  const db = await conn.ensureDB();
  return await new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const valuesReq = tx.objectStore(store).getAll();
    const keysReq = tx.objectStore(store).getAllKeys();
    tx.oncomplete = () => {
      const values = valuesReq.result as unknown[];
      const keys = keysReq.result as IDBValidKey[];
      resolve(
        new Map(keys.map((k, i) => [String(k), (values[i] ?? {}) as Record<string, unknown>])),
      );
    };
    tx.onerror = () => reject(tx.error);
  });
}

function adultRecord(rating: number): Record<string, unknown> {
  return {
    url: 'https://example.com/legacy',
    status: 2,
    rating,
    updatedAt: '2026-01-01T00:00:00.000Z',
    linkedIds: {},
    schemaVersion: 2,
  };
}

test.describe('legacy sehuatang_avids rescue', () => {
  test('DB 打开时自动救援：残留条目进入 jav_ids 且带上 avId 派生字段', async () => {
    freshIndexedDB();
    await buildResidualDb(
      [
        { key: 'jav::LEGACY-001', value: adultRecord(9) },
        { key: 'jav::LEGACY-002', value: adultRecord(7) },
      ],
      // 已存在同键：必须保留 jav_ids 里的新值，不被旧值覆盖。
      [{ key: 'jav::LEGACY-002', value: adultRecord(3) }],
    );

    const conn = new DatabaseConnection();
    await conn.init(); // 救援在 init 内 fire-and-forget

    // 不显式调用救援：能从 jav_ids 观测到条目，即证明 init 的接线生效。
    await expect
      .poll(async () => (await readAll(conn, STORE_NAMES.JAV_IDS)).size, { timeout: 5000 })
      .toBe(2);

    const jav = await readAll(conn, STORE_NAMES.JAV_IDS);
    expect(jav.has('jav::LEGACY-001'), '缺失的键必须被补齐').toBe(true);
    expect(jav.get('jav::LEGACY-001')?.avId, '派生索引字段必须一并写入').toBe(
      adultAvIdFromKey('jav::LEGACY-001'),
    );
    expect(jav.get('jav::LEGACY-002')?.rating, '已存在的键不得被旧值覆盖').toBe(3);

    // 遗留表本身只读不删：留待后续版本清理，救援不做破坏性动作。
    const legacy = await readAll(conn, LEGACY_ADULT_STORE);
    expect(legacy.size).toBe(2);
    conn.close();
  });

  test('幂等：第二次救援 rescued=0（可安全地在每次 SW 启动重复执行）', async () => {
    freshIndexedDB();
    await buildResidualDb([{ key: 'jav::ONLY-LEGACY', value: adultRecord(5) }], []);

    const conn = new DatabaseConnection();
    await conn.init();
    await expect
      .poll(async () => (await readAll(conn, STORE_NAMES.JAV_IDS)).size, { timeout: 5000 })
      .toBe(1);

    const again = await rescueLegacyAdultRecords(conn);
    expect(again, '第二次必须无事可做').toEqual({ scanned: 1, rescued: 0 });
    conn.close();
  });

  test('无遗留 store（全新库）⇒ 零成本返回，不写任何东西', async () => {
    freshIndexedDB();
    const conn = new DatabaseConnection();
    await conn.init(); // 全新库：迁移只建 v6+ 的 store，不含旧名

    const outcome = await rescueLegacyAdultRecords(conn);
    expect(outcome).toEqual({ scanned: 0, rescued: 0 });
    await expect.poll(async () => (await readAll(conn, STORE_NAMES.JAV_IDS)).size).toBe(0);
    conn.close();
  });
});
