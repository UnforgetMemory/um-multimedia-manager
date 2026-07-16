import type { UserMediaPageData, UserMediaNavLink, UserMediaSortOption, UserMediaFilterGroup, UserMediaItem } from './types'

export function extractUserMediaData(): UserMediaPageData | null {
  const url = location.href

  // ---- subType ----
  let subType: UserMediaPageData['subType'] = 'collect'
  if (url.includes('/wish') || url.includes('status=wish')) subType = 'wish'
  else if (url.includes('/do') || url.includes('status=do')) subType = 'doing'

  // ---- userId ----
  let uidMatch = url.match(/\/people\/([^/?]+)/)
  let userId = uidMatch?.[1] ?? ''

  // Fallback: extract userId from profile links on /mine pages
  if (!userId) {
    const profileLink = document.querySelector<HTMLAnchorElement>('#db-usr-profile .info ul li a[href*="/people/"]')
    const href = profileLink?.getAttribute('href') ?? ''
    const m = href.match(/\/people\/([^/?]+)/)
    userId = m?.[1] ?? ''
  }

  // ---- User profile (from sidebar + #db-usr-profile) ----
  const avatarEl = document.querySelector<HTMLImageElement>('#db-usr-profile .pic img, .side-info-avatar img')
  const avatarUrl = avatarEl?.src ?? ''

  const nameEl = document.querySelector('.side-info-txt h3')
  const displayName = nameEl?.textContent?.trim() ?? userId

  // ---- Navigation links ----
  const navLinks: UserMediaNavLink[] = []
  document.querySelectorAll('#db-usr-profile .info ul li a').forEach((a) => {
    const href = a.getAttribute('href') ?? ''
    const text = a.textContent?.trim()
    if (text && href && text !== '|') {
      navLinks.push({ label: text, url: href })
    }
  })

  // ---- Sort options ----
  const sortOptions: UserMediaSortOption[] = []
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
    // Handle teen dots between items
    // The actual structure is: TEXT · <a> · <a>
  }

  // ---- Filter groups ----
  const filterGroups: UserMediaFilterGroup[] = []
  document.querySelectorAll<HTMLDivElement>('.tabs-more').forEach((group) => {
    const labelEl = group.querySelector('span.gray')
    const label = labelEl?.textContent?.trim().replace(/[:：]\s*$/, '') ?? ''
    const currentEl = group.querySelector('.lnk-tab-more span')
    const current = currentEl?.textContent?.trim() ?? ''
    const items: { label: string; url: string }[] = []
    const list = group.querySelector('ul.tabs-more-list')
    if (list) {
      list.querySelectorAll<HTMLAnchorElement>('a').forEach((a) => {
        const text = a.textContent?.trim()
        const href = a.getAttribute('href') ?? a.href
        if (text && href) items.push({ label: text, url: href })
      })
    }
    if (label) {
      filterGroups.push({ label, current, items })
    }
  })

  // ---- Page info ----
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
  // Fallback: parse total from #db-usr-profile h1 title "(N)"
  if (total === 0) {
    const titleEl = document.querySelector('#db-usr-profile h1')
    const titleText = titleEl?.textContent ?? ''
    const countMatch = titleText.match(/\((\d+)\)/)
    if (countMatch) {
      total = parseInt(countMatch[1], 10)
    }
  }

  // ---- Mode (grid/list) ----
  const mode: 'grid' | 'list' = document.querySelector('.grid-on') ? 'grid' : 'list'

  // ---- Paginator ----
  const pageLinks: { label: string; url: string; current: boolean }[] = []
  let prevPageUrl = ''
  let nextPageUrl = ''
  const paginator = document.querySelector('.paginator')
  if (paginator) {
    Array.from(paginator.children).forEach((child) => {
      const tag = child.tagName
      const cls = (child as HTMLElement).className || ''
      // <span class="prev"><a href="...">‹</a></span>
      if (tag === 'SPAN' && (cls.includes('prev') || cls.includes('next'))) {
        const a = child.querySelector<HTMLAnchorElement>('a')
        if (!a) return
        const href = a.getAttribute('href') ?? a.href
        if (cls.includes('next')) nextPageUrl = href
        else prevPageUrl = href
        return
      }
      // <span class="thispage">98</span>
      if (tag === 'SPAN' && cls.includes('thispage')) {
        const text = child.textContent?.trim() ?? ''
        const num = parseInt(text, 10)
        if (!isNaN(num)) {
          pageLinks.push({ label: text, url: '', current: true })
        }
        return
      }
      // <span class="break">...</span> — skip
      if (tag === 'SPAN') return
      // <a href="...">N</a> — numeric page link
      if (tag === 'A') {
        const a = child as HTMLAnchorElement
        const text = a.textContent?.trim()
        const href = a.getAttribute('href') ?? a.href
        if (!text || !href) return
        const num = parseInt(text, 10)
        if (!isNaN(num)) {
          pageLinks.push({ label: text, url: href, current: false })
        }
      }
    })
  }

  // ---- Items ----
  const items: UserMediaItem[] = []
  const itemEls = document.querySelectorAll('.grid-view .item, .list-view .item')
  itemEls.forEach((el) => {
    const link = el.querySelector<HTMLAnchorElement>('.title a, .info a[href*="/subject/"]')
    const href = link?.getAttribute('href') ?? ''
    const subjectMatch = href.match(/\/subject\/(\d+)/)
    const subjectId = subjectMatch?.[1]
    if (!subjectId) return

    const img = el.querySelector<HTMLImageElement>('.pic img, .nbg img')
    const posterUrl = img?.src ?? ''

    const ratingEl = el.querySelector<HTMLElement>('[class*="rating"]')
    const ratingClass = ratingEl?.className ?? ''
    const ratingMatch = ratingClass.match(/rating(\d)-t/)
    const rating = ratingMatch ? ratingMatch[1] : '0'

    const dateEl = el.querySelector('.date')
    const date = dateEl?.textContent?.trim() ?? ''

    const commentEl = el.querySelector('.comment')
    const comment = commentEl?.textContent?.trim() ?? ''

    const emEl = link?.querySelector('em')
    const title = emEl?.textContent?.trim() ?? link?.textContent?.trim() ?? ''

    items.push({ subjectId, title, posterUrl, rating, date, comment, url: href })
  })

  if (items.length === 0 && total > 0) return null

  // Fallback: if subject-num parsing failed but items + paginator exist
  if (total === 0 && items.length > 0 && pageLinks.length > 0) {
    const lastLink = pageLinks[pageLinks.length - 1]
    if (lastLink.url) {
      const startMatch = lastLink.url.match(/start=(\d+)/)
      if (startMatch) {
        total = parseInt(startMatch[1], 10) + items.length
      }
    }
  }

  return {
    subType, userId, displayName, avatarUrl, navLinks,
    sortOptions, filterGroups, currentPage, total, mode, items,
    pageLinks, prevPageUrl, nextPageUrl,
  }
}
