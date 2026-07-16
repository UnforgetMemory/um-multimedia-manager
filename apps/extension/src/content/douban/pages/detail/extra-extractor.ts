/**
 * Supplementary DOM extraction helpers for Douban detail pages.
 *
 * Covers celebrities, awards, rank, photos, recommendations (DOM only),
 * short comments, and book/music-specific sections.
 */
import DOMPurify from 'dompurify'
import type {
  CelebItem, PhotoItem, RecItem, ShortComment,
  BlockquoteItem, EditionItem,
} from './types'

/**
 * Extract celebrity (cast/crew/author) items.
 */
export function extractCelebrities(isMusic: boolean, isBook: boolean): {
  celebHeading: string
  celebItems: CelebItem[]
  celebCount: string
} {
  const celebEl = document.querySelector('#celebrities')
  const celebHeading = isMusic ? '表演者' : isBook ? '创作者' : '演职员'
  const celebItems: CelebItem[] = []
  if (celebEl) {
    celebEl.querySelectorAll('.celebrity').forEach((li) => {
      const nameEl = li.querySelector('.name a')
      const roleEl = li.querySelector('.role')
      const avatarEl = li.querySelector('.avatar') as HTMLElement | null
      const bgImg = avatarEl?.style.backgroundImage || ''
      const avatarUrl = bgImg.replace(/^url\(["']?/, '').replace(/["']?\)$/, '')
      celebItems.push({
        name: nameEl?.textContent?.trim() || '',
        role: roleEl?.textContent?.trim() || '',
        avatar: avatarUrl,
        link: (nameEl as HTMLAnchorElement)?.href || '',
      })
    })
  } else if (isBook) {
    document.querySelectorAll('#authors .author:not(.fake)').forEach((li) => {
      const imgEl = li.querySelector('.avatar') as HTMLImageElement | null
      const nameEl = li.querySelector('.name')
      const roleEl = li.querySelector('.role')
      const href = li.querySelector('.name')?.getAttribute('href') || ''
      celebItems.push({
        name: nameEl?.textContent?.trim() || '',
        role: roleEl?.textContent?.trim() || '',
        avatar: imgEl?.src || '',
        link: href,
      })
    })
  }

  const celebPl = celebEl?.querySelector('.pl')
  const celebCount = celebPl?.textContent?.trim().replace(/[()]/g, '') || ''
  return { celebHeading, celebItems, celebCount }
}

/**
 * Extract photos and trailer items from the page.
 */
export function extractPhotos(): {
  photoItems: PhotoItem[]
  photoCount: string
  trailerCount: string
} {
  const photoEl = document.querySelector('#related-pic')
  const photoItems: PhotoItem[] = []
  photoEl?.querySelectorAll('.related-pic-bd li').forEach((li) => {
    const videoEl = li.querySelector('.related-pic-video') as HTMLElement | null
    const imgEl = li.querySelector('img') as HTMLImageElement | null
    const linkEl = (li.querySelector('a') as HTMLAnchorElement) || null
    if (videoEl) {
      const bgImg = videoEl.style.backgroundImage || ''
      const src = bgImg.replace(/^url\(["']?/, '').replace(/["']?\)$/, '')
      photoItems.push({ src, link: linkEl?.href || '', isVideo: true })
    } else if (imgEl) {
      photoItems.push({ src: imgEl.src, link: linkEl?.href || '', isVideo: false })
    }
  })

  const photoPl = photoEl?.querySelector('h2 .pl')
  const photoPlText = photoPl?.textContent || ''
  const trailerMatch = photoPlText.match(/预告片(\d+)/)
  const photoMatch = photoPlText.match(/图片(\d+)/)
  const trailerCount = trailerMatch?.[1] || ''
  const photoCount = photoMatch?.[1] || ''
  return { photoItems, photoCount, trailerCount }
}

/**
 * Extract recommendation items from the DOM (no DB enrichment).
 */
export function extractRecItemsDom(): RecItem[] {
  const recEl = document.querySelector('#recommendations') || document.querySelector('#db-rec-section')
  const recItems: RecItem[] = []
  const container = recEl?.querySelector('.recommendations-bd, .content')
  ;(container || recEl)?.querySelectorAll('dl').forEach((dl) => {
    const img = dl.querySelector('dt img') as HTMLImageElement | null
    const linkEl = dl.querySelector('dd a') as HTMLAnchorElement | null
    const rate = dl.querySelector('.subject-rate')?.textContent?.trim() || ''
    const href = linkEl?.href || ''
    const idMatch = href.match(/\/subject\/(\d+)/)
    if (!idMatch) return
    recItems.push({
      title: linkEl?.textContent?.trim() || img?.alt || '',
      poster: (img?.src || '').replace(/s_ratio_poster/g, 'xl').replace(/\/([slm])(?:pic)?\//g, '/xl/'),
      rating: rate,
      link: href,
      subjectId: idMatch[1],
      recStatus: 0,
    })
  })
  return recItems
}

/**
 * Extract short comments from the page.
 */
export function extractShortComments(): ShortComment[] {
  const commentsSection = document.querySelector('#comments-section')
  const shortComments: ShortComment[] = []
  commentsSection?.querySelectorAll('.comment-item').forEach((item) => {
    const info = item.querySelector('.comment-info')
    const userEl = info?.querySelector('a') as HTMLAnchorElement | null
    const ratingEl = info?.querySelector('[class*="allstar"]')
    const cls = ratingEl?.className || ''
    const ratingMatch = cls.match(/allstar(\d)0/)
    const contentEl = item.querySelector('.short')
    const timeEl = info?.querySelector('.comment-time')
    const voteEl = item.querySelector('.votes')
    const avatarEl = item.querySelector('.avator img') as HTMLImageElement | null
    const rating = ratingMatch ? parseInt(ratingMatch[1], 10) : 0
    if (!userEl || !contentEl) return
    shortComments.push({
      user: userEl.textContent?.trim() || '',
      userLink: userEl.href || '',
      avatar: avatarEl?.src || '',
      rating,
      content: contentEl.textContent?.trim() || '',
      time: timeEl?.textContent?.trim() || '',
      votes: parseInt(voteEl?.textContent?.trim() || '0', 10) || 0,
    })
  })
  return shortComments
}

/**
 * Extract author bio HTML (books only).
 */
export function extractAuthorBio(): string {
  const h2s = document.querySelectorAll('h2')
  for (const h2 of h2s) {
    if (h2.textContent?.includes('作者简介')) {
      const indent = h2.nextElementSibling as HTMLElement | null
      const intro = indent?.querySelector('.intro')
      if (intro) {
        return DOMPurify.sanitize(intro.innerHTML)
      }
      break
    }
  }
  return ''
}

/**
 * Extract table-of-contents items (books only).
 *
 * Douban uses two patterns for truncated TOCs:
 *   1. `dir_XXXXXX_full` (hidden) + `dir_XXXXXX_short` (visible) — two divs
 *   2. <span class="all hidden"> + <span class="content">        — two spans
 *
 * Strategy: prefer the full-content element (pattern 1 _full div, then
 * pattern 2 .all span), then fall back to any element with id^="dir_".
 * Truncation indicators ("· · · · · · (更多)", "(收起)", etc.) are filtered
 * out.
 */
export function extractTOC(): string[] {
  const tocItems: string[] = []

  // Pattern 1: _full div (hidden but contains complete TOC)
  // Pattern 2: .all span (hidden, full content)
  // Fallback: any id^="dir_" element
  const dirEl =
    document.querySelector('[id$="_full"]')
    || document.querySelector('[id^="dir_"] .all, [id^="dir_"] > .all')
    || document.querySelector('[id^="dir_"]')

  if (!dirEl) return tocItems
  const html = dirEl.innerHTML

  const parts = html.split(/<br\s*\/?>/i)
  for (const part of parts) {
    const text = part.replace(/<[^>]+>/g, '').trim()
    if (!text) continue
    // Skip truncation indicators and control links
    if (/展开全部|折叠|\(收起\)|\(更多\)|·\s*·\s*·/.test(text)) continue
    tocItems.push(text)
  }
  return tocItems
}

/**
 * Extract track list items (music albums only).
 */
export function extractTrackItems(): string[] {
  const trackItems: string[] = []
  document.querySelectorAll('.track-list .track-items li').forEach(li => {
    const order = (li as HTMLElement).dataset.trackOrder || ''
    const text = li.textContent?.trim() || ''
    if (text) trackItems.push(order ? `${order} ${text}` : text)
  })
  return trackItems
}

/**
 * Extract blockquote items (books only — 原文摘录).
 */
export function extractBlockquotes(): BlockquoteItem[] {
  const blockquoteItems: BlockquoteItem[] = []
  document.querySelectorAll('.blockquote-list li').forEach((li) => {
    const figure = li.querySelector('figure')
    if (!figure) return
    const extra = figure.querySelector('.blockquote-extra')
    let text = ''
    if (extra) {
      const clone = figure.cloneNode(true) as HTMLElement
      clone.querySelector('.blockquote-extra')?.remove()
      text = clone.textContent?.replace(/\s+/g, ' ').trim() || ''
    } else {
      text = figure.textContent?.replace(/\s+/g, ' ').trim() || ''
    }
    const meta = extra?.querySelector('.blockquote-meta')
    const user = meta?.querySelector('.author-name')?.textContent?.trim() || ''
    const votesText = meta?.textContent?.match(/(\d+)赞/)?.[1] || '0'
    const figcaption = extra?.querySelector('figcaption')
    const source = figcaption?.getAttribute('title') || ''
    if (text) blockquoteItems.push({ text, user, source, votes: parseInt(votesText, 10) || 0 })
  })
  return blockquoteItems
}

/**
 * Extract other editions (books only — 其他版本).
 */
export function extractEditions(): EditionItem[] {
  const editionItems: EditionItem[] = []
  const h2s = document.querySelectorAll('h2')
  for (const h2 of h2s) {
    if (h2.textContent?.includes('其他版本')) {
      const ul = h2.nextElementSibling as HTMLElement | null
      if (ul && ul.tagName === 'UL') {
        ul.querySelectorAll('li.mb8').forEach((li) => {
          const link = li.querySelector('.meta a') as HTMLAnchorElement | null
          const countEl = li.querySelector('.count')
          const rating = countEl?.querySelector('span')?.textContent?.trim() || ''
          const count = countEl?.textContent?.replace(rating, '').trim() || ''
          if (link) editionItems.push({ title: link.textContent?.trim() || '', link: link.href, rating, count })
        })
      }
      break
    }
  }
  return editionItems
}
