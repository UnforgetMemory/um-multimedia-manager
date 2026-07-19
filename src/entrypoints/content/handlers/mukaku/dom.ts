// ─── DOM 提取辅助函数 ──────────────────────────────────

/**
 * 提取 Mukaku 视频 ID
 */
export function extractMvId(value: string | HTMLElement): string | null {
  const raw = typeof value === 'string' ? value : value.getAttribute('href') || value.textContent || ''
  const match = raw.match(/\/mv\/(\d+)/i)
  return match ? match[1] : null
}

/**
 * 从 DOM 中提取关联的 Douban/IMDb ID
 */
export function extractLinkedIdsFromDOM(root: HTMLElement | Document): {
  doubanId: string | null
  imdbId: string | null
} {
  const result = { doubanId: null as string | null, imdbId: null as string | null }

  const links = root.querySelectorAll('a[href*="douban.com/subject/"], a[href*="imdb.com/title/"]')

  for (const link of Array.from(links)) {
    const anchor = link as HTMLAnchorElement
    const href = anchor.href || anchor.getAttribute('href') || ''

    if (!result.doubanId) {
      const match = href.match(/movie\.douban\.com\/subject\/(\d+)/i)
      if (match) result.doubanId = match[1]
    }

    if (!result.imdbId) {
      const match = href.match(/imdb\.com\/title\/((?:tt)?\d+)/i)
      if (match) {
        const id = match[1]
        result.imdbId = id.startsWith('tt') ? id : `tt${id}`
      }
    }

    if (result.doubanId && result.imdbId) break
  }

  return result
}