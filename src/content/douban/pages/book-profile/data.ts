/**
 * Book profile DOM extractors.
 *
 * Parses book.douban.com/people/{uid}/ HTML to extract user info,
 * reading collections, recent activity, reviews, and doulists.
 */
import type { BookProfileData, BookItem, AuthorItem, RecentReadingItem, ReviewItem, DoulistItem, UserInfo, NavItem } from './types'

/**
 * Parse rating from CSS class like "allstar50" → 5.0
 */
function parseRating(className: string): number {
  const m = className.match(/allstar(\d+)/)
  if (!m) return 0
  return parseInt(m[1], 10) / 10
}

/**
 * Extract user basic info from the sidebar `.book-user-profile`.
 */
function extractUserInfo(): UserInfo | null {
  const url = location.href
  const uidMatch = url.match(/\/people\/([^/?]+)/)
  const userId = uidMatch?.[1]
  if (!userId) return null

  // Avatar
  const avatarImg = document.querySelector<HTMLImageElement>('.book-user-profile .avatar')
  const avatarUrl = avatarImg?.src ?? ''

  // Display name
  const usernameEl = document.querySelector('.book-user-profile .username')
  const displayName = usernameEl?.textContent?.trim() ?? `用户 ${userId}`

  // Join date
  const plEl = document.querySelector('.book-user-profile .time-registered')
  const plText = plEl?.textContent ?? ''
  const joinMatch = plText.match(/(\d{4}-\d{2}-\d{2})/)
  const joinDate = joinMatch?.[1] ?? ''

  // Stats from sidebar
  let readCount = 0
  let reviewCount = 0
  document.querySelectorAll('.book-user-profile .number-item').forEach(el => {
    const label = el.querySelector('.number-label')?.textContent?.trim()
    const numText = el.querySelector('.number')?.textContent?.trim()
    const num = numText ? parseInt(numText, 10) : 0
    if (label === '读过') readCount = num
    else if (label === '书评') reviewCount = num
  })

  return { userId, displayName, avatarUrl, joinDate, readCount, reviewCount }
}

/**
 * Parse a book cover grid section (e.g. 读过, 想读).
 * Returns items and total count from the header link.
 */
function extractBookGrid(sectionSelector: string): { items: BookItem[]; total: number } {
  const items: BookItem[] = []
  let total = 0

  // Total count from h2 span.pl a
  const section = document.querySelector(sectionSelector)
  if (!section) return { items, total }

  const countLink = section.querySelector('h2 .pl a')
  if (countLink) {
    const countMatch = countLink.textContent?.match(/(\d+)/)
    if (countMatch) total = parseInt(countMatch[1], 10)
  }

  // Book cards from .sub-list .list-s li
  section.querySelectorAll('.sub-list .list-s li').forEach(li => {
    const link = li.querySelector<HTMLAnchorElement>('a.cover')
    if (!link) return
    const href = link.href || link.getAttribute('href') || ''
    const subjectMatch = href.match(/\/subject\/(\d+)/)
    if (!subjectMatch) return
    const subjectId = subjectMatch[1]
    const img = link.querySelector<HTMLImageElement>('img')
    const coverUrl = img?.src || ''
    const title = img?.getAttribute('title') || img?.alt || ''
    items.push({ subjectId, title, coverUrl, href })
  })

  return { items, total }
}

/**
 * Parse the 收藏的作者 section.
 */
function extractAuthors(): AuthorItem[] {
  const authors: AuthorItem[] = []
  const authorSection = document.querySelector('#author')
  if (!authorSection) return authors

  authorSection.querySelectorAll('.sub-list li').forEach(li => {
    const link = li.querySelector<HTMLAnchorElement>('a.cover')
    if (!link) return
    const href = link.href || link.getAttribute('href') || ''
    const authorMatch = href.match(/\/author\/(\d+)/)
    if (!authorMatch) return
    const authorId = authorMatch[1]
    const img = link.querySelector<HTMLImageElement>('img')
    const avatarUrl = img?.src || ''
    const nameLink = li.querySelector<HTMLAnchorElement>('a:not(.cover)')
    const name = nameLink?.textContent?.trim() || ''
    authors.push({ authorId, name, avatarUrl, href })
  })

  return authors
}

/**
 * Parse the 最近阅读 (recent reading activity) timeline from the sidebar.
 */
