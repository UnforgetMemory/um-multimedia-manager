import { test, expect } from '@playwright/test'
import { derivePageHref, windowPages, type PagerLink } from '@/entrypoints/content/handlers/sehuatang-paging'

/**
 * 色花堂分页功能逻辑（sehuatang-paging）纯函数测试。
 *
 * 覆盖：页 href 模板推导（短链/长链/保留 filter 参数/非法样例）、窗口化页码
 * （首尾锚点、间隙省略号、相邻区间合并、边界、单页、无 pages 数据推导）。
 */

const PAGES_1: PagerLink[] = [
  { label: '2', page: 2, href: 'https://www.sehuatang.net/forum-103-2.html', last: false },
  { label: '3', page: 3, href: 'https://www.sehuatang.net/forum-103-3.html', last: false },
  { label: '... 1495', page: 1495, href: 'https://www.sehuatang.net/forum-103-1495.html', last: true },
]

test.describe('derivePageHref — 页 href 模板推导', () => {
  test('短链 forum-103-2.html → 替换页码', () => {
    expect(derivePageHref('https://www.sehuatang.net/forum-103-2.html', 1494))
      .toBe('https://www.sehuatang.net/forum-103-1494.html')
  })

  test('长链 page=N → 替换 N', () => {
    expect(derivePageHref('https://www.sehuatang.net/forum.php?mod=forumdisplay&fid=103&page=2', 7))
      .toBe('https://www.sehuatang.net/forum.php?mod=forumdisplay&fid=103&page=7')
  })

  test('typeid 过滤长链 → 保留 filter 参数只换 page', () => {
    expect(derivePageHref('https://www.sehuatang.net/forum.php?mod=forumdisplay&fid=103&filter=typeid&typeid=480&page=2', 5))
      .toBe('https://www.sehuatang.net/forum.php?mod=forumdisplay&fid=103&filter=typeid&typeid=480&page=5')
  })

  test('空串 / 未知形态 → null', () => {
    expect(derivePageHref('', 3)).toBeNull()
    expect(derivePageHref('https://www.sehuatang.net/forum.php?mod=viewthread&tid=1', 3)).toBeNull()
  })

  test('非法页码（0/负/非整数）→ null', () => {
    expect(derivePageHref('https://www.sehuatang.net/forum-103-2.html', 0)).toBeNull()
    expect(derivePageHref('https://www.sehuatang.net/forum-103-2.html', -3)).toBeNull()
    expect(derivePageHref('https://www.sehuatang.net/forum-103-2.html', 1.5)).toBeNull()
  })
})

test.describe('windowPages — 窗口化页码', () => {
  test('中部页：1 … cur±2 … last，href 优先映射、缺失推导', () => {
    const items = windowPages(PAGES_1, 6, 1495)
    expect(items).toEqual([
      { page: 1, href: 'https://www.sehuatang.net/forum-103-1.html', kind: 'page' },
      { page: 0, href: null, kind: 'gap' },
      { page: 4, href: 'https://www.sehuatang.net/forum-103-4.html', kind: 'page' },
      { page: 5, href: 'https://www.sehuatang.net/forum-103-5.html', kind: 'page' },
      { page: 6, href: 'https://www.sehuatang.net/forum-103-6.html', kind: 'page' },
      { page: 7, href: 'https://www.sehuatang.net/forum-103-7.html', kind: 'page' },
      { page: 8, href: 'https://www.sehuatang.net/forum-103-8.html', kind: 'page' },
      { page: 0, href: null, kind: 'gap' },
      { page: 1495, href: 'https://www.sehuatang.net/forum-103-1495.html', kind: 'page' },
    ])
  })

  test('第 1 页：窗口与首锚点合并，无前置间隙', () => {
    const items = windowPages(PAGES_1, 1, 1495)
    expect(items.map((i) => i.kind)).toEqual(['page', 'page', 'page', 'gap', 'page'])
    expect(items.map((i) => i.page)).toEqual([1, 2, 3, 0, 1495])
  })

  test('末页：窗口与尾锚点合并，无后置间隙', () => {
    const items = windowPages(PAGES_1, 1494, 1495)
    expect(items.map((i) => i.page)).toEqual([1, 0, 1492, 1493, 1494, 1495])
  })

  test('小论坛 total=8：窗口半径覆盖全页时全展开无间隙', () => {
    const items = windowPages(PAGES_1, 4, 8, 4)
    expect(items.map((i) => i.page)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(items.every((i) => i.kind === 'page')).toBe(true)
  })

  test('total=1 → 单页', () => {
    expect(windowPages(PAGES_1, 1, 1).map((i) => i.page)).toEqual([1])
  })

  test('total=0 且无数据 → 空数组', () => {
    expect(windowPages([], 0, 0)).toEqual([])
  })

  test('无 pages 数据但有 total：href 全部为 null 仍窗口化', () => {
    const items = windowPages([], 3, 10)
    expect(items.map((i) => i.page)).toEqual([1, 2, 3, 4, 5, 0, 10])
    expect(items.every((i) => i.href === null)).toBe(true)
  })
})
