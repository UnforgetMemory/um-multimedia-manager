/**
 * 遗留 store 救援（umreview U2）。
 *
 * 背景：`sehuatang_avids` 是 v7→v8 引入、v8→v9 由 `jav_ids` 取代的**旧名 store**。
 * `migrate.ts` 的 v13 块会在 upgrade 事务上把它整表复制进 `jav_ids`，但那条路有三个
 * 现实约束：
 *  1. 它是**一次性**的 —— 只在 `oldVersion < 13` 时执行，跑过就不再跑；
 *  2. 每条复制失败都被 `preventDefault()` 容错（只 warn），**部分失败会留下残留**；
 *  3. 旧 store 从不删除，且**不在任何读路径里**（三表读侧只查 jav/usav/sehuatang_ids），
 *     也不在 `BACKUP_STORES` 里。
 *
 * 结果：一旦残留，那些条目就既看不见、也不进备份 —— 这是用户报告的「备份没完全
 * record」的一条真实路径。
 *
 * 本救援是**幂等且只增不删**的：只把「`jav_ids` 里尚不存在」的键补进去，已存在的键
 * 一律不覆盖（不拿旧值盖掉更新的数据）。DB 打开时跑一次；成功后遗留表为空，后续每次
 * 打开只付出一次 objectStoreNames 检查的成本。
 */

import { errorLog } from '@/libraries/utils/logger';
import { STORE_NAMES, adultAvIdFromKey } from './schema';
import type { DatabaseConnection } from './connection';

/** 遗留成人记录 store 名（v8 时代；只存在于经 v7→v8 升级过的库）。 */
export const LEGACY_ADULT_STORE = 'sehuatang_avids';

export interface RescueOutcome {
  /** 遗留表中扫描到的条目数。 */
  scanned: number;
  /** 实际补写进 `jav_ids` 的条目数（已存在的不算）。 */
  rescued: number;
}

const EMPTY: RescueOutcome = { scanned: 0, rescued: 0 };

/**
 * 把遗留 `sehuatang_avids` 中「jav_ids 尚不存在」的条目补写进 `jav_ids`。
 * 任何异常都吞掉并记日志（救援绝不能影响 DB 打开），返回已完成的统计。
 */
export async function rescueLegacyAdultRecords(conn: DatabaseConnection): Promise<RescueOutcome> {
  let db: IDBDatabase;
  try {
    db = await conn.ensureDB();
  } catch (err: unknown) {
    errorLog('[DB] legacy adult rescue: database unavailable', err);
    return EMPTY;
  }
  if (!db.objectStoreNames.contains(LEGACY_ADULT_STORE)) return EMPTY;
  if (!db.objectStoreNames.contains(STORE_NAMES.JAV_IDS)) return EMPTY;

  return await new Promise<RescueOutcome>((resolve) => {
    let settled = false;
    const outcome = (): RescueOutcome => ({ scanned, rescued });
    let scanned = 0;
    let rescued = 0;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      if (rescued > 0) conn.invalidateStoreCache(STORE_NAMES.JAV_IDS);
      resolve(outcome());
    };

    try {
      // 两个 store 在同一事务里：读遗留 → 查 jav_ids 是否已有 → 只在缺失时补写。
      const tx = db.transaction([LEGACY_ADULT_STORE, STORE_NAMES.JAV_IDS], 'readwrite');
      const src = tx.objectStore(LEGACY_ADULT_STORE);
      const dst = tx.objectStore(STORE_NAMES.JAV_IDS);
      const cursorReq = src.openCursor();

      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor) return;
        if (typeof cursor.key !== 'string') {
          cursor.continue();
          return;
        }
        scanned += 1;
        const key = cursor.key;
        const existingReq = dst.get(key);
        existingReq.onsuccess = () => {
          if (existingReq.result === undefined) {
            // avId 是成人三表的派生索引字段（写侧单一维护点语义），救援必须一并补齐，
            // 否则救回来的记录不会出现在 v15 索引里。
            dst.put({ ...(cursor.value as object), avId: adultAvIdFromKey(key) }, key);
            rescued += 1;
          }
          cursor.continue();
        };
        existingReq.onerror = (ev) => {
          ev.preventDefault(); // 保持事务存活：单条查询失败不该中断整轮救援
          cursor.continue();
        };
      };
      cursorReq.onerror = (ev) => {
        ev.preventDefault();
      };

      tx.oncomplete = finish;
      tx.onerror = finish;
      tx.onabort = finish;
    } catch (err: unknown) {
      errorLog('[DB] legacy adult rescue failed', err);
      finish();
    }
  });
}
