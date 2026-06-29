/**
 * Detail page data extraction — extracted from douban-detail.content/index.ts
 */

import { Identity } from '@/features/identity'
import type { UrlIdentity, StoreRecord } from '@/types'
import { Store } from '@/features/database'
import DOMPurify from 'dompurify'

export interface RatingBar {
  label: string
  pct: string
}

export interface MetaRow {
  label: string
  html: string
}

export interface CelebItem {
  name: string
  role: string
  avatar: string
  link: string
}

export interface AwardItem {
  festival: string
  category: string
  nominee: string
  nomineeLink: string
  isNomination: boolean
}

export interface PhotoItem {
  src: string
  link: string
  isVideo: boolean
}

export interface RecItem {
  title: string
  poster: string
  rating: string
  link: string
  subjectId: string
  isDone: boolean
  personalRating?: number
}

export interface ShortComment {
  user: string
  userLink: string
  avatar: string
  rating: number
  content: string
  time: string
  votes: number
}

export interface DetailData {
  identity: UrlIdentity
  title: string
  originalTitle: string
  year: string
  posterSrc: string
  posterAlt: string
  posterLink: string
  ratingNum: string
  ratingPeople: string
  bigstarNum: string
  ratingBars: RatingBar[]
  betterThan: string[]
  metaRows: MetaRow[]
  synopsisHeading: string
  synopsisHtml: string
  celebHeading: string
  celebItems: CelebItem[]
  celebCount: string
  awardItems: AwardItem[]
  photoItems: PhotoItem[]
  photoCount: string
  trailerCount: string
  recItems: RecItem[]
  shortComments: ShortComment[]
  rankNo: string
  rankText: string
  rankHref: string
  isMusic: boolean
  record: StoreRecord | null
}

/**
 * Parse the current Douban detail page DOM into DetailData.
 *
 * Reads identity (type/providerId) from URL, scrapes meta info, cast/crew,
 * synopsis, ratings, photos, recommendations, and fetches the corresponding
 * IndexedDB record. All HTML from the page is DOMPurify-sanitised before
 * returning. Returns null if no identity can be derived from the URL.
 */
