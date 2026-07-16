import type { BookReviewDetailData } from './types'

/** Parse Douban "allstarN" class name → 0-10 rating scale */
function parseRating(className: string): number {
  const m = className.match(/allstar(\d+)/)
  if (!m) return 0
  return parseInt(m[1], 10) / 10
}

/**
 * Extract book review detail data from the native Douban book review page DOM.
 * Returns null if the page structure doesn't match expectations.
 * Uses textContent (not innerHTML) for all extractions to prevent XSS.
 */
export function extractBookReviewDetailData(): BookReviewDetailData | null {
  try { return _extractBookReviewDetailData() }
  catch (err) { console.warn('[UMM] Error extracting book review detail:', err); return null }
}

function _extractBookReviewDetailData(): BookReviewDetailData | null {
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

  let author = ''
  let publisher = ''
  let pages = ''

  doc.querySelectorAll('.subject-info .info-item').forEach((item) => {
    const key = item.querySelector('.info-item-key')?.textContent?.trim() ?? ''
    const val = item.querySelector('.info-item-val')?.textContent?.trim() ?? ''
    if (key.includes('作者')) author = val
    else if (key.includes('出版')) publisher = val
    else if (key.includes('页数')) pages = val
  })

  return {
    id, title, reviewUrl,
    authorName, authorId, authorUrl, avatarUrl,
    subjectTitle, subjectUrl, posterUrl,
    rating, paragraphs,
    date, location: finalLocation,
    readCount, source,
    usefulCount, uselessCount,
    author, publisher, pages,
  }
}
