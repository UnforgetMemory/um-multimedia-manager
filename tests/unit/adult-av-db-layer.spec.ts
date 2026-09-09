import { test, expect } from '@playwright/test'
import { IDBFactory } from 'fake-indexeddb'
import { MediaDatabase } from '@/features/database/models'
import { JAV_IDS_STORE_NAME } from '@/features/adult-av/models'
import type { StoreRecord } from '@/types'

/**
 * 保存链路 DB 层端到端复现（真实 IndexedDB + 真实 MediaDatabase）。
 *
 * 背景：「复制磁力后 record 未保存（翻页返回无 dimmer/无隐藏/无记录）」。
 * 本组测试绕开消息层，直接驱动 handleAdultAvBatchAdd 所使用的同一
 * batchPut/get/getAll 路径，锁定 DB 层是否存在结构性缺陷。
 *
 * 隔离纪律：MediaDatabase 是每测试新实例 + 每测试新 IDBFactory——
 * 不触碰模块级 mediaDB 单例，避免 Playwright 复用 worker 的跨 spec 污染。
 * 测试结束后恢复 globalThis.indexedDB，防泄漏到后续 spec（gotcha #5）。
 */

function makeRecord(overrides: Partial<StoreRecord> = {}): StoreRecord {
  return {
    url: 'https://www.sehuatang.net/thread-1-1-1.html',
    status: 2,
    rating: 0,
    updatedAt: new Date().toISOString(),
    linkedIds: {},
    ...overrides,
  }
}

const ORIGINAL_INDEXEDDB = (globalThis as { indexedDB?: IDBFactory }).indexedDB

test.afterAll(() => {
  ;(globalThis as { indexedDB?: IDBFactory }).indexedDB = ORIGINAL_INDEXEDDB
})

test.describe('jav_ids 写读链路（真实 IndexedDB）', () => {
  test('batchPut 写入 → get 精确读回（batchAdd 处理器的真实落库路径）', async () => {
    ;(globalThis as { indexedDB?: IDBFactory }).indexedDB = new IDBFactory()
    const db = new MediaDatabase()
    await db.init()

    await db.batchPut(JAV_IDS_STORE_NAME, [
      { key: 'sehuatang::ABC-123', record: makeRecord() },
      { key: 'sehuatang::FC2PPV-44580', record: makeRecord({ url: 'https://x/2' }) },
    ])

    const first = await db.get(JAV_IDS_STORE_NAME, 'sehuatang::ABC-123')
    expect(first).not.toBeNull()
    expect(first!.status).toBe(2)
    const second = await db.get(JAV_IDS_STORE_NAME, 'sehuatang::FC2PPV-44580')
    expect(second).not.toBeNull()
  })

  test('getAll 全量读回 → 与 CHECK_BATCH 同构的 watched 判定命中', async () => {
    ;(globalThis as { indexedDB?: IDBFactory }).indexedDB = new IDBFactory()
    const db = new MediaDatabase()
    await db.init()

    await db.batchPut(JAV_IDS_STORE_NAME, [
      { key: 'sehuatang::ABC-123', record: makeRecord() },
    ])

    const all = await db.getAll(JAV_IDS_STORE_NAME)
    const watchedBase = new Set<string>()
    for (const entry of all) {
      const suffix = entry.key.includes('::') ? entry.key.slice(entry.key.indexOf('::') + 2) : entry.key
      if ((entry.record.status ?? 0) >= 2) watchedBase.add(suffix)
    }
    // 与 batchCheckExists 输入归一化（大写）一致
    expect(watchedBase.has('ABC-123')).toBe(true)
    expect(watchedBase.has('XYZ-999')).toBe(false)
  })

  test('重复 batchPut 同键 → 覆盖而非报错（幂等重写）', async () => {
    ;(globalThis as { indexedDB?: IDBFactory }).indexedDB = new IDBFactory()
    const db = new MediaDatabase()
    await db.init()

    await db.batchPut(JAV_IDS_STORE_NAME, [{ key: 'sehuatang::A-1', record: makeRecord() }])
    await db.batchPut(JAV_IDS_STORE_NAME, [{ key: 'sehuatang::A-1', record: makeRecord({ rating: 5 }) }])
    const record = await db.get(JAV_IDS_STORE_NAME, 'sehuatang::A-1')
    expect(record!.rating).toBe(5)
  })

  test('失败路径：store 不存在 → batchPut 拒绝（错误路径覆盖）', async () => {
    ;(globalThis as { indexedDB?: IDBFactory }).indexedDB = new IDBFactory()
    const db = new MediaDatabase()
    await db.init()

    await expect(
      db.batchPut('nonexistent_store', [{ key: 'x', record: makeRecord() }]),
    ).rejects.toThrow()
  })
})
