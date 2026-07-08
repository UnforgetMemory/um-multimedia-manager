import type { DoulistsPageData, DoulistItem } from './types'

export function extractDoulistsData(): DoulistsPageData | null {
  const url = location.href
  const uidMatch = url.match(/\/people\/([^/?]+)/)
  const userId = uidMatch?.[1]
  if (!userId) return null

  const isMovie = url.includes('movie.douban.com')

  // ---- User info ----
  const avatarImg = document.querySelector<HTMLImageElement>('#db-usr-profile .pic img, .side-info-avatar img')
  const avatarUrl = avatarImg?.src ?? ''

  const nameEl = document.querySelector('.side-info-txt h3, #db-usr-profile h1')
  let displayName = nameEl?.textContent?.trim() ?? userId
  displayName = displayName.replace('的电影', '').replace('的豆列', '').trim()
  if (displayName === userId) {
    displayName = avatarImg?.getAttribute('alt') ?? userId
  }

  const navLinks: { label: string; url: string }[] = []
  document.querySelectorAll('#db-usr-profile .info ul li a').forEach((a) => {
    let href = a.getAttribute('href') ?? ''
    const text = a.textContent?.trim()
    if (text && href && text !== '|') {
      href = href.replace('https://www.douban.com', 'https://movie.douban.com')
      navLinks.push({ label: text, url: href })
    }
  })

  // ---- Tabs ----
  let createdCount = 0
  let collectedCount = 0
  let createdUrl = ''
  let collectedUrl = ''
  let activeTab: 'created' | 'collected' = 'created'

  if (isMovie) {
    document.querySelectorAll<HTMLAnchorElement>('.xbar a').forEach((a) => {
      const text = a.textContent?.trim() ?? ''
      const href = a.getAttribute('href') ?? ''
      const countMatch = text.match(/(\d+)/)
      if (text.includes('关注')) {
        collectedUrl = href
        collectedCount = countMatch ? parseInt(countMatch[1], 10) : 0
      } else if (text.includes('创建')) {
        createdUrl = href
        createdCount = countMatch ? parseInt(countMatch[1], 10) : 0
      }
    })
    // Active tab is a <span.now> not an <a> — construct URL from current page
    const nowEl = document.querySelector<HTMLElement>('.xbar .now')
    if (nowEl) {
      const text = nowEl.textContent?.trim() ?? ''
      const countMatch = text.match(/(\d+)/)
      if (text.includes('创建')) {
        createdUrl = window.location.pathname + '?type=create'
        createdCount = countMatch ? parseInt(countMatch[1], 10) : 0
        activeTab = 'created'
      } else if (text.includes('关注')) {
        collectedUrl = window.location.pathname + '?type=collected'
        collectedCount = countMatch ? parseInt(countMatch[1], 10) : 0
        activeTab = 'collected'
      }
    }
  } else {
    const tabEl = document.querySelector('.switch_tabs .current')
    const match = tabEl?.textContent?.match(/(\d+)/)
    createdCount = match ? parseInt(match[1], 10) : 0
  }

  // ---- Items ----
  const items: DoulistItem[] = []

  if (isMovie) {
    document.querySelectorAll('#doulist-content table.list-b tbody tr').forEach((tr) => {
      const titleTd = tr.querySelector<HTMLTableCellElement>('td')
      if (!titleTd) return
      const link = titleTd.querySelector<HTMLAnchorElement>('a')
      const href = link?.getAttribute('href') ?? ''
      const idMatch = href.match(/\/doulist\/(\d+)/)
      const id = idMatch?.[1] ?? ''
      if (!id) return
      const title = link?.textContent?.trim() ?? ''
      const emEl = titleTd.querySelector('em')
      const itemMatch = emEl?.textContent?.match(/\[(\d+)\]/)
      const itemCount = itemMatch ? parseInt(itemMatch[1], 10) : 0
      const numCells = tr.querySelectorAll<HTMLTableCellElement>('td.num')
      const followerCount = numCells[0] ? parseInt(numCells[0].textContent?.trim() ?? '0', 10) : 0
      items.push({ id, title, coverUrl: '', itemCount, updateTime: '', followerCount, url: href })
    })
  } else {
    document.querySelectorAll('.doulist-list > li').forEach((li) => {
      const link = li.querySelector<HTMLAnchorElement>('h3 a, .doulist-cover a')
      const img = li.querySelector<HTMLImageElement>('img')
      const metaEl = li.querySelector('.meta')
      const collectEl = li.querySelector('.collect-num')
      const href = link?.getAttribute('href') ?? ''
      const idMatch = href.match(/\/doulist\/(\d+)/)
      const id = idMatch?.[1] ?? ''
      if (!id) return
      const metaText = metaEl?.textContent?.trim() ?? ''
      const countMatch = metaText.match(/看过\s*(\d+)/)
      const itemCount = countMatch ? parseInt(countMatch[1], 10) : 0
      const followerMatch = collectEl?.textContent?.match(/(\d+)/)
      const followerCount = followerMatch ? parseInt(followerMatch[1], 10) : 0
      items.push({
        id, title: link?.textContent?.trim() ?? '', coverUrl: img?.src ?? '',
        itemCount, updateTime: metaText.split('·')[0]?.trim() ?? '', followerCount, url: href,
      })
    })
  }

  // ---- Paginator ----
  const pageLinks: { label: string; url: string; current: boolean }[] = []
  let prevPageUrl = ''
  let nextPageUrl = ''
  const paginator = document.querySelector('.paginator')
  if (paginator) {
    Array.from(paginator.children).forEach((child) => {
      const tag = child.tagName
      const cls = (child as HTMLElement).className || ''
      if (tag === 'SPAN' && cls.includes('prev')) {
        const a = child.querySelector<HTMLAnchorElement>('a')
        if (a) prevPageUrl = a.getAttribute('href') ?? a.href
        return
      }
      if (tag === 'SPAN' && cls.includes('next')) {
        const a = child.querySelector<HTMLAnchorElement>('a')
        if (a) nextPageUrl = a.getAttribute('href') ?? a.href
        return
      }
      if (tag === 'SPAN' && cls.includes('thispage')) {
        const text = child.textContent?.trim() ?? ''
        const num = parseInt(text, 10)
        if (!isNaN(num)) pageLinks.push({ label: text, url: '', current: true })
        return
      }
      if (tag === 'A') {
        const a = child as HTMLAnchorElement
        const text = a.textContent?.trim()
        const href = a.getAttribute('href') ?? a.href
        if (!text || !href) return
        const num = parseInt(text, 10)
        if (!isNaN(num)) pageLinks.push({ label: text, url: href, current: false })
      }
    })
  }

  return {
    userId, displayName, avatarUrl, navLinks,
    createdCount, createdUrl, collectedCount, collectedUrl, activeTab,
    items, pageLinks, prevPageUrl, nextPageUrl,
  }
}
