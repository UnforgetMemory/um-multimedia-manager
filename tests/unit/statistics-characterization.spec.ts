import { test, expect } from '@playwright/test'
import {
  computeStatistics,
  flattenRecords,
  type PlatformStoreEntries,
} from '@/domain/record/statistics'

/**
 * Statistics 聚合特征测试（refactor plan W0）。
 *
 * 锁定 background/handlers/data.ts 抽取到 domain/record/statistics.ts 前的
 * 聚合契约，含两处刻意保留的历史怪癖：
 *   1. 未知媒体前缀（如 game::）只进 total，不进任何媒体维；
 *   2. 未映射平台（unknown）只进 total，不进平台维。
 * W4 scenario 归位时此文件是行为漂移的回归锚。
 */

// ==================== Fixtures ====================

interface Rec {
  status?: number
  rating?: number
  comment?: string
}

function store(
  storeName: string,
  platform: string,
  entries: Array<[key: string, record: Rec]>,
): PlatformStoreEntries<Rec> {
  return { storeName, platform, entries: entries.map(([key, record]) => ({ key, record })) }
}

const MIXED_STORES: Array<PlatformStoreEntries<Rec>> = [
  store('douban_records', 'douban', [
    ['movie::37332784', { status: 2, rating: 8 }],
    ['movie::1292052', { status: 1 }],
    ['tv::26303214', { status: 2, rating: 9 }],
    ['music::10086', { status: 0 }],
    ['book::2001', { status: 2, rating: 7 }],
    // 历史怪癖 ①：game 前缀只进 total
    ['game::35412210', { status: 2 }],
  ]),
  store('bangumi_records', 'bangumi', [
    ['tv::123456', { status: 2, comment: 'watching' }],
    ['book::789012', { status: 1 }],
  ]),
  store('bilibili_records', 'bilibili', [
    // legacy bilibili 行可能带任意前缀（BV/movie），统计按条数计
    ['video::BV1xx411c7XX', { status: 2 }],
    ['movie::BV1xx411m8YY', { status: 2 }],
  ]),
  store('orphan_records', 'unknown', [
    // 历史怪癖 ②：unknown 平台只进 total
    ['movie::999', { status: 0 }],
  ]),
]

// ==================== computeStatistics ====================

test.describe('computeStatistics（特征锁定）', () => {
  test('混合 store → total / 媒体维 / 平台维 计数正确', () => {
    const s = computeStatistics(MIXED_STORES)
    expect(s.total).toBe(11)
    expect(s.movie).toBe(4) // douban×2 + bilibili movie:: + orphan movie::
    expect(s.tv).toBe(2) // douban tv:: + bangumi tv::
    expect(s.music).toBe(1)
    expect(s.book).toBe(2) // douban book:: + bangumi book::
    expect(s.douban).toBe(6)
    expect(s.bangumi).toBe(2)
    expect(s.bilibili).toBe(2)
    // 未映射平台无平台维字段累加
    expect(s.imdb).toBe(0)
    expect(s.neodb).toBe(0)
    expect(s.tmdb).toBe(0)
    expect(s.youtube).toBe(0)
  })

  test('历史怪癖：game:: 只进 total 不进媒体维', () => {
    const s = computeStatistics([MIXED_STORES[0]!])
    expect(s.total).toBe(6)
    expect(s.movie).toBe(2)
    expect(s.tv).toBe(1)
    // Statistics 形状固定 —— 用整体键集断言防新增维度悄悄出现
    expect(Object.keys(s).sort()).toEqual([
      'bangumi', 'bilibili', 'book', 'douban', 'imdb', 'movie',
      'music', 'neodb', 'tmdb', 'total', 'tv', 'youtube',
    ])
  })

  test('空输入 → 全零统计', () => {
    const s = computeStatistics([])
    expect(s.total).toBe(0)
    expect(s.movie).toBe(0)
    expect(s.douban).toBe(0)
  })
})

// ==================== flattenRecords ====================

test.describe('flattenRecords（特征锁定）', () => {
  test('key 前缀解析 + 多段 :: 的 providerId 还原', () => {
    const rows = flattenRecords([
      store('douban_records', 'douban', [
        ['movie::37332784', { status: 2 }],
        ['game::subject::extra', { status: 1 }],
      ]),
    ], new Set())
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ type: 'movie', provider: 'douban', providerId: '37332784', status: 2 })
    expect(rows[1]).toMatchObject({ type: 'game', providerId: 'subject::extra' })
  })

  test('videoStores 内的 store 一律归一化为 video（legacy 前缀抹平）', () => {
    const rows = flattenRecords([
      store('bilibili_records', 'bilibili', [
        ['video::BV1xx', { status: 2 }],
        ['movie::BV2yy', { status: 1 }],
      ]),
    ], new Set(['bilibili_records']))
    expect(rows.map(r => r.type)).toEqual(['video', 'video'])
    expect(rows.every(r => r.provider === 'bilibili')).toBe(true)
  })

  test('record 字段展开在顶层 + unknown 平台回退', () => {
    const rows = flattenRecords([
      store('orphan_records', 'unknown', [['movie::999', { status: 0, rating: 5, comment: 'x' }]]),
    ], new Set())
    expect(rows[0]).toMatchObject({
      type: 'movie',
      provider: 'unknown',
      providerId: '999',
      status: 0,
      rating: 5,
      comment: 'x',
    })
  })

  test('一致性：flatten 行数 === computeStatistics.total（同源快照）', () => {
    expect(flattenRecords(MIXED_STORES, new Set()).length).toBe(computeStatistics(MIXED_STORES).total)
  })
})
