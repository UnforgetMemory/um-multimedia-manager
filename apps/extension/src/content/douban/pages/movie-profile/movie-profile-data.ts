import type { MovieProfileData, MovieProfileStat, MovieProfileSection, MovieProfileDoulist } from './types'

export function extractMovieProfileData(): MovieProfileData | null {
  const url = location.href
  const uidMatch = url.match(/\/people\/([^/?]+)/)
  const userId = uidMatch?.[1] ?? ''

  // ---- User info ----
  const avatarImg = document.querySelector<HTMLImageElement>('.side-info-avatar img, #db-usr-profile .pic img')
  const avatarUrl = avatarImg?.src ?? ''

  const nameEl = document.querySelector('.side-info-txt h3')
  const displayName = nameEl?.textContent?.trim() ?? userId

  // ---- Stats + Sections from #db-movie-mine ----
  const stats: MovieProfileStat[] = []
  const sections: MovieProfileSection[] = []
  let celebrityCount = 0
  let celebrityUrl = ''
  let reviewCount = 0
  let reviewUrl = ''

  const mine = document.getElementById('db-movie-mine')
  if (mine) {
    let currentLabel = ''
    let currentH2: HTMLHeadingElement | null = null

    Array.from(mine.children).forEach((child) => {
      if (child.tagName === 'H2') {
        currentH2 = child as HTMLHeadingElement
        const h2 = currentH2
        // Extract label from h2 (text before first ·)
        const h2Text = h2.textContent ?? ''
        const label = h2Text.replace(/[\s·]+.*$/, '').trim()
        currentLabel = label

        // Extract count from <span class="pl">(<a href="...">N部/篇/位</a>)
        const countLink = h2.querySelector<HTMLAnchorElement>('.pl a')
        const countText = countLink?.textContent?.trim() ?? ''
        const countMatch = countText.match(/(\d+)/)
        const count = countMatch ? parseInt(countMatch[1], 10) : 0
        const linkHref = countLink?.getAttribute('href') ?? ''
        const fullUrl = linkHref.startsWith('http') ? linkHref : `https://movie.douban.com${linkHref}`

        // Categorize based on label
        if (label === '收藏的影人' || label.includes('影人')) {
          celebrityCount = count
          celebrityUrl = fullUrl
          currentLabel = '' // Don't add as regular section
          return
        }
        if (label === '我的影评' || label.includes('影评')) {
          reviewCount = count
          reviewUrl = fullUrl
          currentLabel = ''
          return
        }

        // Add as stat
        stats.push({ label, count, url: fullUrl })
      }

      // Process content after h2
      if (child.tagName === 'DIV' && child.classList.contains('mod') && currentLabel && currentH2) {
        const section = extractMovieSection(child as HTMLElement, currentLabel, currentH2)
        if (section) sections.push(section)
        currentLabel = ''
      }
    })
  }

  // ---- Doulists (from sidebar) ----
  const doulists: MovieProfileDoulist[] = []
  const doulistContainer = document.querySelector<HTMLElement>('.aside .mod ul.list-m')
  if (doulistContainer) {
    doulistContainer.querySelectorAll<HTMLLIElement>('li').forEach((li) => {
      const link = li.querySelector<HTMLAnchorElement>('p a')
      const recSpan = li.querySelector<HTMLElement>('.rec')
      if (!link) return
      const title = link.textContent?.trim() ?? ''
      const href = link.getAttribute('href') ?? ''
      const followersText = recSpan?.textContent?.match(/(\d+)/)
      const followers = followersText ? parseInt(followersText[1], 10) : 0
      if (title) doulists.push({ title, url: href, followers })
    })
  }

  return {
    userId, displayName, avatarUrl,
    stats, sections,
    celebrityCount, celebrityUrl,
    reviewCount, reviewUrl,
    doulists,
  }
}

function extractMovieSection(modEl: HTMLElement, label: string, h2: HTMLHeadingElement): MovieProfileSection | null {
  const countLink = h2.querySelector<HTMLAnchorElement>('.pl a')
  const countText = countLink?.textContent?.trim() ?? ''
  const countMatch = countText.match(/(\d+)/)
  const count = countMatch ? parseInt(countMatch[1], 10) : 0
  const linkHref = countLink?.getAttribute('href') ?? ''
  const url = linkHref.startsWith('http') ? linkHref : `https://movie.douban.com${linkHref}`

  const items: { title: string; posterUrl: string; url: string }[] = []

  // Items in .list-s li a.cover img
  const list = modEl.querySelector('.sub-list .list-s')
  if (list) {
    list.querySelectorAll<HTMLLIElement>('li').forEach((li) => {
      const coverLink = li.querySelector<HTMLAnchorElement>('a.cover')
      const img = li.querySelector<HTMLImageElement>('a.cover img')
      if (!coverLink || !img) return
      const title = img.getAttribute('alt') ?? img.getAttribute('title') ?? ''
      const posterUrl = img.src ?? ''
      const href = coverLink.getAttribute('href') ?? ''
      const itemUrl = href.startsWith('http') ? href : `https://movie.douban.com${href}`
      if (title && posterUrl) {
        items.push({ title, posterUrl, url: itemUrl })
      }
    })
  }

  return { label, count, url, items }
}