export async function extractDetailData(): Promise<DetailData | null> {
  const identity = Identity.fromUrl(location.href)
  if (!identity) return null

  const isMusic = location.href.includes('music.douban.com')

  // Title
  const h1 = document.querySelector('#content h1') as HTMLElement | null
  const titleSpan = h1?.querySelector('[property="v:itemreviewed"]')
  const yearSpan = h1?.querySelector('.year')
  const title = titleSpan?.textContent?.trim() || h1?.textContent?.trim() || ''
  const year = yearSpan?.textContent?.trim()?.replace(/[()]/g, '') || ''

  // Original name from #info
  let originalTitle = ''
  const infoEl = document.querySelector('#info')
  if (infoEl) {
    const infoParts = infoEl.innerHTML.split(/<br\s*\/?>/i)
    for (const part of infoParts) {
      const temp = document.createElement('div')
      temp.innerHTML = part.trim()
      const pl = temp.querySelector('.pl')
      if (pl?.textContent?.includes('原名')) {
        pl.remove()
        const parent = pl.parentElement
        if (parent) {
          for (let i = parent.childNodes.length - 1; i >= 0; i--) {
            const node = parent.childNodes[i]
            if (node.nodeType === Node.TEXT_NODE && /^:\s*$/.test(node.textContent || '')) {
              node.remove()
            }
          }
        }
        originalTitle = temp.textContent?.trim() || ''
        break
      }
    }
  }

  // Poster
  const posterImg = document.querySelector('#mainpic img') as HTMLImageElement | null
  const posterSrc = (posterImg?.src || '').replace(/s_ratio_poster/, 'xl')
  const posterAlt = posterImg?.alt || ''
  const posterLink = (document.querySelector('#mainpic a') as HTMLAnchorElement)?.href || ''

  // Rating
  const ratingNum = document.querySelector('.rating_num')?.textContent?.trim() || ''
  const ratingPeople = document.querySelector('.rating_people span')?.textContent?.trim() || ''
  const ratingStarEl = document.querySelector('.bigstar') as HTMLElement | null
  const bigstarNum = ratingStarEl?.className?.replace(/\D/g, '') || ''

  // Rating bars
  const ratingBars: RatingBar[] = []
  document.querySelectorAll('.ratings-on-weight .item').forEach((item) => {
    const label = (item.querySelector('.starstop') as HTMLElement)?.textContent?.trim() || ''
    const pct = (item.querySelector('.rating_per') as HTMLElement)?.textContent?.trim() || ''
    if (label) ratingBars.push({ label, pct })
  })

  // Better than
  const betterThan: string[] = []
  document.querySelectorAll('.rating_betterthan a').forEach((a) => {
    const text = a.textContent?.trim() || ''
    if (text) betterThan.push(text)
  })

  // Meta info
  const metaRows: MetaRow[] = []
  if (infoEl) {
    const parts = infoEl.innerHTML.split(/<br\s*\/?>/i)
    for (const part of parts) {
      const trimmed = part.trim()
      if (!trimmed) continue
      const temp = document.createElement('div')
      temp.innerHTML = trimmed
      const pl = temp.querySelector('.pl')
      const label = pl ? (pl.textContent?.replace(':', '').trim() || '') : ''
      if (pl) {
        const parent = pl.parentElement
        pl.remove()
        if (parent) {
          for (let i = parent.childNodes.length - 1; i >= 0; i--) {
            const node = parent.childNodes[i]
            if (node.nodeType === Node.TEXT_NODE && /^:\s*$/.test(node.textContent || '')) {
              node.remove()
            }
          }
        }
      }
      const text = DOMPurify.sanitize(temp.innerHTML.trim())
      metaRows.push({ label, html: text })
    }
  }

  // Synopsis
  const relatedInfo = document.querySelector(
    '#content > .grid-16-8.clearfix > .article > .related-info'
  )
  const synopsisHeading = '剧情简介'
  const synopsisEl = relatedInfo?.querySelector(
    '[property="v:summary"], [property="v:des"]'
  ) || relatedInfo?.querySelector('span.all.hidden, span:not(.all.hidden)')
  const synopsisHtml = DOMPurify.sanitize(synopsisEl?.innerHTML || '')

  // Celebrities
  const celebEl = document.querySelector('#celebrities')
  const celebHeading = '演职员'
  const celebItems: CelebItem[] = []
  celebEl?.querySelectorAll('.celebrity').forEach((li) => {
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

  const celebPl = celebEl?.querySelector('.pl')
  const celebCount = celebPl?.textContent?.trim().replace(/[()]/g, '') || ''

  // Awards
  const awardMod = document.querySelector(
    '#content > .grid-16-8.clearfix > .article > .mod'
  )
  const awardItems: AwardItem[] = []
  awardMod?.querySelectorAll('ul.award').forEach((ul) => {
    const lis = ul.querySelectorAll('li')
    if (lis.length >= 2) {
      const festival = lis[0]?.querySelector('a')?.textContent?.trim() || lis[0]?.textContent?.trim() || ''
      const category = lis[1]?.textContent?.trim() || ''
      const nomineeEl = lis[2]?.querySelector('a') as HTMLAnchorElement | null
      const nominee = nomineeEl?.textContent?.trim() || lis[2]?.textContent?.trim() || ''
      const nomineeLink = nomineeEl?.href || ''
      const isNomination = category.includes('提名')
      if (festival) awardItems.push({ festival, category, nominee, nomineeLink, isNomination })
    }
  })

  // Rank
  const rankLabel = document.querySelector('.rank-label')
  const rankNo = rankLabel?.querySelector('.rank-label-no')?.textContent?.trim() || ''
  const rankLink = rankLabel?.querySelector('.rank-label-link a') as HTMLAnchorElement | null
  const rankText = rankLink?.textContent?.trim() || ''
  const rankHref = rankLink?.href || ''

  // Photos
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

  // Recommendations
  const recEl = document.querySelector('#recommendations')
  const recItems: RecItem[] = []
  recEl?.querySelectorAll('.recommendations-bd dl').forEach((dl) => {
    const img = dl.querySelector('dt img') as HTMLImageElement | null
    const linkEl = dl.querySelector('dd a') as HTMLAnchorElement | null
    // Use dl.querySelector() not linkEl.querySelector() — .subject-rate is
    // a sibling of <a> inside <dd>, not a child of <a>, so scoping to linkEl
    // (the <a> element) would miss it entirely.
    const rate = dl.querySelector('.subject-rate')?.textContent?.trim() || ''
    const href = linkEl?.href || ''
    const idMatch = href.match(/\/subject\/(\d+)/)
    recItems.push({
      title: linkEl?.textContent?.trim() || img?.alt || '',
      poster: img?.src || '',
      rating: rate,
      link: href,
      subjectId: idMatch ? idMatch[1] : '',
      isDone: false,
    })
  })

  // Batch-check watched status from IndexedDB
  if (recItems.length > 0) {
    const subjectIds = new Set(recItems.map(r => r.subjectId).filter(Boolean))
    if (subjectIds.size > 0) {
      try {
        const watchedMap = await Store.dbGetWatchedIds(['douban_records'])
        const watchedIds = watchedMap['douban_records'] || []
        const doneSet = new Set(watchedIds.map(id => id.replace(/^(movie|music|tv)::/, '')))
        for (const item of recItems) {
          if (doneSet.has(item.subjectId)) item.isDone = true
        }
      } catch { /* silent */ }
    }
  }

  // Fetch personal ratings for watched rec items
  if (recItems.length > 0) {
    const promises = recItems.filter(r => r.isDone).map(async r => {
      try {
        const key = `${identity.type}::${r.subjectId}`
        const record = await Store.dbGet('douban_records', key)
        if (record?.rating) r.personalRating = record.rating
      } catch { /* silent */ }
    })
    await Promise.all(promises)
  }

  // Short comments
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

  return {
    identity,
    title,
    originalTitle,
    year,
    posterSrc,
    posterAlt,
    posterLink,
    ratingNum,
    ratingPeople,
    bigstarNum,
    ratingBars,
    betterThan,
    metaRows,
    synopsisHeading,
    synopsisHtml,
    celebHeading,
    celebItems,
    celebCount,
    awardItems,
    photoItems,
    photoCount,
    trailerCount,
    recItems,
    shortComments,
    rankNo,
    rankText,
    rankHref,
    isMusic,
    record: null,
  }
}

export async function loadRecord(identity: UrlIdentity): Promise<StoreRecord | null> {
  try {
    const prefix = `${identity.type}::`
    const key = `${prefix}${identity.providerId}`
    return await Store.dbGet('douban_records', key)
  } catch {
    return null
  }
}
