import type { UserReviewsData, UserReviewItem } from './types'

function parseRating(className: string): number {
  const m = className.match(/allstar(\d+)/)
  if (!m) return 0
  return parseInt(m[1], 10) / 10
}

export function extractUserReviewsData(): UserReviewsData | null {
  try { return _extractUserReviewsData() }
  catch (err) { console.warn('[UMM] Error extracting reviews:', err); return null }
}

function _extractUserReviewsData(): UserReviewsData | null {
  const doc = window.document
  const url = doc.location.href
  const uidMatch = url.match(/\/people\/([^/?]+)/)
  const userId = uidMatch?.[1] ?? ''

  // User info
  const avatarImg = document.querySelector<HTMLImageElement>('#db-usr-profile .pic img')
  const avatarUrl = avatarImg?.src ?? ''
  // h1 is "我的影评(1)" not the real name; use avatar alt
  const displayName = avatarImg?.getAttribute('alt') ?? userId

  const h1 = document.querySelector('#db-usr-profile .info h1')
  const h1Text = h1?.textContent?.trim() ?? ''
  const countMatch = h1Text.match(/\((\d+)\)/)
  const total = countMatch ? parseInt(countMatch[1], 10) : 0

  const navLinks: { label: string; url: string }[] = []
  document.querySelectorAll('#db-usr-profile .info ul li a').forEach((a) => {
    let href = a.getAttribute('href') ?? ''
    const text = a.textContent?.trim()
    if (text && href && text !== '|') {
      href = href.replace('https://www.douban.com', 'https://movie.douban.com')
      navLinks.push({ label: text, url: href })
    }
  })

  // Reviews - traverse from known-working element
  const items: UserReviewItem[] = []
  function findReviewContainers(): Element[] {
    const found: Element[] = []
    // Start from known-selector and walk
    const profile = doc.querySelector('#db-usr-profile')
    if (profile) {
      const grid = profile.closest('.grid-16-8')
      if (grid) {
        const article = grid.querySelector('.article > div')
        if (article) {
          article.querySelectorAll('ul').forEach((ul) => { found.push(ul) })
        }
      }
    }
    // If that fails, try body-level querySelectorAll for any ul with review-related content
    if (found.length === 0) {
      doc.querySelectorAll('ul').forEach((ul) => {
        const text = ul.textContent?.trim() ?? ''
        if (text.includes('影评') || text.includes('评论') || ul.querySelector('.nlst, .ilst, .clst, [class*="review"]')) {
          found.push(ul)
        }
      })
    }
    // Absolute last resort - querySelectorAll('*') and filter
    if (found.length === 0) {
      const all = doc.querySelectorAll('*')
      all.forEach((el) => {
        if (el.tagName === 'UL' && el.className && el.className.includes('tlst')) found.push(el)
      })
    }
    return found
  }

  const reviewLists = findReviewContainers()
  reviewLists.forEach((ul) => {
    const reviewIdMatch = ul.querySelector('[id^="review_"]')?.id?.match(/review_(\d+)/)
    const id = reviewIdMatch?.[1] ?? ''

    const titleEl = ul.querySelector<HTMLAnchorElement>('.nlst h3 > a')
    const title = titleEl?.textContent?.trim() ?? ''
    const reviewUrl = titleEl?.href ?? ''

    const posterImg = ul.querySelector<HTMLImageElement>('.ilst img')
    const posterUrl = posterImg?.src ?? ''

    const subjectLink = ul.querySelector<HTMLAnchorElement>('.ilst a[href*="/subject/"]')
    const subjectUrl = subjectLink?.href ?? ''
    const subjectTitle = subjectLink?.getAttribute('title') ?? ''

    // Rating
    const starEl = ul.querySelector<HTMLElement>('[class*="allstar"]')
    const rating = starEl ? parseRating(starEl.className) : 0

    // Content - prefer full, fallback to short
    const fullContent = ul.querySelector<HTMLElement>('.review-content p')
    const shortContent = ul.querySelector<HTMLElement>('.review-short span')
    const content = fullContent?.textContent?.trim() ?? shortContent?.textContent?.trim() ?? ''

    const authorEl = ul.querySelector('.starb a')
    const authorName = authorEl?.textContent?.trim() ?? ''

    // Stats
    let readCount = 0
    let source = ''
    const authorEls = ul.querySelectorAll('.main-author span')
    authorEls.forEach((sp) => {
      const txt = sp.textContent?.trim() ?? ''
      const readM = txt.match(/(\d+)人阅读/)
      if (readM) readCount = parseInt(readM[1], 10)
      if (txt.includes('来自')) source = txt
    })

    let usefulCount = 0
    let uselessCount = 0
    const usefulBtn = ul.querySelector<HTMLElement>('.useful_count')
    if (usefulBtn) {
      const m = usefulBtn.textContent?.match(/(\d+)/)
      if (m) usefulCount = parseInt(m[1], 10)
    }
    const uselessBtn = ul.querySelector<HTMLElement>('.useless_count')
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
