import { test, expect } from '@playwright/test'
import { collectTitleLabel } from '@/content/douban/shared/collect-title-label'

/**
 * collectTitleLabel — collect-page title label helper (H4-⑤, 2026-08-08).
 *
 * Characterization lock for the shared pure function extracted from 4
 * byte-identical titleLabel computed blocks (user-media / book-collect /
 * music-collect / game-collect). The only real difference is game-collect's
 * `'do'` subType key — parameterized via doingKey.
 */

const LABELS = { wish: '想看', doing: '在看', done: '已看' }

test.describe('collectTitleLabel', () => {
  test('subType=wish → labels.wish', () => {
    expect(collectTitleLabel(LABELS, 'wish')).toBe('想看')
  })

  test('subType=doing (default key) → labels.doing', () => {
    expect(collectTitleLabel(LABELS, 'doing')).toBe('在看')
  })

  test('subType=do → default labels.done (default key is "doing", so "do" falls through)', () => {
    expect(collectTitleLabel(LABELS, 'do')).toBe('已看')
  })

  test('subType=do with doingKey="do" (game vocabulary) → labels.doing', () => {
    expect(collectTitleLabel(LABELS, 'do', 'do')).toBe('在看')
  })

  test('unknown subType → labels.done', () => {
    expect(collectTitleLabel(LABELS, 'watched')).toBe('已看')
  })

  test('missing subType → labels.done', () => {
    expect(collectTitleLabel(LABELS, '')).toBe('已看')
  })

  test('returns the passed label value unchanged (no transformation)', () => {
    expect(collectTitleLabel(LABELS, 'wish')).toBe(LABELS.wish)
    expect(collectTitleLabel(LABELS, 'doing')).toBe(LABELS.doing)
  })
})
