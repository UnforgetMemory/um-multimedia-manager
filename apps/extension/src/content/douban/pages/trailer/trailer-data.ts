export interface TrailerItem {
  id: string
  title: string
  thumbnail: string
  duration: string
  link: string
  date: string
  type: 'trailer' | 'video_review'
  author?: string
  commentCount?: string
}

export interface TrailerPageData {
  title: string
  items: TrailerItem[]
  subjectId: string
  subjectTitle: string
  isDetail: boolean
  videoUrl: string
  date: string
  description: string
}

import { extractSubjectIdFromUrl } from '@/content/douban/shared/extract-subject-id'

/** Extract subject ID from URL path or page DOM */
function extractSubjectId(): string {
  const fromUrl = extractSubjectIdFromUrl()
  if (fromUrl) return fromUrl
  const subjectLink = document.querySelector<HTMLAnchorElement>('#content h1 a[href*="/subject/"]')
  if (subjectLink) {
    const m = subjectLink.getAttribute('href')?.match(/\/(\d+)\//)
    if (m) return m[1]
  }
  return ''
}

/** Is this a standalone /trailer/{id}/ or /video/{id}/ detail page */
function isDetail(): boolean {
  return /^\/(trailer|video)\/\d+/.test(window.location.pathname)
}

/** Extract trailers from the listing page (/subject/{id}/trailer) */
function extractListingTrailers(): TrailerItem[] {
  const items: TrailerItem[] = []

  // Trailers (.mod:has(h2#trailer) > ul.video-list)
  document.querySelectorAll('.mod:has(.hd h2#trailer) > ul.video-list > li').forEach((li) => {
    const link = li.querySelector<HTMLAnchorElement>('a.pr-video')
    const img = li.querySelector<HTMLImageElement>('a.pr-video img')
    const durEl = li.querySelector<HTMLElement>('strong em')
    const titleEl = li.querySelector<HTMLAnchorElement>('p a')
    const dateEl = li.querySelector<HTMLSpanElement>('p.trail-meta span')
    const commentEl = li.querySelector<HTMLAnchorElement>('p.trail-meta a')
    if (!link || !titleEl) return
    const href = link.getAttribute('href') || ''
    const id = href.match(/\/(\d+)\/?#?/)?.[1] || ''
    let thumbnail = ''
    if (img) {
      thumbnail = (img.getAttribute('data-src') || img.src || '').replace(
        /\/img\/trailer\/small\//, '/img/trailer/medium/'
      )
    }
    items.push({
      id,
      title: titleEl.textContent?.trim() || '',
      thumbnail,
      duration: durEl?.textContent?.trim() || '',
      link: href.startsWith('http') ? href : 'https://movie.douban.com' + href,
      date: dateEl?.textContent?.trim() || '',
      type: 'trailer',
      commentCount: commentEl?.textContent?.trim() || '',
    })
  })

  // Video reviews (.mod:has(h2#short_video) .video-list > ul.video-col3)
  document.querySelectorAll('.mod:has(.hd h2#short_video) .video-list > ul.video-col3 > li').forEach((li) => {
    const link = li.querySelector<HTMLAnchorElement>('a.pr-video')
    const img = li.querySelector<HTMLImageElement>('a.pr-video img')
    const durEl = li.querySelector<HTMLElement>('strong em')
    const titleEl = li.querySelector<HTMLAnchorElement>('p a')
    const authorEl = li.querySelector<HTMLAnchorElement>('p a[href*="/people/"]')
    const dateEl = li.querySelector<HTMLSpanElement>('p.trail-meta span')
    const commentEl = li.querySelector<HTMLAnchorElement>('p.trail-meta a')
    if (!link || !titleEl) return
    const href = link.getAttribute('href') || ''
    const id = href.match(/\/(\d+)\/?#?/)?.[1] || ''
    let thumbnail = ''
    if (img) {
      thumbnail = (img.getAttribute('data-src') || img.src || '')
    }
    items.push({
      id,
      title: titleEl.textContent?.trim() || '',
      thumbnail,
      duration: durEl?.textContent?.trim() || '',
      link: href.startsWith('http') ? href : 'https://movie.douban.com' + href,
      date: dateEl?.textContent?.trim() || '',
      type: 'video_review',
      author: authorEl?.textContent?.trim(),
      commentCount: commentEl?.textContent?.trim() || '',
    })
  })

  return items
}

/** Extract data from a standalone detail page (/trailer/{id}/ or /video/{id}/) */
function extractDetailTrailers(): TrailerItem[] {
  const items: TrailerItem[] = []

  // Playlist items from #video-list
  document.querySelectorAll('#video-list ul.video-list-col li').forEach((li) => {
    const link = li.querySelector<HTMLAnchorElement>('a.pr-video')
    const img = li.querySelector<HTMLImageElement>('a.pr-video img')
    const durEl = li.querySelector<HTMLElement>('strong')
    const titleEl = li.querySelector<HTMLElement>('strong')
    if (!link) return
    const href = link.getAttribute('href') || ''
    const id = href.match(/\/(\d+)\/?#?/)?.[1] || ''
    let thumbnail = ''
    const type = window.location.pathname.startsWith('/video/') ? 'video_review' : 'trailer'
    const imgSrc = img?.getAttribute('src') || img?.getAttribute('data-src') || ''
    if (type === 'trailer') {
      thumbnail = imgSrc.replace(/\/img\/trailer\/small\//, '/img/trailer/medium/')
    } else {
      thumbnail = imgSrc
    }
    items.push({
      id,
      title: titleEl?.textContent?.trim() || '',
      thumbnail,
      duration: durEl?.textContent?.trim() || '',
      link: href.startsWith('http') ? href : 'https://movie.douban.com' + href,
      date: '',
      type,
    })
  })

  return items
}

/** Extract video source URL from a detail page */
function extractVideoUrl(): string {
  // Try #player-html5 video source first (trailer pages)
  const video = document.querySelector<HTMLVideoElement>('#player video source, #movie_player source, [id^="player-html5"] video source, [id^="html5-video"] source')
  if (video?.src) return video.src
  // Try the LD+JSON structured data
  const ldJson = document.querySelector<HTMLScriptElement>('script[type="application/ld+json"]')
  if (ldJson) {
    try {
      const data = JSON.parse(ldJson.textContent || '')
      if (data.embedUrl) return data.embedUrl
    } catch { /* ignore */ }
  }
  return ''
}

/** Extract date from a detail page */
function extractDetailDate(): string {
  return document.querySelector<HTMLElement>('.trailer-info span, .video-duration, .video-info .video-duration')?.textContent?.trim() || ''
}

/** Extract description from a detail page */
function extractDetailDescription(): string {
  return document.querySelector<HTMLElement>('.video-desc')?.textContent?.trim() || ''
}

/** Extract all trailer/video data from the current page */
export function extractTrailerData(): TrailerPageData | null {
  const isDetailPage = isDetail()
  const subjectId = extractSubjectId()

  // Title from h1
  const h1 = document.querySelector('#content h1')
  const title = h1?.textContent?.trim() || ''

  // Subject title (from h1 a if present, otherwise h1 directly)
  const subjectLink = h1?.querySelector('a')
  const subjectTitle = subjectLink?.textContent?.trim() || title

  let items: TrailerItem[] = []
  if (isDetailPage) {
    items = extractDetailTrailers()
  } else {
    items = extractListingTrailers()
  }

  if (!items.length) return null

  return {
    title, items, subjectId, subjectTitle,
    isDetail: isDetailPage,
    videoUrl: isDetailPage ? extractVideoUrl() : '',
    date: isDetailPage ? extractDetailDate() : '',
    description: isDetailPage ? extractDetailDescription() : '',
  }
}