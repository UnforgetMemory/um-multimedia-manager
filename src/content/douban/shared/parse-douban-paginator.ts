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

/** 解析豆瓣 `.paginator` 元素，返回页码链接与上一页/下一页 URL。传入 null 时返回空默认值。 */
export function parseDoubanPaginator(paginatorEl: Element | null): DoubanPaginatorResult {
  const pageLinks: { label: string; url: string; current: boolean }[] = []
  let prevPageUrl = ''
  let nextPageUrl = ''
  if (paginatorEl) {
    Array.from(paginatorEl.children).forEach((child) => {
      const tag = child.tagName
      const cls = (child as HTMLElement).className || ''
      if (tag === 'SPAN' && cls.includes('prev')) {
        const a = child.querySelector<HTMLAnchorElement>('a')
        if (a) prevPageUrl = a.getAttribute('href') ?? a.href
        return
      }
      if (tag === 'SPAN' && cls.includes('next')) {
        const a = child.querySelector<HTMLAnchorElement>('a')
        if (a) nextPageUrl = a.getAttribute('href') ?? a.href
        return
      }
      if (tag === 'SPAN' && cls.includes('thispage')) {
        const text = child.textContent?.trim() ?? ''
        const num = parseInt(text, 10)
        if (!isNaN(num)) pageLinks.push({ label: text, url: '', current: true })
        return
      }
      if (tag === 'A') {
        const a = child as HTMLAnchorElement
        const text = a.textContent?.trim()
        const href = a.getAttribute('href') ?? a.href
        if (!text || !href) return
        const num = parseInt(text, 10)
        if (!isNaN(num)) pageLinks.push({ label: text, url: href, current: false })
      }
    })
  }
  return { pageLinks, prevPageUrl, nextPageUrl }
}
