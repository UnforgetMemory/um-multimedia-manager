import { test, expect } from '@playwright/test'
import { parseRating } from '@/content/douban/shared/douban-extract'
import { isSafeDoubanUrl } from '@/content/douban/shared/composables/usePaginator'
import { withRetry } from '@/content/douban/shared/retry'
import { dateKey } from '@/utils'

test.describe('parseRating', () => {
  test('allstar50 → 5.0', () => {
    expect(parseRating('allstar50')).toBe(5.0)
  })

  test('allstar10 → 1.0', () => {
    expect(parseRating('allstar10')).toBe(1.0)
  })

  test('allstar95 → 9.5', () => {
    expect(parseRating('allstar95')).toBe(9.5)
  })

  test('no allstar class → 0', () => {
    expect(parseRating('')).toBe(0)
    expect(parseRating('rating-stars')).toBe(0)
  })

  test('trailing text after digits ignored', () => {
    expect(parseRating('allstar80 other-class')).toBe(8.0)
  })
})

test.describe('isSafeDoubanUrl', () => {
  test('accepts douban.com subdomains over http(s) with path', () => {
    expect(isSafeDoubanUrl('https://movie.douban.com/subject/123/')).toBe(true)
    expect(isSafeDoubanUrl('http://book.douban.com/subject/456/')).toBe(true)
    expect(isSafeDoubanUrl('https://www.douban.com/')).toBe(true)
  })

  test('requires a trailing path (rejects bare host — defensive strictness)', () => {
    // Pagination URLs always carry a path; the regex intentionally requires the
    // trailing slash so `douban.com.evil.example` style hosts cannot slip through.
    expect(isSafeDoubanUrl('https://music.douban.com')).toBe(false)
  })

  test('rejects non-douban hosts and schemes', () => {
    expect(isSafeDoubanUrl('https://douban.com.evil.example/')).toBe(false)
    expect(isSafeDoubanUrl('https://evil.com/douban.com/')).toBe(false)
    expect(isSafeDoubanUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeDoubanUrl('file:///etc/passwd')).toBe(false)
    expect(isSafeDoubanUrl('')).toBe(false)
  })
})

test.describe('withRetry', () => {
  test('returns first valid value without retrying', async () => {
    let calls = 0
    const result = await withRetry(() => { calls++; return 'ok' }, { attempts: 3, baseDelay: 1 })
    expect(result).toBe('ok')
    expect(calls).toBe(1)
  })

  test('retries until isValid passes, then returns that value', async () => {
    let calls = 0
    const result = await withRetry(
      () => { calls++; return calls < 3 ? null : 'ready' },
      { attempts: 5, baseDelay: 1, isValid: (v) => v !== null },
    )
    expect(result).toBe('ready')
    expect(calls).toBe(3)
  })

  test('returns last value when attempts exhausted', async () => {
    const result = await withRetry(() => null, { attempts: 2, baseDelay: 1 })
    expect(result).toBeNull()
  })

  test('respects custom isValid predicate', async () => {
    let calls = 0
    const result = await withRetry(
      () => { calls++; return calls },
      { attempts: 4, baseDelay: 1, isValid: (n) => n >= 3 },
    )
    expect(result).toBe(3)
  })

  test('default isValid is truthiness', async () => {
    let calls = 0
    const result = await withRetry(() => { calls++; return calls === 2 ? 'x' : '' }, { attempts: 3, baseDelay: 1 })
    expect(result).toBe('x')
    expect(calls).toBe(2)
  })
})

test.describe('dateKey', () => {
  test('formats local YYYY-MM-DD with zero padding', () => {
    expect(dateKey(new Date(2026, 7, 2))).toBe('2026-08-02')
    expect(dateKey(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(dateKey(new Date(2026, 11, 31))).toBe('2026-12-31')
  })
})
