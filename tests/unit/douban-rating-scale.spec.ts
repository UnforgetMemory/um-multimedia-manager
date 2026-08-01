import { test, expect } from '@playwright/test'
import {
  rating10ToDoubanStars,
  doubanStarsToRating10,
  shouldWriteRecord,
} from '@/content/douban/shared/rating-scale'

/**
 * 豆瓣评分制式适配全链路测试。
 *
 * 覆盖用户报告的两个缺陷：
 * 1. 从豆瓣页面读取的已看评分（1-5 星制）必须 ×2 转换为 0-10 制后再存储；
 *    且从 DB 读取的 0-10 制评分回填 UI 时必须 ÷2。
 * 2. 豆瓣页面评分变化后必须能更新本地已看记录（不能因为记录已存在而跳过）。
 */

test.describe('豆瓣 5分制 ↔ 10分制 适配', () => {
  test('DB 10制 → UI 5星 回填（÷2）', () => {
    expect(rating10ToDoubanStars(8)).toBe(4)   // 已看 8.0/10 → 4 星
    expect(rating10ToDoubanStars(10)).toBe(5)  // 满分 → 5 星
    expect(rating10ToDoubanStars(6)).toBe(3)   // 6.0/10 → 3 星
    expect(rating10ToDoubanStars(0)).toBe(0)   // 未评分
  })

  test('UI 5星 → DB 10制（×2）', () => {
    expect(doubanStarsToRating10(4)).toBe(8)   // 4 星 → 8.0/10
    expect(doubanStarsToRating10(5)).toBe(10)  // 5 星 → 10.0/10
    expect(doubanStarsToRating10(0)).toBe(0)   // 未评分
  })

  test('无本地记录 → 必须写入', () => {
    expect(shouldWriteRecord({ hasLocal: false, newStatus: 2, newRating10: 8 })).toBe(true)
  })

  test('有本地记录但状态不同 → 必须更新', () => {
    expect(shouldWriteRecord({ hasLocal: true, localStatus: 1, localRating: 0, newStatus: 2, newRating10: 8 })).toBe(true)
  })

  test('已看记录 + 页面评分变化 → 必须更新（修复 S3）', () => {
    expect(shouldWriteRecord({ hasLocal: true, localStatus: 2, localRating: 6, newStatus: 2, newRating10: 8 })).toBe(true)
  })

  test('完全一致 → 跳过', () => {
    expect(shouldWriteRecord({ hasLocal: true, localStatus: 2, localRating: 8, newStatus: 2, newRating10: 8 })).toBe(false)
  })

  test('页面未评分(0) → 不覆盖已有评分（评分保护）', () => {
    expect(shouldWriteRecord({ hasLocal: true, localStatus: 2, localRating: 8, newStatus: 2, newRating10: 0 })).toBe(false)
  })

  test('页面未评分但状态变化 → 仍更新状态', () => {
    expect(shouldWriteRecord({ hasLocal: true, localStatus: 1, localRating: 8, newStatus: 2, newRating10: 0 })).toBe(true)
  })
})

test.describe('评分转换健壮性（edge inputs）', () => {
  test('null/undefined/负数 → 0（不产生非法值）', () => {
    expect(rating10ToDoubanStars(undefined as unknown as number)).toBe(0)
    expect(rating10ToDoubanStars(null as unknown as number)).toBe(0)
    expect(rating10ToDoubanStars(-3)).toBe(0)
    expect(doubanStarsToRating10(undefined as unknown as number)).toBe(0)
    expect(doubanStarsToRating10(null as unknown as number)).toBe(0)
    expect(doubanStarsToRating10(-1)).toBe(0)
  })

  test('NaN → 0', () => {
    expect(rating10ToDoubanStars(NaN)).toBe(0)
    expect(doubanStarsToRating10(NaN)).toBe(0)
  })

  test('浮点精度：半星值往返稳定', () => {
    expect(rating10ToDoubanStars(7.5)).toBe(3.75)
    expect(doubanStarsToRating10(3.5)).toBe(7)
  })
})
