import type { BookCollectData, BookCollectItem } from './types'

/** Determine collection sub-type (collect/wish/doing) from the page URL */
function getSubTypeFromUrl(url: string): BookCollectData['subType'] {
  if (url.includes('/wish') || url.includes('status=wish')) return 'wish'
  if (url.includes('/do') || url.includes('status=do')) return 'doing'
  return 'collect'
}

/**
 * Extract all visible book collection data from the current Douban page DOM.
 * Returns null if the page structure doesn't match expectations.
 */
export function extractBookCollectData(): BookCollectData | null {
  try { return _extractBookCollectData() }
  catch (err) { console.warn('[UMM] Error extracting book collect:', err); return null }
}

/** Internal extraction — separated so the public wrapper can catch errors */
function _extractBookCollectData(): BookCollectData | null {
  const url = location.href
  const subType = getSubTypeFromUrl(url)

  // User ID
  const uidMatch = url.match(/\/people\/([^/?]+)/)
  const userId = uidMatch?.[1] ?? ''

  // User profile
  const avatarEl = document.querySelector<HTMLImageElement>('#db-usr-profile .pic img')
  const avatarUrl = avatarEl?.src ?? ''
  const displayName = avatarEl?.getAttribute('alt') ?? userId

  // Nav links
  const navLinks: { label: string; url: string }[] = []
  document.querySelectorAll('#db-usr-profile .info ul li a').forEach((a) => {
    const href = a.getAttribute('href') ?? ''
    const text = a.textContent?.trim()
    if (text && href) {
      navLinks.push({ label: text, url: href })
    }
  })

  // Sort options
  const sortOptions: { label: string; url: string; active: boolean }[] = []
  const sortGroup = document.querySelector('.opt-bar .sort')
  if (sortGroup) {
    sortGroup.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent?.trim()
        if (text && text !== '·') {
          sortOptions.push({ label: text, url: '', active: true })
        }
      } else if (node instanceof HTMLAnchorElement || (node as Element).tagName === 'A') {
        const a = node as HTMLAnchorElement
        const text = a.textContent?.trim()
        const href = a.getAttribute('href') ?? a.href
        if (text && href) {
          sortOptions.push({ label: text, url: href, active: false })
        }
      }
    })
  }

  // Page info
  let currentPage = ''
  let total = 0
  const numEl = document.querySelector('.subject-num')
  if (numEl) {
    const text = numEl.textContent ?? ''
    const pageMatch = text.match(/^([\d\-]+)\s*\/\s*([\d,]+)/)
    if (pageMatch) {
      currentPage = pageMatch[1]
      total = parseInt(pageMatch[2].replace(/,/g, ''), 10)
    }
  }
  if (total === 0) {
    const h1 = document.querySelector('#db-usr-profile h1')
    const h1Text = h1?.textContent ?? ''
    const countMatch = h1Text.match(/\((\d+)\)/)
    if (countMatch) total = parseInt(countMatch[1], 10)
  }

  // Mode
  const mode: 'grid' | 'list' = document.querySelector('.grid-on') ? 'grid' : 'list'

  // Paginator
  const pageLinks: { label: string; url: string; current: boolean }[] = []
  let prevPageUrl = ''
  let nextPageUrl = ''
  const paginator = document.querySelector('.paginator')
  if (paginator) {
    Array.from(paginator.children).forEach((child) => {
      const tag = child.tagName
      const cls = (child as HTMLElement).className || ''
      if (tag === 'SPAN' && (cls.includes('prev') || cls.includes('next'))) {
        const a = child.querySelector<HTMLAnchorElement>('a')
        if (!a) return
        const href = a.getAttribute('href') ?? a.href
        if (cls.includes('next')) nextPageUrl = href
        else prevPageUrl = href
        return
      }
      if (tag === 'SPAN' && cls.includes('thispage')) {
        const text = child.textContent?.trim() ?? ''
        const num = parseInt(text, 10)
        if (!isNaN(num)) pageLinks.push({ label: text, url: '', current: true })
        return
      }
      if (tag === 'SPAN') return
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
    subType, userId, displayName, avatarUrl, navLinks,
    sortOptions, currentPage, total, mode, items,
    pageLinks, prevPageUrl, nextPageUrl,
  }
}
