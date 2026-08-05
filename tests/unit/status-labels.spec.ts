import { test, expect } from '@playwright/test'
import {
  interestBarLabels,
  statusBadgeLabels,
} from '@/content/douban/shared/status-labels'

/**
 * Status → label mapping 国标化测试。
 *
 * 覆盖两个语义族（ADR-009）：
 * 1. interestBarLabels — 兴趣标记按钮（wish/do/collect/mark）
 * 2. statusBadgeLabels — 状态徽章展示（done/wish/none/doing）
 *
 * 关键决策（decision-1）：game done 文案统一为 '玩过'（非 '已玩'）。
 */

// ── interestBarLabels ──

test.describe('interestBarLabels', () => {
  test('movie: 想看/在看/已看/标记', () => {
    const labels = interestBarLabels.movie
    expect(labels.wish).toBe('想看')
    expect(labels.do).toBe('在看')
    expect(labels.collect).toBe('已看')
    expect(labels.mark).toBe('标记')
  })

  test('music: 想听/在听/已听/标记', () => {
    const labels = interestBarLabels.music
    expect(labels.wish).toBe('想听')
    expect(labels.do).toBe('在听')
    expect(labels.collect).toBe('已听')
    expect(labels.mark).toBe('标记')
  })

  test('book: 想读/在读/已读/标记', () => {
    const labels = interestBarLabels.book
    expect(labels.wish).toBe('想读')
    expect(labels.do).toBe('在读')
    expect(labels.collect).toBe('已读')
    expect(labels.mark).toBe('标记')
  })

  test('game: 想玩/在玩/玩过/标记', () => {
    const labels = interestBarLabels.game
    expect(labels.wish).toBe('想玩')
    expect(labels.do).toBe('在玩')
    expect(labels.collect).toBe('玩过')
    expect(labels.mark).toBe('标记')
  })
})

// ── statusBadgeLabels ──

test.describe('statusBadgeLabels', () => {
  test('movie: 已看/想看/未看/在看', () => {
    const labels = statusBadgeLabels.movie
    expect(labels.done).toBe('已看')
    expect(labels.wish).toBe('想看')
    expect(labels.none).toBe('未看')
    expect(labels.doing).toBe('在看')
  })

  test('music: 已听/想听/未听/在听', () => {
    const labels = statusBadgeLabels.music
    expect(labels.done).toBe('已听')
    expect(labels.wish).toBe('想听')
    expect(labels.none).toBe('未听')
    expect(labels.doing).toBe('在听')
  })

  test('book: 已读/想读/未读/在读', () => {
    const labels = statusBadgeLabels.book
    expect(labels.done).toBe('已读')
    expect(labels.wish).toBe('想读')
    expect(labels.none).toBe('未读')
    expect(labels.doing).toBe('在读')
  })

  test('game: 玩过/想玩/未玩/在玩 (decision-1: done=玩过, not 已玩)', () => {
    const labels = statusBadgeLabels.game
    expect(labels.done).toBe('玩过')
    expect(labels.wish).toBe('想玩')
    expect(labels.none).toBe('未玩')
    expect(labels.doing).toBe('在玩')
  })
})
