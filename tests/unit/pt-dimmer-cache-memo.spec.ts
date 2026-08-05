import { test, expect } from '@playwright/test'
import {
  applyCacheFallback,
  resetPtBulkMemo,
} from '@/entrypoints/content/enhancers/pt/dimmer/cache'
import type { PtIdCacheEntry } from '@/types'

/**
 * PT Dimmer bulk ID-cache memo 单元测试。
 *
 * 背景（S2 根因，db.ts:250）：applyCacheFallback 每轮 MutationObserver 周期
 * 都调用 Store.ptIdCacheGetBulk([...urlMap.keys()])；后台 handlePtIdCacheGetBulk
 * 的 scheduler cacheKey 是 `ptcache-bulk:${ptUrls.join(',')}` —— 顺序敏感。
 * 行被框架重建/重排后 join 结果变化 → 5s scheduler 缓存永不命中 →
 * 每周期全量 IndexedDB 批量重读。
 *
 * 修复契约（本 spec 锁定）：
 * 1. memo 键 = 排序后的归一化 URL 集合 —— 同一集合（任意行顺序）第二次调用
 *    复用上次 ptIdCacheGetBulk 结果，不发第二条后台消息（memo 命中）；
 *    命中只跳过 DB 查询，不跳过匹配/淡化逻辑；
 * 2. 集合变化（新增/缩减）→ 重新查询并更新 memo；
 * 3. resetPtBulkMemo()（record:updated/deleted 事件路径调用）→ 相同集合也重新查询；
 * 4. 空行 / 无 URL 行 → 提前返回、不查询、不崩溃，且不破坏既有 memo。
 *
 * Store 通过 chrome.runtime.sendMessage 桩模拟（与 record-cache.spec.ts 同法）：
 * 统计 PT_ID_CACHE_GET_BULK 消息次数与载荷，按 entries 表回包。
 */

const ORIGIN = 'https://pt.example.com'
const URL_A = `${ORIGIN}/details.php?id=1001`
const URL_B = `${ORIGIN}/details.php?id=1002`
const URL_C = `${ORIGIN}/details.php?id=1003`

const ENTRY_A: PtIdCacheEntry = {
  ptUrl: URL_A,
  doubanId: '1001',
  updatedAt: '2026-08-05T00:00:00.000Z',
}
const ENTRY_B: PtIdCacheEntry = {
  ptUrl: URL_B,
  imdbId: 'tt1234567',
  updatedAt: '2026-08-05T00:00:00.000Z',
}

const MOVIE = new Set(['1001'])
const MUSIC = new Set<string>()
const IMDB = new Set(['tt1234567'])

/** Playwright 单测跑在 Node，无 location 全局 —— 桩一个 origin 供 URL 归一化。 */
test.beforeAll(() => {
  ;(globalThis as { location?: { origin: string } }).location = {
    origin: ORIGIN,
  }
})

test.beforeEach(() => {
  resetPtBulkMemo()
})

/** 结构桩行：仅暴露 detail URL、id 与 setAttribute（applyCacheFallback 所需）。 */
interface RowStub {
  id: string
  url: string | null
  attrs: Map<string, string>
  setAttribute(name: string, value: string): void
}

function makeRow(id: string, url: string | null): RowStub {
  return {
    id,
    url,
    attrs: new Map(),
    setAttribute(name: string, value: string) {
      this.attrs.set(name, value)
    },
  }
}

/**
 * 安装 chrome.runtime.sendMessage 桩。返回 bulk 查询记录（每次调用的 ptUrls
 * 数组），供断言消息次数与载荷。entries 表键为归一化 URL。
 */
function installChromeStub(entries: Record<string, PtIdCacheEntry>): string[][] {
  const bulkQueries: string[][] = []
  const chromeStub = {
    runtime: {
      id: 'test-extension',
      lastError: null,
      sendMessage: (
        msg: { type: string; payload?: { ptUrls?: string[] } },
        cb?: (res: unknown) => void,
      ) => {
        if (msg.type === 'PT_ID_CACHE_GET_BULK') {
          const urls = msg.payload?.ptUrls ?? []
          bulkQueries.push(urls)
          const found: Record<string, PtIdCacheEntry> = {}
          for (const url of urls) {
            const entry = entries[url]
            if (entry) found[url] = entry
          }
          cb?.({ success: true, entries: found })
          return
        }
        cb?.({ success: true })
      },
      onMessage: { addListener: () => {} },
    },
  }
  const prev = (globalThis as { chrome?: unknown }).chrome
  ;(globalThis as { chrome?: unknown }).chrome = chromeStub
  return bulkQueries
}

const noop = (): void => {}

/** 以与 mteam.ts 相同的参数形态调用 applyCacheFallback，dimmed 记录被淡化行 id。 */
function callFallback(rows: RowStub[], dimmed: string[]): Promise<void> {
  return applyCacheFallback(
    noop,
    rows as unknown as Element[],
    (row) => (row as unknown as RowStub).url,
    MOVIE,
    MUSIC,
    IMDB,
    (el) => {
      dimmed.push((el as unknown as RowStub).id)
    },
  )
}

