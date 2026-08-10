import { test, expect } from '@playwright/test'
import { JSDOM } from 'jsdom'
import { parseDoubanPaginator, parseDoubanPaginatorDetail } from '@/content/douban/shared/parse-douban-paginator'

/**
 * 富契约分页解析（audit §2.2 T4 第二波，2026-08-08 H3）。
 *
 * doulist-detail / series / game-collect 三处手写解析器（字节近同的富版：
 * thispage + data-total-page + 排序 + currentPage/totalPages）在共享薄版
 * parseDoubanPaginator 抽取之后新生。本 spec 先锁定富版契约，再迁移消费者。
 */

const RICH_PAGINATOR_HTML = `
  <div class="paginator">
    <span class="prev"><a href="?start=0">‹ 前页</a></span>
    <span class="thispage" data-total-page="500">1</span>
    <a href="?start=20">2</a>
    <a href="?start=40">3</a>
    <span class="break">...</span>
    <a href="?start=9980">500</a>
    <span class="next"><a href="?start=20">后页 ›</a></span>
  </div>
`

function paginatorFromHtml(html: string): Element | null {
  const dom = new JSDOM(html, { url: 'https://movie.douban.com/subject/1292052/' })
  return dom.window.document.querySelector('.paginator')
}

test.describe('parseDoubanPaginatorDetail — 富契约', () => {
  test('完整分页器 → currentPage/totalPages/pages 排序+thispage 插入+prev/next', () => {
    expect(parseDoubanPaginatorDetail(paginatorFromHtml(RICH_PAGINATOR_HTML))).toEqual({
      currentPage: 1,
      totalPages: 500,
      prevUrl: 'https://movie.douban.com/subject/1292052/?start=0',
      nextUrl: 'https://movie.douban.com/subject/1292052/?start=20',
      pages: [
        { label: '1', url: '', current: true },
        { label: '2', url: 'https://movie.douban.com/subject/1292052/?start=20', current: false },
        { label: '3', url: 'https://movie.douban.com/subject/1292052/?start=40', current: false },
        { label: '500', url: 'https://movie.douban.com/subject/1292052/?start=9980', current: false },
      ],
    })
  })

  test('thispage 标签不在页码列表中 → 插入排序位置', () => {
    const html = `
      <div class="paginator">
        <span class="thispage">3</span>
        <a href="?start=40">4</a>
        <a href="?start=60">5</a>
      </div>
    `
    const result = parseDoubanPaginatorDetail(paginatorFromHtml(html))
    expect(result.currentPage).toBe(3)
    expect(result.pages.map(p => p.label)).toEqual(['3', '4', '5'])
    expect(result.pages[0]).toEqual({ label: '3', url: '', current: true })
  })

  test('无 data-total-page → totalPages 默认 1', () => {
    const html = '<div class="paginator"><span class="thispage">2</span></div>'
    const result = parseDoubanPaginatorDetail(paginatorFromHtml(html))
    expect(result.currentPage).toBe(2)
    expect(result.totalPages).toBe(1)
  })

  test('无分页器 → 空默认值', () => {
    expect(parseDoubanPaginatorDetail(null)).toEqual({
      currentPage: 1,
      totalPages: 1,
      prevUrl: '',
      nextUrl: '',
      pages: [],
    })
  })

  test('无 thispage → currentPage 保持 1', () => {
    const html = '<div class="paginator"><a href="?start=20">2</a></div>'
    const result = parseDoubanPaginatorDetail(paginatorFromHtml(html))
    expect(result.currentPage).toBe(1)
    expect(result.pages).toEqual([{ label: '2', url: 'https://movie.douban.com/subject/1292052/?start=20', current: false }])
  })

  test('prev/next 无 a → URL 空串', () => {
    const html = '<div class="paginator"><span class="prev"></span><span class="next"></span></div>'
    const result = parseDoubanPaginatorDetail(paginatorFromHtml(html))
    expect(result.prevUrl).toBe('')
    expect(result.nextUrl).toBe('')
  })

  test('薄版契约保持兼容（回归锚点）', () => {
    const thin = parseDoubanPaginator(paginatorFromHtml(RICH_PAGINATOR_HTML))
    expect(thin.pageLinks).toHaveLength(4)
    expect(thin.prevPageUrl).toBe('https://movie.douban.com/subject/1292052/?start=0')
    expect(thin.nextPageUrl).toBe('https://movie.douban.com/subject/1292052/?start=20')
  })
})
