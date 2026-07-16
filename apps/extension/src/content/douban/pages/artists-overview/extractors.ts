import type { ArtistsOverviewData, RecommendedArtist, EventItem, VideoItem, GenreNavItem } from './types'

/**
 * Extract recommended artists from .guess-artists carousel.
 */
function extractRecommendedArtists(): RecommendedArtist[] {
  const items: RecommendedArtist[] = []
  const seen = new Set<string>()

  document.querySelectorAll('#guess-artists .slide-page .list li').forEach(li => {
    const link = li.querySelector<HTMLAnchorElement>('.pic a, a[href*="site.douban.com"]')
    const href = link?.href || ''
    if (!href || seen.has(href)) return
    seen.add(href)

    const img = li.querySelector<HTMLImageElement>('.pic img')
    const avatarUrl = img?.getAttribute('src') || ''

    const nameEl = li.querySelector<HTMLAnchorElement>('.artist-name a')
    const name = nameEl?.textContent?.trim() || ''

    if (name) items.push({ name, href, avatarUrl })
  })

  return items
}

/**
 * Extract events from #artists-events.
 */
function extractEvents(): EventItem[] {
  const items: EventItem[] = []
  document.querySelectorAll('#artists-events .list-v li').forEach(li => {
    const link = li.querySelector<HTMLAnchorElement>('.pic a')
    const href = link?.href || ''
    const img = li.querySelector<HTMLImageElement>('.pic img')
    const imageUrl = img?.getAttribute('src') || ''
    const desc = li.querySelector<HTMLElement>('.desc')?.textContent?.trim() || ''
    const title = desc.split('\n')[0]?.trim() || ''
    if (href) items.push({ title, href, imageUrl, description: desc })
  })
  return items
}

/**
 * Extract videos from #artists-video.
 */
function extractVideos(): VideoItem[] {
  const items: VideoItem[] = []
  document.querySelectorAll('#artists-video .list li').forEach(li => {
    const link = li.querySelector<HTMLAnchorElement>('.pic a')
    const href = link?.href || ''
    const img = li.querySelector<HTMLImageElement>('.pic img')
    const imageUrl = img?.getAttribute('src') || ''

    const artistEl = li.querySelector<HTMLElement>('.title .artist-name')
    const artistName = artistEl?.textContent?.trim() || ''

    const titleEl = li.querySelector<HTMLAnchorElement>('.title .title a')
    const title = titleEl?.textContent?.trim() || ''

    if (href) items.push({ artistName, title, href, imageUrl })
  })
  return items
}

/**
 * Extract genre navigation from .genre-nav.
 */
function extractGenreNav(): GenreNavItem[] {
  const items: GenreNavItem[] = []
  document.querySelectorAll('.genre-nav .bd a').forEach(a => {
    const href = (a as HTMLAnchorElement).href || ''
    const name = a.textContent?.trim() || ''
    if (href && name) items.push({ name, href })
  })
  return items
}

/**
 * Full extraction for the artists overview page.
 */
export function extractArtistsOverview(): ArtistsOverviewData | null {
  const recommendedArtists = extractRecommendedArtists()
  const events = extractEvents()
  const videos = extractVideos()
  const genreNav = extractGenreNav()
  return { recommendedArtists, events, videos, genreNav }
}