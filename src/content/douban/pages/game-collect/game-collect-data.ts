import type { GameCollectData, GameItem } from './types'

function getSubTypeFromUrl(url: string): GameCollectData['subType'] {
  if (url.includes('action=wish')) return 'wish'
  if (url.includes('action=do')) return 'do'
  return 'collect'
}

export function extractGameCollectData(): GameCollectData | null {
  try { return _extractGameCollectData() }
  catch (err) { console.warn('[UMM] Error extracting game collect:', err); return null }
}

function _extractGameCollectData(): GameCollectData | null {
  const url = location.href
  const subType = getSubTypeFromUrl(url)

  const uidMatch = url.match(/\/people\/([^/?]+)/)
  const userId = uidMatch?.[1] ?? ''

  const avatarEl = document.querySelector<HTMLImageElement>('#db-usr-profile .pic img')
  const avatarUrl = avatarEl?.src ?? ''
  const displayName = avatarEl?.getAttribute('alt') ?? userId

  const navLinks: { label: string; url: string }[] = []
  document.querySelectorAll('#db-usr-profile .info ul li a').forEach((a) => {
    const href = a.getAttribute('href') ?? ''
    const text = a.textContent?.trim()
    if (text && href) {
      navLinks.push({ label: text, url: href })
    }
  })

  let detectedSubType = subType
  const activeTab = document.querySelector<HTMLAnchorElement>('.tabs a.on')
  if (activeTab) {
    const href = activeTab.getAttribute('href') ?? ''
    if (href.includes('action=collect')) detectedSubType = 'collect'
    else if (href.includes('action=wish')) detectedSubType = 'wish'
    else if (href.includes('action=do')) detectedSubType = 'do'
  }

  let total = 0
  const countEl = document.querySelector('.paginator .count')
  if (countEl) {
    const match = countEl.textContent?.match(/共(\d+)个/)
    if (match) total = parseInt(match[1], 10)
  }
  if (total === 0) {
    const h1 = document.querySelector('#db-usr-profile h1')
    const h1Text = h1?.textContent ?? ''
    const countMatch = h1Text.match(/\((\d+)\)/)
    if (countMatch) total = parseInt(countMatch[1], 10)
  }

  const pageLinks: { label: string; url: string; current: boolean }[] = []
  let prevPageUrl = ''
  let nextPageUrl = ''
  const paginator = document.querySelector('.paginator')
  if (paginator) {
    Array.from(paginator.children).forEach((child) => {
      const tag = child.tagName
      const cls = (child as HTMLElement).className || ''
      if (tag === 'SPAN' && (cls.includes('prev') || cls.includes('next'))) {
        const a = child.querySelector<HTMLAnchorElement>('a')
        if (!a) return
        const href = a.href
        if (cls.includes('next')) nextPageUrl = href
        else prevPageUrl = href
        return
      }
      if (tag === 'SPAN' && cls.includes('thispage')) {
        const text = child.textContent?.trim() ?? ''
        const num = parseInt(text, 10)
        if (!isNaN(num)) pageLinks.push({ label: text, url: '', current: true })
        return
      }
      if (tag === 'SPAN') return
      if (tag === 'A') {
        const a = child as HTMLAnchorElement
        const text = a.textContent?.trim()
        const href = a.href
        if (!text || !href) return
        const num = parseInt(text, 10)
        if (!isNaN(num)) pageLinks.push({ label: text, url: href, current: false })
      }
    })
  }

  const items: GameItem[] = []
  const itemEls = document.querySelectorAll('.game-list .common-item')
  itemEls.forEach((el) => {
    const link = el.querySelector<HTMLAnchorElement>('.title a')
    const href = link?.getAttribute('href') ?? ''
    const subjectMatch = href.match(/\/game\/(\d+)/)
    const subjectId = subjectMatch?.[1] ?? ''

    const img = el.querySelector<HTMLImageElement>('.pic img')
    const rawPoster = img?.src ?? ''
    const posterUrl = rawPoster.includes('game_normal.png') ? '' : rawPoster

    const titleEl = el.querySelector('.title')
    const titleText = link?.textContent?.trim() ?? titleEl?.textContent?.trim() ?? ''

    const descEl = el.querySelector('.desc')
    let platforms = ''
    if (descEl) {
      for (const node of descEl.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent?.trim()
          if (text) { platforms = text; break }
        }
      }
    }

    const ratingEl = el.querySelector('.rating-star')
    const rating = ratingEl?.className?.match(/allstar\d+/)?.[0] ?? ''

    const dateEl = el.querySelector('.rating-info .date')
    const date = dateEl?.textContent?.trim() ?? ''

    let comment = ''
    const content = el.querySelector('.content')
    if (content) {
      const desc = content.querySelector('.desc')
      const userOp = content.querySelector('.user-operation')
      if (desc && userOp) {
        let sibling = desc.nextElementSibling as HTMLElement | null
        while (sibling && sibling !== userOp) {
          const text = sibling.textContent?.trim() ?? ''
          if (text) { comment = text; break }
          sibling = sibling.nextElementSibling as HTMLElement | null
        }
      }
    }

    items.push({
      subjectId,
      title: titleText,
      posterUrl,
      rating,
      date,
      comment,
      url: href,
      platforms,
    })
  })

  let currentPage = ''
  const thispage = document.querySelector('.paginator .thispage')
  if (thispage) {
    currentPage = thispage.textContent?.trim() ?? ''
  }

  return {
    subType: detectedSubType,
    userId,
    displayName,
    avatarUrl,
    navLinks,
    currentPage,
    total,
    items,
    pageLinks,
    prevPageUrl,
    nextPageUrl,
  }
}
