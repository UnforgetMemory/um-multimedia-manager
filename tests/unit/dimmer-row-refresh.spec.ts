import { test, expect } from '@playwright/test'
import { rowMightMatchKey, clearResolvedAttributes } from '@/entrypoints/content/enhancers/pt/dimmer/refresh'

/**
 * Row-level resolved-marker refresh (C3): a single-key record event only
 * re-checks rows that mention that provider id; bulk `*` re-checks all.
 */

test('bulk key * always re-checks', () => {
  expect(rowMightMatchKey('<tr>unrelated</tr>', '*')).toBe(true)
  expect(rowMightMatchKey('', '*')).toBe(true)
})

test('composite key matches rows containing the provider id', () => {
  const row = '<tr><a href="/details.php?id=1">tt0111161</a></tr>'
  expect(rowMightMatchKey(row, 'imdb_records::tt0111161')).toBe(true)
  expect(rowMightMatchKey(row, 'imdb_records::tt9999999')).toBe(false)
})

test('bare key (no ::) uses the whole key as id', () => {
  expect(rowMightMatchKey('<tr>abc-123</tr>', 'ABC-123')).toBe(false) // case-sensitive DOM search
  expect(rowMightMatchKey('<tr>abc-123</tr>', 'abc-123')).toBe(true)
})

test('empty id after :: fails open (re-check)', () => {
  expect(rowMightMatchKey('<tr>x</tr>', 'movie::')).toBe(true)
})

test('clearResolvedAttributes strips both marker attrs', () => {
  const attrs = new Map<string, string>()
  const el = {
    removeAttribute(name: string) {
      attrs.delete(name)
    },
    set(name: string, v: string) {
      attrs.set(name, v)
    },
  }
  el.set('data-umm-resolved', 'true')
  el.set('data-umm-mteam-resolved', 'true')
  clearResolvedAttributes(el)
  expect(attrs.size).toBe(0)
})
