import { test, expect } from '@playwright/test'
import { handleAdultAvCheck, handleAdultAvGetAll } from '@/entrypoints/background/handlers/adult-av'
import {
  JAV_IDS_STORE_NAME,
  USAV_IDS_STORE_NAME,
  SEHUATANG_IDS_STORE_NAME,
} from '@/features/adult-av/models'
import type { StoreRecord, StoreRecordSnapshot } from '@/types'
import type { MediaDatabase } from '@/features/database/models'

/**
 * ADULT_AV_CHECK / ADULT_AV_GET_ALL — ADR-025 读侧核心逻辑的 handler 级护栏。
 *
 * 此前只有 STATS / BATCH_ADD 有 handler 级用例，三表合并读（GET_ALL）与
 * 三表 L1/L2 扫描（CHECK）仅被间接覆盖——本文件补齐这两条路径的回归锚点。
 */

function makeRecord(status: number, extra: Partial<StoreRecord> = {}): StoreRecord {
  return { url: '', status, rating: 0, updatedAt: '2026-09-10T00:00:00.000Z', linkedIds: {}, ...extra }
}

type Entry = { key: string; record: StoreRecordSnapshot }

function entry(key: string, status: number, extra: Partial<StoreRecord> = {}): Entry {
  return { key, record: makeRecord(status, extra) }
}

/** Stub db：get 按键查 seed，getAll 返回对应表全量（三表合并语义的真实形状）。 */
function stubDb(seed: Record<string, Entry[]>): Pick<MediaDatabase, 'get' | 'getAll'> {
  return {
    get: async (storeName: string, key: string) =>
      (seed[storeName] ?? []).find((e) => e.key === key)?.record as never,
    getAll: async (storeName: string) => (seed[storeName] ?? []) as never,
  }
}

type CheckResponse = { success: boolean; exists?: boolean; watched?: boolean }

async function runCheck(
  db: Pick<MediaDatabase, 'get' | 'getAll'>,
  id: string,
): Promise<CheckResponse> {
  let response: CheckResponse | undefined
  const sendResponse = (r?: unknown) => { response = r as CheckResponse }
  await handleAdultAvCheck({ id }, sendResponse, db)
  return response!
}

test.describe('handleAdultAvCheck — 三表 L1/L2 扫描', () => {
  test('L1 精确命中：jav_ids / usav_ids / sehuatang_ids 三表任一命中即存在', async () => {
    const jav = stubDb({ [JAV_IDS_STORE_NAME]: [entry('javdb::SSIS-001', 2)] })
    const us = stubDb({ [USAV_IDS_STORE_NAME]: [entry('sehuatang::BIGTITSROUNDASSES.23.06.10', 2)] })
    const tid = stubDb({ [SEHUATANG_IDS_STORE_NAME]: [entry('sehuatang::TID-3664524', 2)] })

    expect(await runCheck(jav, 'SSIS-001')).toMatchObject({ exists: true, watched: true })
    expect(await runCheck(us, 'BigTitsRoundAsses.23.06.10')).toMatchObject({ exists: true, watched: true })
    expect(await runCheck(tid, 'TID-3664524')).toMatchObject({ exists: true, watched: true })
  })

  test('L1 baseId 回退：-UC / -U / -C 后缀剥离后再精确匹配', async () => {
    const db = stubDb({ [JAV_IDS_STORE_NAME]: [entry('javdb::YAG-1233', 2)] })
    expect(await runCheck(db, 'YAG-1233-UC')).toMatchObject({ exists: true, watched: true })
    expect(await runCheck(db, 'YAG-1233-U')).toMatchObject({ exists: true, watched: true })
    expect(await runCheck(db, 'yag-1233-c')).toMatchObject({ exists: true, watched: true })
  })

  test('L2 后缀扫描兜底：非 KNOWN_SOURCES 写入的键（mukaku）仍可命中', async () => {
    const db = stubDb({ [JAV_IDS_STORE_NAME]: [entry('mukaku::SSIS-002', 2)] })
    expect(await runCheck(db, 'SSIS-002')).toMatchObject({ exists: true, watched: true })
  })

  test('status<2 → exists 为真但 watched 为假（未看不等于已看）', async () => {
    const db = stubDb({ [JAV_IDS_STORE_NAME]: [entry('javdb::ABC-123', 1)] })
    expect(await runCheck(db, 'ABC-123')).toMatchObject({ exists: true, watched: false })
  })

  test('三表皆无 → exists 为假', async () => {
    const db = stubDb({ [JAV_IDS_STORE_NAME]: [entry('javdb::SSIS-001', 2)] })
    expect(await runCheck(db, 'NOTEXIST-999')).toMatchObject({ exists: false, watched: false })
  })

  test('空 id → 失败响应', async () => {
    const db = stubDb({})
    let response: CheckResponse | undefined
    await handleAdultAvCheck({ id: '' }, (r?: unknown) => { response = r as CheckResponse }, db)
    expect(response!.success).toBe(false)
  })
})

type GetAllResponse = {
  success: boolean
  items?: Array<{ source: string; id: string; url: string; rating: number }>
}

async function runGetAll(
  db: Pick<MediaDatabase, 'getAll'>,
  payload?: { source?: string },
): Promise<GetAllResponse> {
  let response: GetAllResponse | undefined
  const sendResponse = (r?: unknown) => { response = r as GetAllResponse }
  await handleAdultAvGetAll(payload, sendResponse, db)
  return response!
}

test.describe('handleAdultAvGetAll — 番号两表合并 + 消费侧过滤', () => {
  test('合并 jav_ids + usav_ids，且过滤 TID 存量残留键', async () => {
    const db = stubDb({
      [JAV_IDS_STORE_NAME]: [
        entry('javdb::SSIS-001', 2, { url: 'https://javdb.com/x', rating: 8 }),
        entry('sehuatang::TID-777', 2), // 存量 TID 残留 → 必须被过滤
      ],
      [USAV_IDS_STORE_NAME]: [entry('sehuatang::BIGTITSROUNDASSES.23.06.10', 2)],
      [SEHUATANG_IDS_STORE_NAME]: [entry('sehuatang::TID-888', 2)], // 独立表，不在合并范围
    })
    const items = (await runGetAll(db)).items!
    expect(items.map((i) => i.id).sort()).toEqual(['BIGTITSROUNDASSES.23.06.10', 'SSIS-001'])
    expect(items.every((i) => !i.id.startsWith('TID-'))).toBe(true)
  })

  test('source 过滤按 key 前缀切片，且 id 不含前缀', async () => {
    const db = stubDb({
      [JAV_IDS_STORE_NAME]: [entry('javdb::SSIS-001', 2), entry('sehuatang::FC2PPV-44580', 2)],
      [USAV_IDS_STORE_NAME]: [entry('javdb::SOMEMOVIE.23.01.01', 2)],
    })
    const items = (await runGetAll(db, { source: 'javdb' })).items!
    expect(items.map((i) => i.id).sort()).toEqual(['SOMEMOVIE.23.01.01', 'SSIS-001'])
    expect(items.every((i) => i.source === 'javdb')).toBe(true)
  })

  test('空库 → 空列表', async () => {
    expect((await runGetAll(stubDb({}))).items).toEqual([])
  })
})
