import type { DoulistsPageData, DoulistItem, DoulistCategory, XbarCategory } from './types'
import { parseCategory } from './types'

export function extractDoulistsData(): DoulistsPageData | null {
  const url = location.href
  const uidMatch = url.match(/\/people\/([^/?]+)/)
  const userId = uidMatch?.[1]
  if (!userId) return null

  const isMovie = url.includes('movie.douban.com')
  const isWWW = url.includes('www.douban.com')

  // ---- User info ----
  const avatarImg = document.querySelector<HTMLImageElement>('#db-usr-profile .pic img, .side-info-avatar img')
  const avatarUrl = avatarImg?.src ?? ''

  let displayName = userId
  if (isWWW) {
    // www.douban.com/people/{uid}/doulists — h1 is "我的豆列" (page title),
    // so use the avatar alt text which holds the actual display name
    displayName = avatarImg?.getAttribute('alt') ?? userId
  } else {
    const nameEl = document.querySelector('.side-info-txt h3, #db-usr-profile h1')
    let name = nameEl?.textContent?.trim() ?? userId
    name = name.replace('的电影', '').replace('的豆列', '').trim()
    displayName = name === userId ? (avatarImg?.getAttribute('alt') ?? userId) : name
  }

  const navLinks: { label: string; url: string }[] = []
  document.querySelectorAll('#db-usr-profile .info ul li a').forEach((a) => {
    let href = a.getAttribute('href') ?? ''
    const text = a.textContent?.trim()
    if (text && href && text !== '|') {
      // Keep native www.douban.com URLs on www pages — many links (statuses,
      // photos, notes, doulists/all, subject_doulists/*) only exist on www.
      // Only rewrite to movie subdomain when on movie.douban.com.
      if (isMovie) {
        href = href.replace('https://www.douban.com', 'https://movie.douban.com')
      }
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
    // www.douban.com uses .switch_tabs for created/collected toggle
    const switchTabs = document.querySelector('.switch_tabs')
    if (switchTabs) {
      const spans = switchTabs.querySelectorAll<HTMLElement>('span')
      spans.forEach((span) => {
        const txt = span.textContent?.trim() ?? ''
        const count = parseInt(txt.match(/(\d+)/)?.[1] ?? '0', 10) || 0
        const link = span.querySelector<HTMLAnchorElement>('a')
        const isCurrent = span.className.includes('current')
        if (txt.includes('关注') || txt.includes('collect')) {
          collectedCount = count
          collectedUrl = isCurrent ? window.location.href : (link?.getAttribute('href') ?? link?.href ?? '')
        } else if (txt.includes('创建') || isCurrent) {
          createdCount = count
          createdUrl = isCurrent ? window.location.href : (link?.getAttribute('href') ?? link?.href ?? '')
        }
      })
      // Determine which tab is active based on current URL.
      // Old /doulists/collect path for movie.douban.com,
      // new ?owned=followed query param for www.douban.com/subject_doulists/
      if (
        window.location.pathname.includes('/doulists/collect') ||
        new URLSearchParams(window.location.search).get('owned') === 'followed'
      ) {
        activeTab = 'collected'
      } else {
        activeTab = 'created'
      }
    }
  }

  // ---- Xbar categories (www.douban.com only) ----
  const xbarCategories: XbarCategory[] = []
  if (isWWW) {
    const xbar = document.querySelector('.xbar > div')
    if (xbar) {
      xbar.querySelectorAll<HTMLAnchorElement>('a').forEach((a) => {
        const text = a.textContent?.trim() ?? ''
        const href = a.getAttribute('href') ?? ''
        if (!text || !href) return
        const m = text.match(/^(.+?)\((\d+)\)$/)
        if (m) {
          xbarCategories.push({
            label: m[1].trim(),
            url: href,
            count: parseInt(m[2], 10),
            current: false,
          })
        }
      })
      const nowSpan = xbar.querySelector<HTMLElement>('span.now > span, span.now')
      if (nowSpan) {
        const text = nowSpan.textContent?.trim() ?? ''
        const m = text.match(/^(.+?)\((\d+)\)$/)
        if (m) {
          xbarCategories.push({
            label: m[1].trim(),
            url: window.location.href,
            count: parseInt(m[2], 10),
            current: true,
          })
        }
      }
    }
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
      items.push({
        id, title, coverUrl: '', itemCount, watchedCount: 0,
        updateTime: '', followerCount, url: href, intro: '', category: 'other',
      })
    })
  } else {
    document.querySelectorAll('.doulist-list > li').forEach((li) => {
      // Title comes from h3 a (text content). URL can also come from the cover a.
      const titleLink = li.querySelector<HTMLAnchorElement>('h3 a')
      const coverLink = li.querySelector<HTMLAnchorElement>('.doulist-cover a')
      const img = li.querySelector<HTMLImageElement>('img')
      const metaEl = li.querySelector('.meta')
      const collectEl = li.querySelector('.collect-num')
      const href = titleLink?.getAttribute('href') ?? coverLink?.getAttribute('href') ?? ''
      const doulistMatch = href.match(/\/doulist\/(\d+)/)
      const collectionMatch = href.match(/\/subject_collection\/([A-Z0-9]+)/)
      const id = doulistMatch?.[1] ?? collectionMatch?.[1] ?? ''
      if (!id) return
      const metaText = metaEl?.textContent?.trim() ?? ''
      // Normalize spacing around / for consistent matching across formats:
      //   movie: "看过17/17部"    book: "读过10/10本"    music: "听过X/Y张"
      //   or single-count: "看过X部", "读过X本"
      const normalized = metaText.replace(/\s*\/\s*/g, '/')
      const statusMatch = normalized.match(/(?:看过|读过|听过)\s*(\d+)(?:\/(\d+))?/)
      let watchedCount = 0
      let itemCount = 0
      if (statusMatch) {
        if (statusMatch[2] !== undefined) {
          // Ratio format: "看过17/17部"
          watchedCount = parseInt(statusMatch[1], 10)
          itemCount = parseInt(statusMatch[2], 10)
        } else {
          // Single-count format: "看过X部"
          itemCount = parseInt(statusMatch[1], 10)
        }
      }
      const followerMatch = collectEl?.textContent?.match(/(\d+)/)
      const followerCount = followerMatch ? parseInt(followerMatch[1], 10) : 0

      // Parse category from the CSS class on the doulist-cover anchor
      const coverCls = coverLink?.className ?? ''
      const category: DoulistCategory = coverCls ? parseCategory(coverCls) : 'other'

      // Clean updateTime: "2026-07-07 20:09:42  更新" → "2026-07-07 20:09"
      let updateTime = metaText.split('·')[0]?.trim() ?? ''
      updateTime = updateTime.replace(/\s*更新\s*$/, '').trim()

      // Intro paragraph (optional)
      const introEl = li.querySelector<HTMLElement>('p.intro')
      const intro = introEl?.textContent?.trim() ?? ''

      items.push({
        id, title: titleLink?.textContent?.trim() ?? '', coverUrl: img?.src ?? '',
        itemCount, watchedCount, updateTime, followerCount, url: href,
        intro, category,
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
    xbarCategories,
    items, pageLinks, prevPageUrl, nextPageUrl,
  }
}
