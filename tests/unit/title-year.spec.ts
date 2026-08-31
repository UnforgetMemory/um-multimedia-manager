import { test, expect } from '@playwright/test'
import { splitTitleYear } from '@/content/douban/shared/title-year'

test.describe('splitTitleYear', () => {
  test('extracts trailing half-width year and strips it from title', () => {
    expect(splitTitleYear('金刚 King Kong (2005)')).toEqual({ title: '金刚 King Kong', year: '2005' })
  })

  test('extracts trailing full-width year and strips it from title', () => {
    expect(splitTitleYear('英雄本色（1986）')).toEqual({ title: '英雄本色', year: '1986' })
  })

  test('tolerates inner spaces inside the parentheses', () => {
    expect(splitTitleYear('沙丘 Dune ( 2021 )')).toEqual({ title: '沙丘 Dune', year: '2021' })
  })

  test('keeps mid-title year, splits only the trailing parenthesized year', () => {
    expect(splitTitleYear('2012 (2009)')).toEqual({ title: '2012', year: '2009' })
  })

  test('title without year stays untouched', () => {
    expect(splitTitleYear('肖申克的救赎 The Shawshank Redemption')).toEqual({
      title: '肖申克的救赎 The Shawshank Redemption',
      year: null,
    })
  })

  test('non-year trailing parenthetical is not treated as a year', () => {
    expect(splitTitleYear('老友记 第一季 (第1季)')).toEqual({
      title: '老友记 第一季 (第1季)',
      year: null,
    })
  })

  test('out-of-range year is rejected', () => {
    expect(splitTitleYear('未知影片 (1234)')).toEqual({ title: '未知影片 (1234)', year: null })
  })

  test('parenthesized-only title yields no year and keeps original text', () => {
    expect(splitTitleYear('(2005)')).toEqual({ title: '(2005)', year: null })
  })

  test('empty input returns empty title and null year', () => {
    expect(splitTitleYear('')).toEqual({ title: '', year: null })
  })

  test('missing title from malformed __DATA__ does not throw', () => {
    expect(splitTitleYear(undefined)).toEqual({ title: '', year: null })
  })

  test('trailing whitespace after the year is tolerated', () => {
    expect(splitTitleYear('金刚 King Kong (2005)  ')).toEqual({ title: '金刚 King Kong', year: '2005' })
  })
})
