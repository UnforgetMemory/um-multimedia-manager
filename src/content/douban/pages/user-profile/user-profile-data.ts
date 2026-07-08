import type { UserProfileData, UserProfileSection } from './types'

/**
 * Extract the first text node from an element, before its child elements.
 * e.g. `<h1>UnforgetMemory<div>...</div></h1>` → `"UnforgetMemory"`
 */
function getFirstTextNode(el: Element): string {
  let text = ''
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent ?? ''
    } else {
      break
    }
  }
  return text.trim()
}

/**
 * Parse a stat link like "12849部看过" → 12849
 */
function parseStatCount(text: string): number {
  const m = text.match(/(\d+)/)
  return m ? parseInt(m[1], 10) : 0
}

/**
 * Extract a "sandwich" section — an area with h2 title + stat links + .obssin subsections.
 * e.g. #movie (我看), #music (我听), #book (我读), #game (我的游戏)
 */
function extractSection(container: HTMLElement): UserProfileSection | null {
  const sectionId = container.id
  if (!sectionId) return null

  // Section title (first text node of h2, before child spans)
  const h2 = container.querySelector<HTMLHeadingElement>('h2')
  if (!h2) return null
  const title = getFirstTextNode(h2)
  if (!title) return null

  // Stat links from h2 .pl a
  const statLinks: { text: string; url: string }[] = []
  h2.querySelectorAll<HTMLAnchorElement>('.pl a').forEach((a) => {
    const text = a.textContent?.trim()
    const url = a.getAttribute('href') ?? a.href
    if (text) statLinks.push({ text, url })
  })

  // Subsections from .obssin blocks
  const subsections: UserProfileSection['subsections'] = []
  container.querySelectorAll<HTMLDivElement>('.obssin').forEach((obssin) => {
    const labelEl = obssin.querySelector('.substatus')
    if (!labelEl) return
    const label = labelEl.textContent?.trim() ?? ''

    const items: { title: string; url: string; posterUrl: string }[] = []
    obssin.querySelectorAll<HTMLLIElement>('li.aob').forEach((li) => {
      const link = li.querySelector<HTMLAnchorElement>('a')
      const img = li.querySelector<HTMLImageElement>('img.climg')
      if (!link) return
      const url = link.getAttribute('href') ?? link.href
      const posterUrl = img?.src ?? ''
      const alt = img?.alt ?? link.textContent?.trim() ?? ''
      items.push({ title: alt, url, posterUrl })
    })

    if (label && items.length > 0) {
      subsections.push({ label, items })
    }
  })

  if (subsections.length === 0) return null

  return { id: sectionId, title, statLinks, subsections }
}

/**
 * Extract all "sandwich" sections from the page.
 */
function extractAllSections(): UserProfileSection[] {
  const sections: UserProfileSection[] = []
  const knownIds = ['movie', 'music', 'book', 'game']
  for (const id of knownIds) {
    const el = document.getElementById(id)
    if (!el) continue
    const section = extractSection(el)
    if (section) sections.push(section)
  }
  return sections
}

export function extractUserProfileData(): UserProfileData | null {
  const url = location.href
  const uidMatch = url.match(/\/people\/([^/?]+)/)
  const userId = uidMatch?.[1]
  if (!userId) return null

  // ---- Display name from #db-usr-profile h1 (first text node only) ----
  const h1El = document.querySelector('#db-usr-profile .info h1')
  const displayName = h1El ? getFirstTextNode(h1El) : `用户 ${userId}`

  // ---- Avatar from sidebar .userface (large) ----
  const avatarEl = document.querySelector<HTMLImageElement>('.basic-info .userface')
  const avatarUrl = avatarEl?.src ?? ''

  // ---- Bio from #intro_display only (not the parent .user-intro) ----
  const bioEl = document.querySelector('#intro_display')
  const bio = bioEl?.textContent?.trim() ?? ''

  // ---- Signature from #edit_signature #display ----
  const sigEl = document.querySelector('#edit_signature #display')
  const signature = sigEl?.textContent?.trim() ?? ''

  // ---- Location from sidebar .basic-info .user-info ----
  const infoEl = document.querySelector('.basic-info .user-info')
  const infoText = infoEl?.textContent ?? ''
  const locMatch = infoText.match(/常居:\s*([^\n]+)/)
  const userLocation = locMatch?.[1]?.trim() ?? ''

  // ---- Join date from sidebar .pl ----
  const plEl = document.querySelector('.basic-info .pl')
  const plText = plEl?.textContent ?? ''
  const joinMatch = plText.match(/(\d{4}-\d{2}-\d{2})加入/)
  const joinDate = joinMatch?.[1] ?? ''

  // ---- Movie stats from #movie h2 .pl a ----
  const movieSection = document.getElementById('movie')
  const movieLinks = movieSection?.querySelectorAll('h2 .pl a') ?? []
  const movieStats: UserProfileData['movieStats'] = { watching: 0, wish: 0, collect: 0, doulist: 0 }
  movieLinks.forEach((a) => {
    const text = a.textContent ?? ''
    if (text.includes('在看')) movieStats.watching = parseStatCount(text)
    else if (text.includes('想看')) movieStats.wish = parseStatCount(text)
    else if (text.includes('看过')) movieStats.collect = parseStatCount(text)
    else if (text.includes('片单')) movieStats.doulist = parseStatCount(text)
  })

  // ---- Music stats from #music h2 .pl a ----
  const musicSection = document.getElementById('music')
  const musicLinks = musicSection?.querySelectorAll('h2 .pl a') ?? []
  const musicStats: UserProfileData['musicStats'] = { collect: 0 }
  musicLinks.forEach((a) => {
    const text = a.textContent ?? ''
    if (text.includes('听过')) musicStats.collect = parseStatCount(text)
  })

  // ---- Book stats from #book h2 .pl a ----
  const bookSection = document.getElementById('book')
  const bookLinks = bookSection?.querySelectorAll('h2 .pl a') ?? []
  const bookStats: UserProfileData['bookStats'] = { wish: 0, collect: 0, doulist: 0 }
  bookLinks.forEach((a) => {
    const text = a.textContent ?? ''
    if (text.includes('想读')) bookStats.wish = parseStatCount(text)
    else if (text.includes('读过')) bookStats.collect = parseStatCount(text)
    else if (text.includes('书单')) bookStats.doulist = parseStatCount(text)
  })

  // ---- Game stats from #game h2 .pl a ----
  const gameSection = document.getElementById('game')
  const gameLinks = gameSection?.querySelectorAll('h2 .pl a') ?? []
  const gameStats: UserProfileData['gameStats'] = { playing: 0, played: 0 }
  gameLinks.forEach((a) => {
    const text = a.textContent ?? ''
    if (text.includes('在玩')) gameStats.playing = parseStatCount(text)
    else if (text.includes('玩过')) gameStats.played = parseStatCount(text)
  })

  // ---- Sandwich sections (movie/music/book/game) ----
  const sections = extractAllSections()

  return {
    userId,
    displayName,
    avatarUrl,
    location: userLocation,
    bio,
    signature,
    joinDate,
    movieStats,
    musicStats,
    bookStats,
    gameStats,
    sections,
  }
}
