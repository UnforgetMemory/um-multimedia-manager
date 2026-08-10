import { test, expect } from '@playwright/test'
import { JSDOM } from 'jsdom'
import { parseDoubanPaginator } from '@/content/douban/shared/parse-douban-paginator'

/**
 * 豆瓣 `.paginator` DOM 解析纯函数测试（audit §2.2 T4）。
 *
 * 覆盖从 5 处重复实现中提取的公共契约（book-authors / book-reviews / doulists /
 * user-celebrities / user-reviews 的 .paginator 块，逻辑逐字节相同）：
 * - `span.prev > a` → prevPageUrl（getAttribute('href') 优先，缺省回退 a.href）
 * - `span.next > a` → nextPageUrl
 * - `span.thispage` 数字文本 → pageLinks.push({ label, url: '', current: true })
 * - 直接 `a` 子节点数字文本 → pageLinks.push({ label, url: href, current: false })
 * - 其余（break span / link / 非数字文本）一律忽略
 */

const PAGINATOR_HTML = `
  <div class="paginator">
    <span class="prev">
      <link rel="prev" href="?start=0&amp;sort=time&amp;rating=all&amp;filter=all">
      <a href="?start=0&amp;sort=time&amp;rating=all&amp;filter=all">&lt;前页</a>
    </span>
    <span class="thispage" data-total-page="500">1</span>
    <a href="?start=20&amp;sort=time&amp;rating=all&amp;filter=all">2</a>
    <a href="?start=40&amp;sort=time&amp;rating=all&amp;filter=all">3</a>
    <a href="?start=60&amp;sort=time&amp;rating=all&amp;filter=all">4</a>
    <span class="break">...</span>
    <a href="?start=9980&amp;sort=time&amp;rating=all&amp;filter=all">500</a>
    <span class="next">
      <link rel="next" href="?start=20&amp;sort=time&amp;rating=all&amp;filter=all">
      <a href="?start=20&amp;sort=time&amp;rating=all&amp;filter=all">后页&gt;</a>
    </span>
  </div>
`

const DOUBAN_URL = 'https://movie.douban.com/people/xx/reviews'

function paginatorFromHtml(html: string): Element | null {
  const dom = new JSDOM(html, { url: DOUBAN_URL })
  return dom.window.document.querySelector('.paginator')
}

test.describe('parseDoubanPaginator — 豆瓣 .paginator 解析契约', () => {
  test('完整分页器 → 输出与 5 处重复实现一致（prev/next/thispage/数字页码）', () => {
    expect(parseDoubanPaginator(paginatorFromHtml(PAGINATOR_HTML))).toEqual({
      pageLinks: [
        { label: '1', url: '', current: true },
        { label: '2', url: 'https://movie.douban.com/people/xx/reviews?start=20&sort=time&rating=all&filter=all', current: false },
        { label: '3', url: 'https://movie.douban.com/people/xx/reviews?start=40&sort=time&rating=all&filter=all', current: false },
        { label: '4', url: 'https://movie.douban.com/people/xx/reviews?start=60&sort=time&rating=all&filter=all', current: false },
        { label: '500', url: 'https://movie.douban.com/people/xx/reviews?start=9980&sort=time&rating=all&filter=all', current: false },
      ],
      prevPageUrl: 'https://movie.douban.com/people/xx/reviews?start=0&sort=time&rating=all&filter=all',
      nextPageUrl: 'https://movie.douban.com/people/xx/reviews?start=20&sort=time&rating=all&filter=all',
    })
  })

  test('null → 空默认值', () => {
    expect(parseDoubanPaginator(null)).toEqual({ pageLinks: [], prevPageUrl: '', nextPageUrl: '' })
  })

  test('无子元素的分页器 → 空默认值', () => {
    expect(parseDoubanPaginator(paginatorFromHtml('<div class="paginator"></div>'))).toEqual({
      pageLinks: [],
      prevPageUrl: '',
      nextPageUrl: '',
    })
  })

  test('prev/next span 内无 a → 对应 URL 保持空串', () => {
    expect(
      parseDoubanPaginator(paginatorFromHtml('<div class="paginator"><span class="prev"></span><span class="next"></span></div>')),
    ).toEqual({ pageLinks: [], prevPageUrl: '', nextPageUrl: '' })
  })

  test('thispage 非数字文本 → 不加入 pageLinks', () => {
    expect(parseDoubanPaginator(paginatorFromHtml('<div class="paginator"><span class="thispage">…</span></div>'))).toEqual({
      pageLinks: [],
      prevPageUrl: '',
      nextPageUrl: '',
    })
  })

  test('直接 a 子节点非数字文本（如 "后页"）→ 跳过', () => {
    expect(parseDoubanPaginator(paginatorFromHtml('<div class="paginator"><a href="?start=20">后页</a></div>'))).toEqual({
      pageLinks: [],
      prevPageUrl: '',
      nextPageUrl: '',
    })
  })

  test('非 SPAN/A 子节点（link / break span）→ 忽略', () => {
    expect(
      parseDoubanPaginator(paginatorFromHtml('<div class="paginator"><link rel="prev" href="/prev"><span class="break">...</span></div>')),
    ).toEqual({ pageLinks: [], prevPageUrl: '', nextPageUrl: '' })
  })

  test('prev span 的 a 缺 href 属性 → getAttribute 为 null，回退 a.href（jsdom 中为空串）', () => {
    const dom = new JSDOM('<div class="paginator"><span class="prev"><a>前页</a></span></div>', { url: DOUBAN_URL })
    const el = dom.window.document.querySelector('.paginator')
    const result = parseDoubanPaginator(el)
    // 契约：getAttribute('href') 优先，缺省回退 a.href；
    // 无 href 属性的 <a> 在 jsdom 中 a.href 解析为空串（浏览器为 baseURI，代码路径一致）。
    expect(result.prevPageUrl).toBe('')
    expect(result.nextPageUrl).toBe('')
    expect(result.pageLinks).toEqual([])
  })

  test('直接 a 子节点缺 href 属性 → href 为空，整条跳过（不进 pageLinks）', () => {
    const dom = new JSDOM('<div class="paginator"><a>2</a></div>', { url: DOUBAN_URL })
    const el = dom.window.document.querySelector('.paginator')
    const result = parseDoubanPaginator(el)
    expect(result.pageLinks).toEqual([])
    expect(result.prevPageUrl).toBe('')
    expect(result.nextPageUrl).toBe('')
  })
})
