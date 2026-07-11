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
  | { type: 'book-homepage' }
  | { type: 'book-profile' }
  | { type: 'search'; mediaType: 'movie' | 'music' | 'book' }
  | { type: 'detail'; mediaType: 'movie' | 'music' | 'book' }
  | { type: 'photos' }
  | { type: 'trailer' }
  | { type: 'video' }
  | { type: 'celebrities' }
  | { type: 'personage' }
  | { type: 'user-profile' }
  | { type: 'movie-profile' }
  | { type: 'doulists' }
  | { type: 'doulist-detail' }
  | { type: 'user-media'; subType: 'collect' | 'wish' | 'doing' }
  | { type: 'book-collect'; subType: 'collect' | 'wish' | 'doing' }
  | { type: 'book-authors' }
  | { type: 'user-celebrities' }
  | { type: 'user-reviews' }
  | { type: 'book-reviews' }
  | { type: 'review-detail' }
  | { type: 'book-review-detail' }
  | { type: 'albums' }
  | { type: 'genre' }
  | { type: 'artists-overview' }
  | { type: 'game-collect'; subType: 'collect' | 'wish' | 'do' }
  | { type: 'game-detail' }
  | { type: 'game-explore' }

export function isAlbumsPage(url: string): boolean {
  return /^https?:\/\/music\.douban\.com\/albums\/\d+/.test(url)
}

export function isDetailPage(url: string): boolean {
  return /^https?:\/\/(movie|music|book)\.douban\.com\/subject\//.test(url)
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

export function isBookUserProfile(url: string): boolean {
  return /^https?:\/\/book\.douban\.com\/people\/[^/]+\/?(\?.*)?$/.test(url)
}

export function isBookHomepage(url: string): boolean {
  return /^https?:\/\/book\.douban\.com\/?(\?.*)?$/.test(url)
}

export function isSearchPage(url: string): boolean {
  return /^https?:\/\/search\.douban\.com\/(movie|music|book)\/subject_search/.test(url)
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

export function isGameDetailPage(url: string): boolean {
  return /^https?:\/\/www\.douban\.com\/game\/\d+\/?(\?.*)?$/.test(url)
}

export function isGameExplorePage(url: string): boolean {
  return /^https?:\/\/www\.douban\.com\/game\/explore(\?.*)?$/.test(url)
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

export function isBookUserReviewsPage(url: string): boolean {
  return /^https?:\/\/book\.douban\.com\/people\/[^/]+\/reviews/.test(url)
}

export function isReviewDetailPage(url: string): boolean {
  return /^https?:\/\/movie\.douban\.com\/review\/\d+/.test(url)
}

export function isBookReviewDetailPage(url: string): boolean {
  return /^https?:\/\/book\.douban\.com\/review\/\d+/.test(url)
}

export function isDoulistsPage(url: string): boolean {
  return /^https?:\/\/(www|movie)\.douban\.com\/people\/[^/]+\/(doulists|subject_doulists(?:\/\w+)?)/.test(url)
}

export function isDoulistDetailPage(url: string): boolean {
  return /^https?:\/\/www\.douban\.com\/doulist\/\d+/.test(url)
}

export function isUserMediaPage(url: string): boolean {
  return /^https?:\/\/movie\.douban\.com\/(people\/[^/]+\/(collect|wish|do)|mine)/.test(url)
}

export function isBookCollectPage(url: string): boolean {
  return /^https?:\/\/book\.douban\.com\/people\/[^/]+\/(collect|wish|do)/.test(url)
}

export function isBookAuthorsPage(url: string): boolean {
  return /^https?:\/\/book\.douban\.com\/people\/[^/]+\/authors/.test(url)
}

export function isGameCollectPage(url: string): boolean {
  return /^https?:\/\/www\.douban\.com\/people\/[^/]+\/games(\?.*)?$/.test(url)
}

export function getGameCollectSubType(url: string): 'collect' | 'wish' | 'do' {
  if (url.includes('action=wish')) return 'wish'
  if (url.includes('action=do')) return 'do'
  return 'collect'
}

export function getBookCollectSubType(url: string): 'collect' | 'wish' | 'doing' {
  if (url.includes('/wish') || url.includes('status=wish')) return 'wish'
  if (url.includes('/do') || url.includes('status=do')) return 'doing'
  return 'collect'
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
  if (isBookUserProfile(url)) return { type: 'book-profile' }
  if (isBookHomepage(url))   return { type: 'book-homepage' }
  if (isDetailPage(url)) {
    const mediaType = url.includes('music.douban.com') ? 'music' : url.includes('book.douban.com') ? 'book' : 'movie'
    return { type: 'detail', mediaType }
  }
  if (isSearchPage(url)) {
    const mediaType = url.includes('search.douban.com/music') ? 'music' : url.includes('search.douban.com/book') ? 'book' : 'movie'
    return { type: 'search', mediaType }
  }
  if (isPersonagePage(url))  return { type: 'personage' }
  if (isDoulistDetailPage(url)) return { type: 'doulist-detail' }
  if (isDoulistsPage(url))   return { type: 'doulists' }
  if (isUserCelebritiesPage(url)) return { type: 'user-celebrities' }
  if (isUserReviewsPage(url)) return { type: 'user-reviews' }
  if (isBookUserReviewsPage(url)) return { type: 'book-reviews' }
  if (isBookAuthorsPage(url)) return { type: 'book-authors' }
  if (isMovieProfilePage(url)) return { type: 'movie-profile' }
  if (isUserProfilePage(url)) return { type: 'user-profile' }
  if (isUserMediaPage(url)) {
    return { type: 'user-media', subType: getUserMediaSubType(url) }
  }
  if (isBookCollectPage(url)) {
    return { type: 'book-collect', subType: getBookCollectSubType(url) }
  }
  if (isMusicHomepage(url))  return { type: 'music-homepage' }
  if (isGenrePage(url))      return { type: 'genre' }
  if (isArtistsOverview(url)) return { type: 'artists-overview' }
  if (isReviewDetailPage(url)) return { type: 'review-detail' }
  if (isBookReviewDetailPage(url)) return { type: 'book-review-detail' }
  if (isHomepage(url))       return { type: 'homepage' }
  if (isGameDetailPage(url)) return { type: 'game-detail' }
  if (isGameExplorePage(url)) return { type: 'game-explore' }
  if (isGameCollectPage(url)) {
    return { type: 'game-collect', subType: getGameCollectSubType(url) }
  }
  return null
}
