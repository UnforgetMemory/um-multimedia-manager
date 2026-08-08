import { extractCollectPageShell } from '@/content/douban/shared/douban-extract'
import type { BookCollectData, BookCollectItem } from './types'

/**
 * Extract all visible book collection data from the current Douban page DOM.
 * Returns null if the page structure doesn't match expectations.
 */
export function extractBookCollectData(): BookCollectData | null {
  try { return _extractBookCollectData() }
  catch (err: unknown) { console.warn('[UMM] Error extracting book collect:', err); return null }
}

/** Internal extraction — separated so the public wrapper can catch errors */
function _extractBookCollectData(): BookCollectData | null {
  const shell = extractCollectPageShell(document)
  let { total, pageLinks } = shell

  // Items
  const items: BookCollectItem[] = []
  const itemEls = document.querySelectorAll('ul.interest-list > li.subject-item')
  itemEls.forEach((el) => {
    const link = el.querySelector<HTMLAnchorElement>('.info h2 a')
    const href = link?.getAttribute('href') ?? ''
    const subjectMatch = href.match(/\/subject\/(\d+)/)
    const subjectId = subjectMatch?.[1]
    if (!subjectId) return

    const img = el.querySelector<HTMLImageElement>('.pic .nbg img')
    const posterUrl = img?.src ?? ''

    const title = link?.getAttribute('title') ?? link?.textContent?.trim() ?? ''

    const pubEl = el.querySelector('.pub')
    const pubInfo = pubEl?.textContent?.trim() ?? ''

    const dateEl = el.querySelector('.short-note .date')
    const date = dateEl?.textContent?.trim() ?? ''

    const commentEl = el.querySelector('.comment.comment-item')
    const comment = commentEl?.textContent?.trim() ?? ''

    items.push({ subjectId, title, posterUrl, date, comment, url: href, pubInfo })
  })

  if (items.length === 0 && total > 0) return null
  if (total === 0 && items.length > 0 && pageLinks.length > 0) {
    const lastLink = pageLinks[pageLinks.length - 1]
    if (lastLink.url) {
      const startMatch = lastLink.url.match(/start=(\d+)/)
      if (startMatch) total = parseInt(startMatch[1], 10) + items.length
    }
  }

  return {
    subType: shell.subType,
    userId: shell.userId,
    displayName: shell.displayName,
    avatarUrl: shell.avatarUrl,
    navLinks: shell.navLinks,
    sortOptions: shell.sortOptions,
    currentPage: shell.currentPage,
    total,
    mode: shell.mode,
    items,
    pageLinks,
    prevPageUrl: shell.prevPageUrl,
    nextPageUrl: shell.nextPageUrl,
  }
}
