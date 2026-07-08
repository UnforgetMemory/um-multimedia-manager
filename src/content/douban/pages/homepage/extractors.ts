import type { BillboardItem, HotSectionItem, ReviewItem, ScreeningItem } from './types'
import { extractSubjectId } from '@/content/douban/shared/extract-subject-id'

function sanitizeHref(href: string): string {
  try {
    const url = new URL(href, window.location.origin)
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.href
  } catch { /* invalid URL */ }
  return ''
}

/**
 * Parse screening items from `#screening .ui-slide-item`.
 *
 * - Skips `.ui-slide-item-duplicate` (hidden clones)
 * - Deduplicates by subjectId via a Set
 * - Groups by `data-dstat-areaid` (e.g. `"70_0"` → page 0)
 * - Extracts title/rate/starNum/intro from `data-*` attributes
 * - Extracts poster and link from `.poster a`
 * - Returns items sorted by groupIndex
 */
export function parseScreeningItems(): ScreeningItem[] {
  const items: ScreeningItem[] = []
  const seenSubjectIds = new Set<string>()
  let currentGroupIndex = 0

  document.querySelectorAll('#screening .ui-slide-item').forEach(item => {
    const el = item as HTMLElement
    if (el.classList.contains('ui-slide-item-duplicate')) return

    const dstat = el.dataset.dstatAreaid || ''
    if (dstat) {
      const parts = dstat.split('_')
      currentGroupIndex = parseInt(parts[parts.length - 1] || '0', 10)
    }

    const subjectId = extractSubjectId(item)
    if (!subjectId || seenSubjectIds.has(subjectId)) return
    seenSubjectIds.add(subjectId)

    const title = el.dataset.title || ''
    const rate = el.dataset.rate || ''
    const starNum = el.dataset.star || '00'
    const intro = el.dataset.intro || ''

    const posterLink = item.querySelector('.poster a')
    let posterUrl = ''
    let posterAlt = ''
    let href = ''
    if (posterLink) {
      href = sanitizeHref((posterLink as HTMLAnchorElement).href || posterLink.getAttribute('href') || '')
      const imgEl = posterLink.querySelector('img')
      posterUrl = imgEl?.getAttribute('src') || ''
      posterAlt = imgEl?.getAttribute('alt') || title
    }

    items.push({ groupIndex: currentGroupIndex, subjectId, title, rate, starNum, intro, posterUrl, posterAlt, href })
  })

  items.sort((a, b) => a.groupIndex - b.groupIndex)
  return items
}

/**
 * Parse billboard items from `#billboard table tr`.
 *
 * Each row has:
 * - `td.order` — ranking number
 * - `td.title a` — movie title and link
 *
 * Subject ID is extracted from links inside the row.
 */
export function parseBillboardItems(): BillboardItem[] {
  const items: BillboardItem[] = []

  document.querySelectorAll('#billboard table tr').forEach(row => {
    const orderTd = row.querySelector('td.order')
    const titleTd = row.querySelector('td.title')
    if (!orderTd || !titleTd) return

    const titleLink = titleTd.querySelector('a')
    if (!titleLink) return

    const order = orderTd.textContent?.trim() || ''
    const title = titleLink.textContent?.trim() || ''
    const href = sanitizeHref((titleLink as HTMLAnchorElement).href || titleLink.getAttribute('href') || '')
    const subjectId = extractSubjectId(row)

    if (!subjectId) return
    items.push({ order, title, href, subjectId })
  })

  return items
}

/**
 * Parse hot section items from a swiper carousel selector.
 *
 * Selector example: `'.recent-hot-movie'` or `'.recent-hot-tv'`
 * Finds `.subject-card` inside non-duplicate swiper slides.
 *
 * Extracts:
 * - Cover image from `.subject-card-item-cover img`
 * - Title from `.subject-card-item-title-text`
 * - Rating from `.subject-card-item-rating-score`
 * - Link from the first `<a>` in the card
 * - Subject ID from any link inside the card
 * - Episodes info (optional) from `.subject-card-item-episodes-info`
 */
export function parseHotSection(selector: string): HotSectionItem[] {
  const items: HotSectionItem[] = []

  document.querySelectorAll(`${selector} .swiper-slide:not(.swiper-slide-duplicate) .subject-card`).forEach(card => {
    const subjectId = extractSubjectId(card)
    if (!subjectId) return

    const titleSpan = card.querySelector('.subject-card-item-title-text')
    const title = titleSpan?.textContent?.trim() || ''

    const ratingSpan = card.querySelector('.subject-card-item-rating-score')
    const rate = ratingSpan?.textContent?.trim() || ''

    const coverImg = card.querySelector('.subject-card-item-cover img')
    const posterUrl = coverImg?.getAttribute('src') || ''

    const link = card.querySelector('a')
    const href = sanitizeHref((link as HTMLAnchorElement)?.href || link?.getAttribute('href') || '')

    const episodesInfo = card.querySelector('.subject-card-item-episodes-info')
    const episodes = episodesInfo?.textContent?.trim()

    items.push({ subjectId, title, rate, posterUrl, href, ...(episodes ? { episodes } : {}) })
  })

  return items
}

/**
 * Parse review items from `#reviews .review`.
 *
 * Extracts subject ID and href from `.review-hd a[href*="/subject/"]`.
 */
export function parseReviewItems(): ReviewItem[] {
  const items: ReviewItem[] = []

  document.querySelectorAll('#reviews .review').forEach(review => {
    const movieLink = review.querySelector('.review-hd a')
    if (!movieLink) return

    const href = sanitizeHref((movieLink as HTMLAnchorElement).href || movieLink.getAttribute('href') || '')
    if (!href) return

    const match = href.match(/\/subject\/(\d+)/)
    if (!match) return

    items.push({ subjectId: match[1], href })
  })

  return items
}