function extractRecentReading(): RecentReadingItem[] {
  const items: RecentReadingItem[] = []
  let currentDate = ''

  // Find the sidebar .mod with "最近阅读" h2
  const mods = Array.from(document.querySelectorAll('.aside .mod'))
  const recentMod = mods.find(mod => {
    const h2 = mod.querySelector('h2')
    return h2?.textContent?.includes('最近阅读') ?? false
  })
  if (!recentMod) return items

  recentMod.querySelectorAll('.mbt > li').forEach(li => {
    // Date separator
    if (li.classList.contains('contact-update-time')) {
      const dateEl = li.querySelector('.pl')
      if (dateEl) currentDate = dateEl.textContent?.trim() || ''
      return
    }

    // Reading entry
    if (li.classList.contains('mbtrmini')) {
      const starb = li.querySelector('.starb')
      if (!starb) return
      const pl = starb.querySelector('.pl')
      const plText = pl?.textContent?.trim() || ''

      // Determine action type
      let action: RecentReadingItem['action'] = 'read'
      if (plText.includes('评论') || plText.includes('写了')) {
        action = 'review'
      } else if (plText.includes('想读')) {
        action = 'wish'
      }

      // Subject link
      const subjectLink = starb.querySelector<HTMLAnchorElement>('a')
      const title = subjectLink?.textContent?.trim() || ''
      const href = subjectLink?.href || ''
      const subjectMatch = href.match(/\/subject\/(\d+)/)
      const subjectId = subjectMatch?.[1] || ''

      // Rating
      const starEl = li.querySelector<HTMLElement>('[class*="stars"]')
      let rating = 0
      if (starEl) {
        const starMatch = starEl.className.match(/stars(\d)/)
        if (starMatch) rating = parseInt(starMatch[1], 10)
      }

      // Quote text
      const quoteEl = li.querySelector('.quote .inq')
      const quote = quoteEl?.textContent?.trim() || ''

      items.push({ date: currentDate, action, subjectId, title, href, rating, quote })
    }
  })

  return items
}

/**
 * Parse the 书评 (reviews) section.
 */
function extractReviews(): ReviewItem[] {
  const reviews: ReviewItem[] = []
  const reviewSection = document.querySelector('.comment-m')
  if (!reviewSection) return reviews

  reviewSection.querySelectorAll('.tlst').forEach(tlst => {
    // Cover image
    const coverLink = tlst.querySelector<HTMLAnchorElement>('.ilst a[href*="/subject/"]')
    const coverImg = tlst.querySelector<HTMLImageElement>('.ilst img')
    const coverUrl = coverImg?.src || ''
    const subjectUrl = coverLink?.href || ''
    const subjectTitle = coverLink?.getAttribute('title') || ''

    // Review title & link
    const titleLink = tlst.querySelector<HTMLAnchorElement>('.nlst h3 a')
    const title = titleLink?.textContent?.trim() || ''
    const url = titleLink?.href || ''
    const idMatch = url.match(/\/review\/(\d+)/)
    const id = idMatch?.[1] || ''

    // Rating
    const starEl = tlst.querySelector<HTMLElement>('.clst [class*="allstar"]')
    const rating = starEl ? parseRating(starEl.className) : 0

    // Excerpt
    const excerptEl = tlst.querySelector('.review-short')
    const excerpt = excerptEl?.textContent?.trim() || ''

    if (id && title) {
      reviews.push({ id, title, url, subjectTitle, subjectUrl, coverUrl, rating, excerpt })
    }
  })

  return reviews
}

/**
 * Parse the 图书豆列 (book doulists) section from the sidebar.
 */
function extractDoulists(): DoulistItem[] {
  const items: DoulistItem[] = []

  const dlMods = Array.from(document.querySelectorAll('.aside .mod'))
  const doulistMod = dlMods.find(mod => {
    const h2 = mod.querySelector('h2')
    return h2?.textContent?.includes('图书豆列') ?? false
  })
  if (!doulistMod) return items

  doulistMod.querySelectorAll('.list-m li').forEach(li => {
    const link = li.querySelector<HTMLAnchorElement>('a')
    if (!link) return
    const title = link.textContent?.trim() || ''
    const url = link.href || ''
    // Recommend count
    const recEl = li.querySelector('.rec')
    const recText = recEl?.textContent?.trim() || ''
    const recMatch = recText.match(/(\d+)/)
    const recommendCount = recMatch ? parseInt(recMatch[1], 10) : 0
    items.push({ title, url, recommendCount })
  })

  return items
}

/**
 * Parse the nav-list tabs from #db-usr-profile.
 */
function extractNavItems(): NavItem[] {
  const items: NavItem[] = []
  document.querySelectorAll('#db-usr-profile .nav-list > li').forEach(li => {
    const link = li.querySelector<HTMLAnchorElement>('a')
    if (link) {
      items.push({ label: link.textContent?.trim() || '', url: link.href, active: false })
    } else if (li.classList.contains('user-profile-nav-activated')) {
      items.push({ label: li.textContent?.trim() || '', url: '', active: true })
    }
  })
  return items
}

/**
 * Full extraction of the book user profile page.
 */
export function extractBookProfileData(): BookProfileData | null {
  const user = extractUserInfo()
  if (!user) return null

  const navItems = extractNavItems()

  // 读过 section — first child of #db-book-mine
  const readResult = extractBookGrid('#db-book-mine > div:first-child')

  // 想读 section — second child of #db-book-mine
  const wishResult = extractBookGrid('#db-book-mine > div:nth-child(2)')

  const authors = extractAuthors()
  const recentReading = extractRecentReading()
  const reviews = extractReviews()
  const doulists = extractDoulists()

  return {
    user,
    navItems,
    readBooks: readResult.items,
    readTotal: readResult.total || user.readCount,
    wishBooks: wishResult.items,
    wishTotal: wishResult.total,
    authors,
    recentReading,
    reviews,
    doulists,
  }
}