test.describe('applyCacheFallback bulk memo（S2 根因修复锁定）', () => {
  test('同一 URL 集合、行顺序不同 → 第二次调用零后台消息（memo 命中）', async () => {
    const bulkQueries = installChromeStub({ [URL_A]: ENTRY_A, [URL_B]: ENTRY_B })
    const dimmed: string[] = []

    // Given: 首次处理，行序 B → A
    await callFallback([makeRow('rB', URL_B), makeRow('rA', URL_A)], dimmed)
    expect(bulkQueries).toHaveLength(1)
    // 行序遍历序直传后台（后台 cacheKey 顺序敏感 —— 这正是 S2 的抖动来源）
    expect(bulkQueries[0]).toEqual([URL_B, URL_A])

    // When: 同一集合、行序 A → B（MutationObserver 周期中行被重建/重排的典型场景）
    await callFallback([makeRow('rA', URL_A), makeRow('rB', URL_B)], dimmed)

    // Then: 排序键相同 → memo 命中，无第二条后台消息
    expect(bulkQueries).toHaveLength(1)
    // memo 命中只跳过 DB 查询，不跳过匹配/淡化 —— 两次调用中每个匹配行都被淡化。
    // 淡化顺序跟随 cacheMap 键序（首次查询回包顺序），非行序，故不锁定顺序。
    expect([...dimmed].sort()).toEqual(['rA', 'rA', 'rB', 'rB'])
  })

  test('URL 集合变化（新增/缩减）→ 重新查询并更新 memo', async () => {
    const bulkQueries = installChromeStub({
      [URL_A]: ENTRY_A,
      [URL_B]: ENTRY_B,
      [URL_C]: ENTRY_B,
    })
    const dimmed: string[] = []

    await callFallback([makeRow('rA', URL_A), makeRow('rB', URL_B)], dimmed)
    expect(bulkQueries).toHaveLength(1)

    // 新增 URL_C → 集合变化 → 重新查询
    await callFallback(
      [makeRow('rA', URL_A), makeRow('rB', URL_B), makeRow('rC', URL_C)],
      dimmed,
    )
    expect(bulkQueries).toHaveLength(2)
    expect(bulkQueries[1]).toEqual([URL_A, URL_B, URL_C])

    // 行被标记 resolved 后缩减为子集 → 同样视为集合变化 → 重新查询
    await callFallback([makeRow('rA', URL_A)], dimmed)
    expect(bulkQueries).toHaveLength(3)

    // 与最新 memo 相同的集合 → 命中
    await callFallback([makeRow('rA', URL_A)], dimmed)
    expect(bulkQueries).toHaveLength(3)
  })

  test('resetPtBulkMemo()（record:updated/deleted 事件路径）→ 相同集合重新查询', async () => {
    const bulkQueries = installChromeStub({ [URL_A]: ENTRY_A, [URL_B]: ENTRY_B })
    const dimmed: string[] = []

    await callFallback([makeRow('rA', URL_A), makeRow('rB', URL_B)], dimmed)
    await callFallback([makeRow('rB', URL_B), makeRow('rA', URL_A)], dimmed)
    expect(bulkQueries).toHaveLength(1)

    // When: record 事件到达 → 清 memo（记录已变，旧结果作废）
    resetPtBulkMemo()

    // Then: 相同集合也必须重新查询
    await callFallback([makeRow('rA', URL_A), makeRow('rB', URL_B)], dimmed)
    expect(bulkQueries).toHaveLength(2)
  })

  test('空行 / 无 URL 行 → 提前返回，不查询、不崩溃', async () => {
    const bulkQueries = installChromeStub({})
    const dimmed: string[] = []

    await callFallback([], dimmed)
    expect(bulkQueries).toHaveLength(0)

    // null URL 被跳过；非法 URL（URL 构造抛错）被跳过 → urlMap 为空 → 不查询
    await callFallback([makeRow('rNull', null), makeRow('rBad', 'https://exa mple.com')], dimmed)
    expect(bulkQueries).toHaveLength(0)
  })

  test('空周期不破坏 memo → 后续相同集合仍命中', async () => {
    const bulkQueries = installChromeStub({ [URL_A]: ENTRY_A, [URL_B]: ENTRY_B })
    const dimmed: string[] = []

    await callFallback([makeRow('rA', URL_A), makeRow('rB', URL_B)], dimmed)
    expect(bulkQueries).toHaveLength(1)

    // 空周期（无行 / 无 URL）提前返回，不触碰 memo
    await callFallback([], dimmed)
    await callFallback([makeRow('rNull', null)], dimmed)
    expect(bulkQueries).toHaveLength(1)

    // 相同集合回来 → 仍命中
    await callFallback([makeRow('rA', URL_A), makeRow('rB', URL_B)], dimmed)
    expect(bulkQueries).toHaveLength(1)
  })
})
