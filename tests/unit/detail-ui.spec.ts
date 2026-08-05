import { test, expect } from '@playwright/test'
import { metaToChips, ratingBarWidth, starClass } from '@/content/douban/shared/detail-ui'

/**
 * detail-ui.ts 纯函数单元测试。
 *
 * 覆盖三个纯函数：metaToChips / ratingBarWidth / starClass。
 * handleInterestSave 和 openLink 依赖浏览器 API，不在此测试。
 */

// ─── starClass ───────────────────────────────────────────────────────────────

test.describe('starClass', () => {
  test('returns bigstar class with numeric suffix', () => {
    expect(starClass('45')).toBe('bigstar bigstar45')
  })

  test('returns empty string for empty input', () => {
    expect(starClass('')).toBe('')
  })

  test('handles zero as falsy', () => {
    // "0" is truthy in JS, so it should still produce a class
    expect(starClass('0')).toBe('bigstar bigstar0')
  })
})

// ─── ratingBarWidth ──────────────────────────────────────────────────────────

test.describe('ratingBarWidth', () => {
  test('parses percentage with % sign', () => {
    expect(ratingBarWidth('45.2%')).toBe('45.2%')
  })

  test('parses plain number as percent', () => {
    expect(ratingBarWidth('30')).toBe('30%')
  })

  test('returns 0% for empty string', () => {
    expect(ratingBarWidth('')).toBe('0%')
  })

  test('returns 0% for unparseable string', () => {
    expect(ratingBarWidth('abc')).toBe('0%')
  })

  test('handles 100%', () => {
    expect(ratingBarWidth('100%')).toBe('100%')
  })

  test('handles 0%', () => {
    expect(ratingBarWidth('0%')).toBe('0%')
  })
})

// ─── metaToChips ─────────────────────────────────────────────────────────────

test.describe('metaToChips', () => {
  test('wraps plain text in umm-meta-chip span', () => {
    const result = metaToChips('hello')
    expect(result).toBe('<span class="umm-meta-chip">hello</span>')
  })

  test('splits " / "-separated values into multiple chips', () => {
    const result = metaToChips('A / B / C')
    expect(result).toContain('</span><span class="umm-meta-chip">')
    // Should have 3 chip segments
    const chips = result.split('umm-meta-chip">')
    expect(chips.length).toBe(4) // prefix + 3 chips
  })

  test('preserves leading/trailing wrapper tags', () => {
    const result = metaToChips('<span class="attrs">A / B</span>')
    expect(result).toBe('<span class="attrs"><span class="umm-meta-chip">A</span><span class="umm-meta-chip">B</span></span>')
  })

  test('adds target="_blank" to links without it', () => {
    const result = metaToChips('name <a href="https://example.com">link</a> / other')
    expect(result).toContain('target="_blank"')
    expect(result).toContain('rel="noopener noreferrer"')
  })

  test('does not duplicate target on links that already have it', () => {
    const result = metaToChips('<a href="https://example.com" target="_blank">link</a>')
    // Should not have target="_blank" twice
    const matches = result.match(/target="_blank"/g)
    expect(matches?.length).toBe(1)
  })

  test('wraps IMDb text ID into link when label is IMDb', () => {
    const result = metaToChips('tt1234567', 'IMDb')
    expect(result).toContain('https://www.imdb.com/title/tt1234567/')
    expect(result).toContain('target="_blank"')
  })

  test('does not wrap IMDb link when label is not IMDb', () => {
    const result = metaToChips('tt1234567', 'Director')
    expect(result).not.toContain('imdb.com')
  })

  test('does not wrap non-IMDb text even with IMDb label', () => {
    const result = metaToChips('not-an-id', 'IMDb')
    expect(result).not.toContain('imdb.com')
  })

  test('handles empty input', () => {
    const result = metaToChips('')
    expect(result).toBe('<span class="umm-meta-chip"></span>')
  })

  test('handles HTML with nested tags around slash separator', () => {
    const html = '<span>A</span> / <span>B</span>'
    const result = metaToChips(html)
    expect(result).toContain('umm-meta-chip')
    // The " / " between spans should be treated as separator
  })
})
