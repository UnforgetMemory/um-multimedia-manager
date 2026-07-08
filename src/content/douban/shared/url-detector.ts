/**
 * Unified URL-based page type detection for Douban pages.
 *
 * SINGLE source of truth — replaces duplicated is*Page() functions in:
 * - early.ts (11 functions)
 * - main.ts  (12 functions)
 *
 * Usage:
 *   const pageType = detectPageType()  // { type: 'detail', mediaType: 'movie' } | null
 *   if (pageType?.type === 'detail') { ... }
 */

export type PageType =
  | { type: 'homepage' }
  | { type: 'music-homepage' }
  | { type: 'search'; mediaType: 'movie' | 'music' }
  | { type: 'detail'; mediaType: 'movie' | 'music' }
  | { type: 'photos' }
  | { type: 'trailer' }
  | { type: 'video' }
  | { type: 'celebrities' }
  | { type: 'personage' }
  | { type: 'albums' }
  | { type: 'genre' }
  | { type: 'artists-overview' }

export function isAlbumsPage(url: string): boolean {
  return /^https?:\/\/music\.douban\.com\/albums\/\d+/.test(url)
}

export function isDetailPage(url: string): boolean {
  return /^https?:\/\/(movie|music)\.douban\.com\/subject\//.test(url)
}

export function isMusicHomepage(url: string): boolean {
  return /^https?:\/\/music\.douban\.com\/?(\?.*)?$/.test(url)
}

export function isGenrePage(url: string): boolean {
  return /^https?:\/\/music\.douban\.com\/artists\/genre_page\/\d+/.test(url)
}

export function isArtistsOverview(url: string): boolean {
  return /^https?:\/\/music\.douban\.com\/artists\/?(\?.*)?$/.test(url)
}

export function isHomepage(url: string): boolean {
  return /^https?:\/\/movie\.douban\.com\/?(\?.*)?$/.test(url)
}

export function isSearchPage(url: string): boolean {
  return /^https?:\/\/search\.douban\.com\/(movie|music)\/subject_search/.test(url)
}

export function isPhotosPage(url: string): boolean {
  return /^https?:\/\/movie\.douban\.com\/subject\/\d+\/(photos|all_photos)/.test(url)
}

export function isTrailerPage(url: string): boolean {
  return /^https?:\/\/movie\.douban\.com\/(subject\/\d+\/trailer|trailer\/\d+)/.test(url)
}

export function isVideoPage(url: string): boolean {
  return /^https?:\/\/movie\.douban\.com\/video\/\d+/.test(url)
}

export function isCelebritiesPage(url: string): boolean {
  return /^https?:\/\/movie\.douban\.com\/subject\/\d+\/celebrities/.test(url)
}

export function isPersonagePage(url: string): boolean {
  return /^https?:\/\/www\.douban\.com\/personage\/\d+/.test(url)
}

/**
 * Returns a structured PageType for the current URL, or null if unrecognized.
 */
export function detectPageType(url: string = location.href): PageType | null {
  if (isPhotosPage(url))     return { type: 'photos' }
  if (isTrailerPage(url))    return { type: 'trailer' }
  if (isVideoPage(url))      return { type: 'video' }
  if (isCelebritiesPage(url)) return { type: 'celebrities' }
  if (isAlbumsPage(url))     return { type: 'albums' }
  if (isDetailPage(url)) {
    const mediaType = url.includes('music.douban.com') ? 'music' : 'movie'
    return { type: 'detail', mediaType }
  }
  if (isSearchPage(url)) {
    const mediaType = url.includes('search.douban.com/music') ? 'music' : 'movie'
    return { type: 'search', mediaType }
  }
  if (isPersonagePage(url))  return { type: 'personage' }
  if (isMusicHomepage(url))  return { type: 'music-homepage' }
  if (isGenrePage(url))      return { type: 'genre' }
  if (isArtistsOverview(url)) return { type: 'artists-overview' }
  if (isHomepage(url))       return { type: 'homepage' }
  return null
}
