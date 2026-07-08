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
  | { type: 'user-profile' }
  | { type: 'movie-profile' }
  | { type: 'doulists' }
  | { type: 'user-media'; subType: 'collect' | 'wish' | 'doing' }
  | { type: 'user-celebrities' }
  | { type: 'user-reviews' }
  | { type: 'review-detail' }
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

export function isUserProfilePage(url: string): boolean {
  return /^https?:\/\/www\.douban\.com\/people\/[^/]+(?:\/)?(?:\?.*)?$/.test(url)
}

export function isMovieProfilePage(url: string): boolean {
  return /^https?:\/\/movie\.douban\.com\/people\/[^/]+(?:\/)?(?:\?.*)?$/.test(url)
}

export function isUserCelebritiesPage(url: string): boolean {
  return /^https?:\/\/movie\.douban\.com\/people\/[^/]+\/celebrities/.test(url)
}

export function isUserReviewsPage(url: string): boolean {
  return /^https?:\/\/movie\.douban\.com\/people\/[^/]+\/reviews/.test(url)
}

export function isReviewDetailPage(url: string): boolean {
  return /^https?:\/\/movie\.douban\.com\/review\/\d+/.test(url)
}

export function isDoulistsPage(url: string): boolean {
  return /^https?:\/\/(www|movie)\.douban\.com\/people\/[^/]+\/doulists/.test(url)
}

export function isUserMediaPage(url: string): boolean {
  return /^https?:\/\/movie\.douban\.com\/(people\/[^/]+\/(collect|wish|do)|mine)/.test(url)
}

export function getUserMediaSubType(url: string): 'collect' | 'wish' | 'doing' {
  if (url.includes('/collect') || url.includes('status=collect')) return 'collect'
  if (url.includes('/wish') || url.includes('status=wish')) return 'wish'
  return 'doing'
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
  if (isDoulistsPage(url))   return { type: 'doulists' }
  if (isUserCelebritiesPage(url)) return { type: 'user-celebrities' }
  if (isUserReviewsPage(url)) return { type: 'user-reviews' }
  if (isMovieProfilePage(url)) return { type: 'movie-profile' }
  if (isUserProfilePage(url)) return { type: 'user-profile' }
  if (isUserMediaPage(url)) {
    return { type: 'user-media', subType: getUserMediaSubType(url) }
  }
  if (isMusicHomepage(url))  return { type: 'music-homepage' }
  if (isGenrePage(url))      return { type: 'genre' }
  if (isArtistsOverview(url)) return { type: 'artists-overview' }
  if (isReviewDetailPage(url)) return { type: 'review-detail' }
  if (isHomepage(url))       return { type: 'homepage' }
  return null
}
