/**
 * Book homepage DOM extractors.
 *
 * Parses the native book.douban.com/ HTML structure to extract
 * books, rankings, and activities for the UMM overlay.
 */

import type { BookActivityItem, BookExpressItem, PopularBookItem } from './types'

function sanitizeHref(href: string): string {
  try {
    const url = new URL(href, window.location.origin)
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.href
  } catch { /* invalid URL */ }
  return ''
}

/**
 * Extract subject ID from a URL path matching /subject/{id}.
 */
function extractSubjectIdFromUrl(url: string): string | null {
  const match = url.match(/\/subject\/(\d+)/)
  return match ? match[1] : null
}

/**
 * Parse the 新书速递 (New Books Express) carousel.
 *
 * Selector: `.section.books-express .list-express li`
 * Each item contains:
 *   - .cover a[href] + img[src]
 *   - .info .title a[title]
 *   - .info .author (text)
 *   - .more-meta p: first span.author, span.year, span.publisher
 *
 * Skips `.ui-slide-item-duplicate` (swiper clones).
 */
export function parseBookExpress(): BookExpressItem[] {
  const items: BookExpressItem[] = []
  const seenSubjectIds = new Set<string>()

  document.querySelectorAll('.section.books-express .list-express li').forEach(li => {
    const coverLink = li.querySelector('.cover a') as HTMLAnchorElement | null
    if (!coverLink) return

    const href = sanitizeHref(coverLink.href || coverLink.getAttribute('href') || '')
    if (!href) return

    const subjectId = extractSubjectIdFromUrl(href)
    if (!subjectId || seenSubjectIds.has(subjectId)) return
    seenSubjectIds.add(subjectId)

    const coverImg = coverLink.querySelector('img')
    const coverUrl = coverImg?.getAttribute('src') || ''

    const titleEl = li.querySelector('.info .title a')
    const title = titleEl?.getAttribute('title') || titleEl?.textContent?.trim() || ''

    const authorEl = li.querySelector('.info .author')
    const author = authorEl?.textContent?.trim() || ''

    const yearEl = li.querySelector('.more-meta p .year')
    const year = yearEl?.textContent?.trim()

    const publisherEl = li.querySelector('.more-meta p .publisher')
    const publisher = publisherEl?.textContent?.trim()

    items.push({ subjectId, title, author, coverUrl, posterUrl: coverUrl, href, year, publisher, rate: '' })
  })

  return items
}

/**
 * Parse the 每月热门图书榜 (Monthly Popular Books) ranking.
 *
 * Selector: `.section.popular-books .list-summary li`
 * Each item:
 *   - .rank-info strong.green-num-box — rank number
 *   - .rank-info .trend-info .trend — trend (up/down/new class)
 *   - .rank-info .rank-value — previous rank
 *   - .cover a[href] + img[src]
 *   - .info h4.title a — title + link
 *   - .info .entry-star-small .average-rating — rating
 *   - .info .author — author text
 *   - .info .subject-tags .tag — tags
 */
export function parsePopularBooks(): PopularBookItem[] {
  const items: PopularBookItem[] = []

  document.querySelectorAll('.section.popular-books .list-summary > li').forEach(li => {
    const rankEl = li.querySelector('.rank-info strong.green-num-box')
    const rank = parseInt(rankEl?.textContent?.trim() || '0', 10)
    if (!rank) return

    const trendEl = li.querySelector('.rank-info .trend')
    let trend: PopularBookItem['trend'] = 'same'
    if (trendEl) {
      if (trendEl.classList.contains('up')) trend = 'up'
      else if (trendEl.classList.contains('down')) trend = 'down'
      else if (trendEl.classList.contains('new')) trend = 'new'
    }

    const prevRankEl = li.querySelector('.rank-info .rank-value')
    const prevRank = prevRankEl ? parseInt(prevRankEl.textContent?.trim() || '0', 10) : undefined

    const coverLink = li.querySelector('.cover a') as HTMLAnchorElement | null
    if (!coverLink) return
    const href = sanitizeHref(coverLink.href || coverLink.getAttribute('href') || '')
    if (!href) return

    const subjectId = extractSubjectIdFromUrl(href)
    if (!subjectId) return

    const coverImg = coverLink.querySelector('img')
    const coverUrl = coverImg?.getAttribute('src') || ''

    const titleA = li.querySelector('.info h4.title a') as HTMLAnchorElement | null
    const title = titleA?.textContent?.trim() || ''

    const ratingEl = li.querySelector('.info .average-rating')
    const rating = ratingEl?.textContent?.trim() || ''

    const authorEl = li.querySelector('.info .author')
    const author = authorEl?.textContent?.trim().replace(/^作者[：:]\s*/, '') || ''

    const tagEls = li.querySelectorAll('.info .subject-tags .tag')
    const tags: string[] = []
    tagEls.forEach(tag => {
      const text = tag.textContent?.trim()
      if (text) tags.push(text)
    })

    items.push({ rank, subjectId, title, author, rating, coverUrl, href, tags, trend, prevRank })
  })

  return items
}

/**
 * Parse the 读书活动 (Reading Activities) carousel.
 *
 * Selector: `.section.books-activities .book-activity`
 * Each item:
 *   - a.book-activity[href]
 *   - .book-activity-info .book-activity-title
 *   - .book-activity-label
 *   - .book-activity-time time
 *   - Background image from style attribute
 */
export function parseBookActivities(): BookActivityItem[] {
  const items: BookActivityItem[] = []

  document.querySelectorAll('.section.books-activities .book-activity').forEach(el => {
    const anchor = el as HTMLAnchorElement
    const href = sanitizeHref(anchor.href || anchor.getAttribute('href') || '')
    if (!href) return

    const titleEl = el.querySelector('.book-activity-title')
    const title = titleEl?.textContent?.trim() || ''

    // Extract background image from style attribute
    const style = anchor.getAttribute('style') || ''
    const bgMatch = style.match(/url\(['"]?(.*?)['"]?\)/)
    const coverUrl = bgMatch?.[1] || ''

    const labelEl = el.querySelector('.book-activity-label')
    const label = labelEl?.textContent?.trim() || ''

    const timeEl = el.querySelector('.book-activity-time time')
    const date = timeEl?.textContent?.trim() || ''

    items.push({ title, href, coverUrl, label, date })
  })

  return items
}
