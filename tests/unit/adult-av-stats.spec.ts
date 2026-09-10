import { test, expect } from '@playwright/test'
import { handleAdultAvStats } from '@/entrypoints/background/handlers/adult-av'
import {
  JAV_IDS_STORE_NAME,
  USAV_IDS_STORE_NAME,
  SEHUATANG_IDS_STORE_NAME,
} from '@/features/adult-av/models'
import type { StoreRecord, StoreRecordSnapshot } from '@/types'
import type { MediaDatabase } from '@/features/database/models'

/**
 * ADULT_AV_STATS — 三段已看统计（ADR-025 D5：各自按表计数）。
 *
 * 用户裁决：用「日系已看 / 欧美已看 / 帖子已看」三段替代单一「历史总阅」。
 * 契约：
 *   jp  = jav_ids 内 status>=2 且非 TID 残留键（消费侧过滤纪律与 GET_ALL 对齐）
 *   us  = usav_ids 内 status>=2
 *   tid = sehuatang_ids 内 status>=2
 * status < 2（未看/wishlist）不计入任何一段。
 */

function makeRecord(status: number): StoreRecord {
  return { url: '', status, rating: 0, updatedAt: '2026-09-10T00:00:00.000Z', linkedIds: {} }
}

type Entry = { key: string; record: StoreRecordSnapshot }

function entry(key: string, status: number): Entry {
  return { key, record: makeRecord(status) }
}

/** Stub db: getAll(store) returns the seeded entries for that store. */
function stubDb(seed: Record<string, Entry[]>): Pick<MediaDatabase, 'getAll'> {
  return {
    getAll: async (storeName: string) => (seed[storeName] ?? []) as never,
  }
}

async function runStats(db: Pick<MediaDatabase, 'getAll'>): Promise<{ jp: number; us: number; tid: number }> {
  let response: { success: boolean; jp?: number; us?: number; tid?: number } | undefined
  const sendResponse = (r?: unknown) => { response = r as typeof response }
  await handleAdultAvStats({}, sendResponse, db)
  return { jp: response!.jp ?? -1, us: response!.us ?? -1, tid: response!.tid ?? -1 }
}

test.describe('handleAdultAvStats (三段按表计数)', () => {
  test('各表独立计数：日系 / 美欧 / 帖子互不干扰', async () => {
    const db = stubDb({
      [JAV_IDS_STORE_NAME]: [
        entry('javdb::SSIS-001', 2),
        entry('sehuatang::FC2PPV-44580', 2),
        entry('javdb::ABC-123', 1), // status<2 → 不计
      ],
      [USAV_IDS_STORE_NAME]: [
        entry('sehuatang::BIGTITSROUNDASSES.23.06.10', 2),
        entry('sehuatang::MOMMYGOTBOOBS.21.03.09', 2),
      ],
      [SEHUATANG_IDS_STORE_NAME]: [
        entry('sehuatang::TID-3664524', 2),
      ],
    })
    expect(await runStats(db)).toEqual({ jp: 2, us: 2, tid: 1 })
  })

  test('jp 计数排除 jav_ids 内 TID 存量残留键（消费侧过滤纪律）', async () => {
    const db = stubDb({
      [JAV_IDS_STORE_NAME]: [
        entry('sehuatang::SSIS-001', 2),
        entry('sehuatang::TID-777', 2), // 存量混合残留 → 不计入 jp
        entry('javdb::TID-888', 2),     // 任意 source 的 TID 残留 → 不计入 jp
      ],
      [USAV_IDS_STORE_NAME]: [],
      [SEHUATANG_IDS_STORE_NAME]: [entry('sehuatang::TID-999', 2)],
    })
    expect(await runStats(db)).toEqual({ jp: 1, us: 0, tid: 1 })
  })

  test('空库 → 三段全 0', async () => {
    expect(await runStats(stubDb({}))).toEqual({ jp: 0, us: 0, tid: 0 })
  })

  test('全部 status<2 → 三段全 0（未看不算已看）', async () => {
    const db = stubDb({
      [JAV_IDS_STORE_NAME]: [entry('javdb::A-1', 1), entry('javdb::B-2', 0)],
      [USAV_IDS_STORE_NAME]: [entry('sehuatang::C.23.01.01', 1)],
      [SEHUATANG_IDS_STORE_NAME]: [entry('sehuatang::TID-1', 0)],
    })
    expect(await runStats(db)).toEqual({ jp: 0, us: 0, tid: 0 })
  })
})
