import type { BookReviewsData, BookReviewItem } from './types'

/** Parse Douban "allstarN" class name → 0-10 rating scale */
function parseRating(className: string): number {
  const m = className.match(/allstar(\d+)/)
  if (!m) return 0
  return parseInt(m[1], 10) / 10
}

/**
 * Extract all visible book reviews from the current Douban page DOM.
 * Returns null if the page structure doesn't match expectations.
 */
export function extractBookReviewsData(): BookReviewsData | null {
  try { return _extractBookReviewsData() }
  catch (err) { console.warn('[UMM] Error extracting book reviews:', err); return null }
}

/** Internal extraction — separated so the public wrapper can catch errors */
function _extractBookReviewsData(): BookReviewsData | null {
  const doc = window.document
  const url = doc.location.href
  const uidMatch = url.match(/\/people\/([^/?]+)/)
  const userId = uidMatch?.[1] ?? ''

  // User info
  const avatarImg = document.querySelector<HTMLImageElement>('#db-usr-profile .pic img')
  const avatarUrl = avatarImg?.src ?? ''
  const displayName = avatarImg?.getAttribute('alt') ?? userId

  const h1 = document.querySelector('#db-usr-profile .info h1')
  const h1Text = h1?.textContent?.trim() ?? ''
  const countMatch = h1Text.match(/\((\d+)\)/)
  const total = countMatch ? parseInt(countMatch[1], 10) : 0

  // Nav links - filter out '|' separators
  const navLinks: { label: string; url: string }[] = []
  document.querySelectorAll('#db-usr-profile .info ul li a').forEach((a) => {
    const href = a.getAttribute('href') ?? ''
    const text = a.textContent?.trim()
    if (text && href) {
      navLinks.push({ label: text, url: href })
    }
  })

  // Book review list — book.douban.com uses .tlst containers
  // Each review: .tlst > .ilst (cover) + .nlst (title) + .clst (content)
  const items: BookReviewItem[] = []
  function findReviewContainers(): Element[] {
    // Direct query for .tlst
    const tlstList = doc.querySelectorAll('.tlst')
    if (tlstList.length > 0) return Array.from(tlstList)

    // Fallback: look inside .article for any div with review-like content
    const article = doc.querySelector('.article > div')
    if (article) {
      const divs = article.querySelectorAll(':scope > div:not(.clear):not(.user-profile-nav)')
      const found: Element[] = []
      divs.forEach((div) => {
        if (div.querySelector('.ilst, .nlst, .clst, [class*="review"]')) found.push(div)
      })
      if (found.length > 0) return found
    }

    // Last resort — scan all divs
    const allDivs = doc.querySelectorAll('div')
    const found: Element[] = []
    allDivs.forEach((div) => {
      if (div.className && div.className.includes('tlst')) found.push(div)
    })
    return found
  }

  const reviewContainers = findReviewContainers()
  reviewContainers.forEach((container) => {
    const reviewIdMatch = container.querySelector('[id^="review_"]')?.id?.match(/review_(\d+)/)
    const id = reviewIdMatch?.[1] ?? ''

    // Title from .nlst h3 > a (direct child, skips expand arrow inside .rr div)
    const titleEl = container.querySelector<HTMLAnchorElement>('.nlst h3 > a')
    const title = titleEl?.textContent?.trim() ?? ''
    const reviewUrl = titleEl?.href ?? ''

    // Poster from .ilst
    const posterImg = container.querySelector<HTMLImageElement>('.ilst img')
    const posterUrl = posterImg?.src ?? ''

    // Subject link from .ilst a[href*="/subject/"] or .clst a[href*="/subject/"]
    let subjectLink = container.querySelector<HTMLAnchorElement>('.ilst a[href*="/subject/"]')
    if (!subjectLink) subjectLink = container.querySelector<HTMLAnchorElement>('.clst a[href*="/subject/"]')
    const subjectUrl = subjectLink?.href ?? ''
    const subjectTitle = subjectLink?.getAttribute('title') ?? container.querySelector<HTMLAnchorElement>('.ll.user a[href*="/subject/"]')?.textContent?.trim() ?? ''

    // Rating
    const starEl = container.querySelector<HTMLElement>('[class*="allstar"]')
    const rating = starEl ? parseRating(starEl.className) : 0

    // Content — short content span, or full content div
    const shortContent = container.querySelector<HTMLElement>('.review-short span')
    const fullContent = container.querySelector<HTMLElement>('.review-content p')
    const content = fullContent?.textContent?.trim() ?? shortContent?.textContent?.trim() ?? ''

    // Author name
    const authorEl = container.querySelector('.ll.user .starb a[href*="/people/"]')
    const authorName = authorEl?.textContent?.trim() ?? displayName

    // Stats — read count & source
    let readCount = 0
    let source = ''
    const metaSpans = container.querySelectorAll('.ll.user .starb span:not([class*="allstar"])')
    metaSpans.forEach((sp) => {
      const txt = sp.textContent?.trim() ?? ''
      const readM = txt.match(/(\d+)人阅读/)
      if (readM) readCount = parseInt(readM[1], 10)
      if (txt.includes('来自')) source = txt
    })

    // Useful / useless counts
    let usefulCount = 0
    let uselessCount = 0
    const usefulBtn = container.querySelector<HTMLElement>('.useful_count')
    if (usefulBtn) {
      const m = usefulBtn.textContent?.match(/(\d+)/)
      if (m) usefulCount = parseInt(m[1], 10)
    }
    const uselessBtn = container.querySelector<HTMLElement>('.useless_count')
    if (uselessBtn) {
      const m = uselessBtn.textContent?.match(/(\d+)/)
      if (m) uselessCount = parseInt(m[1], 10)
    }

    if (id && title) {
      items.push({
        id, title, reviewUrl, posterUrl, subjectTitle, subjectUrl,
        rating, content, authorName, usefulCount, uselessCount, readCount, source,
      })
    }
  })

  // Paginator
  const pageLinks: { label: string; url: string; current: boolean }[] = []
  let prevPageUrl = ''
  let nextPageUrl = ''
  const paginator = document.querySelector('.paginator')
  if (paginator) {
    Array.from(paginator.children).forEach((child) => {
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

  if (items.length === 0 && total === 0) return null

  return {
    userId, displayName, avatarUrl, navLinks, total, items,
    pageLinks, prevPageUrl, nextPageUrl,
  }
}
