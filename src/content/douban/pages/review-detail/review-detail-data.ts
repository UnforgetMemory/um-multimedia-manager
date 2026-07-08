import type { ReviewDetailData } from './types'

function parseRating(className: string): number {
  const m = className.match(/allstar(\d+)/)
  if (!m) return 0
  return parseInt(m[1], 10) / 10
}

/**
 * Extract review detail data from the native Douban review page DOM.
 * Returns null if the page structure doesn't match expectations.
 * Uses textContent (not innerHTML) for all extractions to prevent XSS.
 */
export function extractReviewDetailData(): ReviewDetailData | null {
  try { return _extractReviewDetailData() }
  catch (err) { console.warn('[UMM] Error extracting review detail:', err); return null }
}

function _extractReviewDetailData(): ReviewDetailData | null {
  const doc = window.document

  // Review ID from URL
  const url = doc.location.href
  const idMatch = url.match(/\/review\/(\d+)/)
  const id = idMatch?.[1] ?? ''
  if (!id) return null

  const reviewUrl = url

  // Title
  const titleEl = doc.querySelector('h1 span[property="v:summary"]')
  const title = titleEl?.textContent?.trim() ?? ''

  // Author
  const avatarImg = doc.querySelector<HTMLImageElement>('a.avatar.author-avatar img')
  const avatarUrl = avatarImg?.src ?? ''
  const authorUrl = avatarImg?.closest('a')?.getAttribute('href') ?? ''
  const authorIdMatch = authorUrl.match(/\/people\/([^/?]+)/)
  const authorId = authorIdMatch?.[1] ?? ''

  const authorNameEl = doc.querySelector('header.main-hd a span')
  const authorName = authorNameEl?.textContent?.trim() ?? ''

  // Rating
  const ratingEl = doc.querySelector<HTMLElement>('[class*="allstar"]')
  const rating = ratingEl ? parseRating(ratingEl.className) : 0

  // Date & location
  const dateEl = doc.querySelector('div.main-meta span[content]')
  const date = dateEl?.getAttribute('content') ?? dateEl?.textContent?.trim() ?? ''
  const locationEl = doc.querySelector('div.main-meta > span:last-child')
  const location = locationEl?.textContent?.trim() ?? ''
  // Skip if location is the same as date
  const finalLocation = location === date ? '' : location

  // Content paragraphs
  const paragraphs: string[] = []
  const contentEl = doc.querySelector('.review-content.clearfix')
  if (contentEl) {
    contentEl.querySelectorAll('p').forEach((p) => {
      const text = p.textContent?.trim() ?? ''
      if (text) paragraphs.push(text)
    })
  }

  // Stats
  let readCount = 0
  let source = ''
  doc.querySelectorAll('.main-author span').forEach((sp) => {
    const txt = sp.textContent?.trim() ?? ''
    const readM = txt.match(/(\d+)人阅读/)
    if (readM) readCount = parseInt(readM[1], 10)
    if (txt.includes('来自')) source = txt
  })

  // Useful / useless
  let usefulCount = 0
  let uselessCount = 0
  const usefulBtn = doc.querySelector<HTMLElement>('.btn.useful_count')
  if (usefulBtn) {
    const m = usefulBtn.textContent?.match(/(\d+)/)
    if (m) usefulCount = parseInt(m[1], 10)
  }
  const uselessBtn = doc.querySelector<HTMLElement>('.btn.useless_count')
  if (uselessBtn) {
    const m = uselessBtn.textContent?.match(/(\d+)/)
    if (m) uselessCount = parseInt(m[1], 10)
  }

  // Subject info (sidebar)
  const posterImg = doc.querySelector<HTMLImageElement>('.subject-img img')
  const posterUrl = posterImg?.src ?? ''

  const subjectLink = doc.querySelector<HTMLAnchorElement>('.subject-title a')
  const subjectUrl = subjectLink?.href ?? ''
  const subjectTitle = subjectLink?.textContent?.trim()?.replace(/^>\s*/, '') ?? ''

  let director = ''
  let cast = ''
  let genre = ''
  let region = ''
  let releaseDate = ''

  doc.querySelectorAll('.subject-info .info-item').forEach((item) => {
    const key = item.querySelector('.info-item-key')?.textContent?.trim() ?? ''
    const val = item.querySelector('.info-item-val')?.textContent?.trim() ?? ''
    if (key.includes('导演')) director = val
    else if (key.includes('主演')) cast = val
    else if (key.includes('类型')) genre = val
    else if (key.includes('地区')) region = val
    else if (key.includes('上映')) releaseDate = val
  })

  return {
    id, title, reviewUrl,
    authorName, authorId, authorUrl, avatarUrl,
    subjectTitle, subjectUrl, posterUrl,
    rating, paragraphs,
    date, location: finalLocation,
    readCount, source,
    usefulCount, uselessCount,
    director, cast, genre, region, releaseDate,
  }
}