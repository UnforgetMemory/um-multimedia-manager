import { test, expect } from '@playwright/test'
import {
  MAX_FIELD_LEN,
  MAX_PUT_ENTRIES,
  MAX_TID_LEN,
  normalizeCacheField,
  validateCachePutEntries,
} from '@/entrypoints/background/handlers/sehuatang-cache'

/**
 * SEHUATANG_CACHE_PUT 入参校验（ADR-024 D2）——纯函数层测试。
 *
 * 只验证 `validateCachePutEntries` / `normalizeCacheField`，不触 IndexedDB
 * （DB 层由 sehuatang-cache.spec.ts 覆盖）。这些上限是本轮 umreview 新增的
 * 防御面：超批量拒绝、非法 tid 丢弃、超长字段降级为 null。
 */

test.describe('normalizeCacheField — 字段归一化', () => {
  test('合法字符串原样返回', () => {
    expect(normalizeCacheField('https://img.test/a.jpg')).toBe('https://img.test/a.jpg')
  })

  test('非字符串 / 空串 / null / undefined → null', () => {
    expect(normalizeCacheField(123)).toBeNull()
    expect(normalizeCacheField(null)).toBeNull()
    expect(normalizeCacheField(undefined)).toBeNull()
    expect(normalizeCacheField('')).toBeNull()
    expect(normalizeCacheField({})).toBeNull()
  })

  test('边界：恰好 MAX_FIELD_LEN 通过，超出 1 字符 → null', () => {
    expect(normalizeCacheField('a'.repeat(MAX_FIELD_LEN))).toBe('a'.repeat(MAX_FIELD_LEN))
    expect(normalizeCacheField('a'.repeat(MAX_FIELD_LEN + 1))).toBeNull()
  })

  test('长磁力链（数千字符，含多 tracker）仍保留', () => {
    const magnet = `magnet:?xt=urn:btih:${'a'.repeat(40)}${'&tr=udp://tracker.test:80'.repeat(40)}`
    expect(magnet.length).toBeGreaterThan(1000)
    expect(magnet.length).toBeLessThan(MAX_FIELD_LEN)
    expect(normalizeCacheField(magnet)).toBe(magnet)
  })
})

test.describe('validateCachePutEntries — 批量校验', () => {
  test('非数组 → 拒绝', () => {
    const v = validateCachePutEntries('nope')
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.error).toContain('must be an array')
  })

  test('空数组 → 通过且零条目', () => {
    const v = validateCachePutEntries([])
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.entries).toEqual([])
  })

  test('超过 MAX_PUT_ENTRIES → 整批拒绝（不静默截断）', () => {
    const entries = Array.from({ length: MAX_PUT_ENTRIES + 1 }, (_, i) => ({ tid: `t${i}` }))
    const v = validateCachePutEntries(entries)
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.error).toContain(`> ${MAX_PUT_ENTRIES}`)
  })

  test('恰好 MAX_PUT_ENTRIES → 通过', () => {
    const entries = Array.from({ length: MAX_PUT_ENTRIES }, (_, i) => ({ tid: `t${i}` }))
    const v = validateCachePutEntries(entries)
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.entries).toHaveLength(MAX_PUT_ENTRIES)
  })

  test('非法 tid 条目被丢弃（缺失 / 空串 / 超长 / 非字符串 / null）', () => {
    const v = validateCachePutEntries([
      { tid: 'ok-1' },
      { tid: '' },
      { tid: 'x'.repeat(MAX_TID_LEN + 1) },
      { tid: 123 },
      { tid: null },
      null,
      undefined,
      { tid: 'ok-2' },
    ])
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.entries.map((e) => e.tid)).toEqual(['ok-1', 'ok-2'])
  })

  test('超长字段降级为 null，记录本身保留', () => {
    const v = validateCachePutEntries([
      { tid: 't1', imageUrl: 'a'.repeat(MAX_FIELD_LEN + 1), magnetLink: 'magnet:?xt=urn:btih:abc' },
    ])
    expect(v.ok).toBe(true)
    if (v.ok) {
      expect(v.entries[0]!.imageUrl).toBeNull()
      expect(v.entries[0]!.magnetLink).toBe('magnet:?xt=urn:btih:abc')
    }
  })

  test('服务端统一盖 cachedAt（忽略客户端传入值）', () => {
    const v = validateCachePutEntries([{ tid: 't1', cachedAt: 1 }])
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.entries[0]!.cachedAt).toBeGreaterThan(1)
  })
})
