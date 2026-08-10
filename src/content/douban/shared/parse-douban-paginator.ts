/**
 * 豆瓣 `.paginator` DOM 解析（TDD 抽取，见 audit §2.2 T4）。
 *
 * 从 5 处重复实现中提取的纯函数：
 * - src/content/douban/pages/book-authors/book-authors-data.ts
 * - src/content/douban/pages/book-reviews/book-reviews-data.ts
 * - src/content/douban/pages/doulists/doulists-data.ts
 * - src/content/douban/pages/user-celebrities/user-celebrities-data.ts
 * - src/content/douban/pages/user-reviews/user-reviews-data.ts
 */

export interface DoubanPaginatorResult {
  pageLinks: Array<{ label: string; url: string; current: boolean }>
  prevPageUrl: string
  nextPageUrl: string
}

/** 富契约结果：doulist-detail / series / game-collect 的手写解析器形态（H3 统一）。 */
export interface DoubanPaginatorDetail {
  currentPage: number
  totalPages: number
  prevUrl: string
  nextUrl: string
  pages: Array<{ label: string; url: string; current: boolean }>
}
/** 解析豆瓣 `.paginator` 元素，返回页码链接与上一页/下一页 URL。传入 null 时返回空默认值。 */
export function parseDoubanPaginator(paginatorEl: Element | null): DoubanPaginatorResult {
  const pageLinks: { label: string; url: string; current: boolean }[] = []
  let prevPageUrl = ''
  let nextPageUrl = ''
  if (paginatorEl) {
    Array.from(paginatorEl.children).forEach((child) => {
      const tag = child.tagName
      const cls = (child as HTMLElement).className || ''
      // Use a.href (browser-resolved) not getAttribute('href'): Douban paginator
      // anchors are relative (?start=N), which isSafeDoubanUrl would reject.
      if (tag === 'SPAN' && cls.includes('prev')) {
        const a = child.querySelector<HTMLAnchorElement>('a')
        if (a) prevPageUrl = a.href
        return
      }
      if (tag === 'SPAN' && cls.includes('next')) {
        const a = child.querySelector<HTMLAnchorElement>('a')
        if (a) nextPageUrl = a.href
        return
      }
      if (tag === 'SPAN' && cls.includes('thispage')) {
        const text = child.textContent?.trim() ?? ''
        const num = parseInt(text, 10)
        if (!isNaN(num)) pageLinks.push({ label: text, url: '', current: true })
        return
      }
      // Use a.href (browser-resolved) — ditto for relative ?start= links
      if (tag === 'A') {
        const a = child as HTMLAnchorElement
        const text = a.textContent?.trim()
        const href = a.href
        if (!text || !href) return
        const num = parseInt(text, 10)
        if (!isNaN(num)) pageLinks.push({ label: text, url: href, current: false })
      }
    })
  }
  return { pageLinks, prevPageUrl, nextPageUrl }
}

/**
 * 富契约分页解析（H3 2026-08-08）——在薄版 parseDoubanPaginator 之上补充：
 * - thispage 的 currentPage（文本）与 totalPages（data-total-page 属性）
 * - thispage 标签不在页码列表时按数字插入排序位置（current: true）
 * - 页码列表按数字升序排序（薄版保持 DOM 顺序）
 * 用于替换 doulist-detail / series / game-collect 的三处手写实现。
 */
export function parseDoubanPaginatorDetail(paginatorEl: Element | null): DoubanPaginatorDetail {
  const { pageLinks, prevPageUrl, nextPageUrl } = parseDoubanPaginator(paginatorEl)

  // thispage 标签（当前页，span 非 a）
  const thisPage = paginatorEl?.querySelector<HTMLElement>('.thispage')
  const thisPageLabel = thisPage?.textContent?.trim() ?? ''
  const currentPage = parseInt(thisPageLabel, 10) || 1
  const totalAttr = thisPage?.getAttribute('data-total-page')
  const totalPages = totalAttr ? (parseInt(totalAttr, 10) || 1) : 1

  // thispage 标签不在页码列表时插入排序位置
  // (The thin parser already includes the thispage entry; this push is a
  // malformed-DOM fallback when the thispage text is non-numeric.)
  const pages = [...pageLinks]
  if (thisPageLabel && !pages.some(p => p.label === thisPageLabel)) {
    pages.push({ label: thisPageLabel, url: '', current: true })
  }

  // 按数字升序排序
  pages.sort((a, b) => parseInt(a.label, 10) - parseInt(b.label, 10))

  return { currentPage, totalPages, prevUrl: prevPageUrl, nextUrl: nextPageUrl, pages }
}
