export interface GameRatingBar {
  label: string
  pct: string
}

export interface GameMetaRow {
  label: string
  html: string
}

export interface GamePhotoItem {
  src: string
  link: string
  isVideo: boolean
  title?: string
  tag?: string
}

export interface GameShortComment {
  user: string
  userLink: string
  rating: number
  content: string
  time: string
  votes: number
  platform?: string
}

export interface GameRecItem {
  title: string
  poster: string
  link: string
  subjectId: string
  recStatus: number
  personalRating?: number
}

export interface GameDetailData {
  title: string
  posterSrc: string
  identity: { provider: 'douban'; type: 'game'; providerId: string; url: string }
  ratingNum: string
  ratingPeople: string
  bigstarNum: string
  ratingBars: GameRatingBar[]
  metaRows: GameMetaRow[]
  hasCollected: boolean
  collectionText: string
  collectionDate: string
  collectionComment: string
  initialStatus: number
  initialRating: number
  synopsisHtml: string
  galleryItems: GamePhotoItem[]
  shortComments: GameShortComment[]
  recItems: GameRecItem[]
}

export function extractGameDetailData(): GameDetailData | null {
  try {
    const titleEl = document.querySelector('#content h1')
    const title = titleEl?.textContent?.trim() || ''

    const posterImg = document.querySelector<HTMLImageElement>('.item-subject-info .pic a img, .item-subject-info .pic img')
    const posterSrc = posterImg?.src || (posterImg?.getAttribute('src') ?? '')

    const ratingNumEl = document.querySelector('.ll.rating_num')
    const ratingNum = ratingNumEl?.textContent?.trim() || ''

    const peopleSpan = document.querySelector('.rating_sum .rating_people span, .rating_sum a.rating_people span')
    const ratingPeople = peopleSpan?.textContent?.trim() || ''

    const starEl = document.querySelector<HTMLElement>('[class*="bigstar"]')
    const bigstarNum = starEl?.className?.replace(/\D/g, '') || ''

    const ratingBars = extractRatingBars()
    const metaRows = extractMetaRows()
    const identity = extractIdentity()
    if (!identity) return null

    const collectionSection = document.querySelector('.collection-section')
    const hasCollected = !!collectionSection

    const collectionResultEl = collectionSection?.querySelector('.collection-result')
    const collectionText = collectionResultEl?.textContent?.trim() || ''

    const dateEl = collectionSection?.querySelector('.color_gray')
    const collectionDate = dateEl?.textContent?.trim() || ''

    const commentEl = collectionSection?.querySelector('.collection-comment')
    const collectionComment = commentEl?.textContent?.trim() || ''

    let initialStatus = 0
    if (collectionText.includes('我玩过')) initialStatus = 2
    else if (collectionText.includes('我想玩')) initialStatus = 1
    else if (collectionText.includes('我最近在玩')) initialStatus = 3

    const ratingBtn = document.querySelector<HTMLElement>('a.collect-btn[data-rating]')
    const initialRating = ratingBtn ? parseInt(ratingBtn.getAttribute('data-rating') || '0', 10) : 0

    const synopsisHtml = extractSynopsis()
    const galleryItems = extractGallery()
    const shortComments = extractShortComments()
    const recItems = extractRecItems()

    return {
      title,
      posterSrc,
      identity,
      ratingNum,
      ratingPeople,
      bigstarNum,
      ratingBars,
      metaRows,
      hasCollected,
      collectionText,
      collectionDate,
      collectionComment,
      initialStatus,
      initialRating,
      synopsisHtml,
      galleryItems,
      shortComments,
      recItems,
    }
  } catch {
    return null
  }
}

function extractRatingBars(): { label: string; pct: string }[] {
  const bars: { label: string; pct: string }[] = []
  const container = document.getElementById('interest_sectl') || document.querySelector('.rating_wrap')
  if (!container) return bars
  // Game page has flat siblings: .starstop → .power → .rating_per (repeating)
  const stars = container.querySelectorAll('.starstop')
  for (let i = 0; i < stars.length; i++) {
    const label = stars[i].textContent?.trim() || ''
    if (!label) continue
    // Find the NEXT .rating_per after this .starstop (sibling, not descendant)
    let pctEl = stars[i].nextElementSibling
    while (pctEl && pctEl.tagName !== 'BR') {
      if (pctEl.classList.contains('rating_per')) break
      pctEl = pctEl.nextElementSibling
    }
    const pct = pctEl?.textContent?.trim() || ''
    bars.push({ label, pct })
  }
  return bars
}

function extractMetaRows(): { label: string; html: string }[] {
  const rows: { label: string; html: string }[] = []
  const dl = document.querySelector('.item-subject-info dl.thing-attr')
  if (!dl) return rows
  const dts = dl.querySelectorAll('dt')
  dts.forEach((dt) => {
    const dd = dt.nextElementSibling
    const label = dt.textContent?.replace(/[：:]\s*$/, '').trim() || ''
    const html = dd?.innerHTML?.trim() || ''
    if (label && html) rows.push({ label, html })
  })
  return rows
}

function extractIdentity(): { provider: 'douban'; type: 'game'; providerId: string; url: string } | null {
  const match = location.pathname.match(/\/game\/(\d+)/)
  if (!match) return null
  return {
    provider: 'douban',
    type: 'game',
    providerId: match[1],
    url: location.href,
  }
}

function extractSynopsis(): string {
  const desc = document.querySelector('.mod.item-desc#link-report')
  if (!desc) return ''
  const p = desc.querySelector('p')
  if (!p) return ''
  // Read full innerHTML from clone to avoid mutating the page's DOM
  const clone = p.cloneNode(true) as HTMLElement
  return clone.innerHTML?.trim() || ''
}

function extractGallery(): GamePhotoItem[] {
  const items: GamePhotoItem[] = []
  // Game page uses two separate .mod#th-photos sections: videos then photos
  const photoMods = document.querySelectorAll<HTMLElement>('.mod#th-photos')
  photoMods.forEach((mod) => {
    const heading = mod.querySelector('h2')
    const headingText = heading?.textContent || ''

    if (headingText.includes('视频')) {
      const videos = mod.querySelectorAll<HTMLElement>('.video-mini')
      videos.forEach((v) => {
        const link = v.querySelector('a.video')
        const img = v.querySelector<HTMLImageElement>('img')
        const titleEl = v.querySelector('.title span, a.title span')
        const tagEl = v.querySelector(':scope > span')
        if (!link || !img) return
        items.push({
          src: img.src || img.getAttribute('src') || '',
          link: link.getAttribute('href') || '',
          isVideo: true,
          title: titleEl?.textContent?.trim() || '',
          tag: tagEl?.textContent?.trim() || undefined,
        })
      })
    } else if (headingText.includes('图片')) {
      const photos = mod.querySelectorAll<HTMLElement>('.list ul li:not(.photos-upload)')
      photos.forEach((p) => {
        const a = p.querySelector('a')
        const img = p.querySelector<HTMLImageElement>('img')
        if (!a || !img) return
        items.push({
          src: img.src || img.getAttribute('src') || '',
          link: a.getAttribute('href') || '',
          isVideo: false,
        })
      })
    }
  })
  return items
}

function extractShortComments(): GameShortComment[] {
  const comments: GameShortComment[] = []
  const items = document.querySelectorAll<HTMLElement>('.comment-list .comment-item')
  items.forEach((el) => {
    const userLink = el.querySelector<HTMLAnchorElement>('.user-info a')
    const userName = userLink?.textContent?.trim() || ''
    const href = userLink?.getAttribute('href') || ''
    const pubtime = el.querySelector('.pubtime')?.textContent?.trim() || ''
    const shortEl = el.querySelector('.short')
    const content = shortEl?.textContent?.trim() || ''

    // Rating: className like "allstar50" => 5, "allstar40" => 4
    const starEl = el.querySelector<HTMLElement>('[class*="allstar"]')
    let rating = 0
    if (starEl) {
      const match = starEl.className.match(/allstar(\d)/)
      if (match) rating = parseInt(match[1], 10)
    }

    const diggSpan = el.querySelector<HTMLElement>('.digg span, .digg > span')
    const votes = diggSpan ? parseInt(diggSpan.textContent?.trim() || '0', 10) : 0

    // Platform tag (game-specific: PC, PS4, etc.)
    const platformEls = el.querySelectorAll<HTMLElement>('.user-info > span:not(.pubtime):not(.comment-location)')
    let platform: string | undefined
    platformEls.forEach((s) => {
      const text = s.textContent?.trim()
      if (text && !/^\d/.test(text) && text !== '力荐' && text !== '推荐' && text !== '还行' && text !== '较差' && text !== '很差') {
        platform = text
      }
    })

    if (!userName && !content) return
    comments.push({ user: userName, userLink: href, rating, content, time: pubtime, votes, platform })
  })
  return comments
}

function extractRecItems(): GameRecItem[] {
  const items: GameRecItem[] = []
  const container = document.querySelector('#recommendations .recommendations-bd')
  if (!container) return items
  const dls = container.querySelectorAll('dl')
  dls.forEach((dl) => {
    const img = dl.querySelector<HTMLImageElement>('dt img')
    const link = dl.querySelector('dd a')
    if (!img || !link) return
    const href = link.getAttribute('href') || ''
    const idMatch = href.match(/\/game\/(\d+)/)
    items.push({
      title: link.textContent?.trim() || '',
      poster: img.src || img.getAttribute('src') || '',
      link: href,
      subjectId: idMatch?.[1] || '',
      recStatus: 0,
    })
  })
  return items
}

export async function enrichGameRecItems(recItems: GameRecItem[]): Promise<GameRecItem[]> {
  if (recItems.length === 0) return recItems
  try {
    const { Store } = await import('@/features/database')
    const entries = await Store.dbGetAll('douban_records')
    const recordMap = new Map<string, { status: number; rating: number }>()
    for (const { key, record } of entries) {
      const id = key.split('::')[1]
      if (id && (record.status ?? 0) > 0) {
        recordMap.set(id, { status: record.status, rating: record.rating || 0 })
      }
    }
    for (const item of recItems) {
      if (!item.subjectId) continue
      const rec = recordMap.get(item.subjectId)
      if (rec) {
        item.recStatus = rec.status
        if (rec.rating > 0) item.personalRating = rec.rating
      }
    }
  } catch { /* silent */ }
  return recItems
}
