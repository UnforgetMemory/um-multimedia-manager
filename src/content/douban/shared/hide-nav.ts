/**
 * Unified native navigation hiding for Douban pages.
 *
 * Consolidates the repeated `document.getElementById('db-global-nav').style.display = 'none'`
 * pattern that appears in 8+ mount functions across main.ts.
 *
 * Usage:
 *   hideNativeNav({ globalNav: true, movieNav: true })
 *   hideNavForPage(pageType)  // auto-detect which navs to hide
 */

import type { PageType } from './url-detector'

/**
 * Hide specific native Douban navigation elements.
 */
export function hideNativeNav(options?: {
  globalNav?: boolean
  movieNav?: boolean
  musicNav?: boolean
  bookNav?: boolean
}): void {
  if (!options) return
  if (options.globalNav) {
    const el = document.getElementById('db-global-nav')
    if (el) el.style.display = 'none'
  }
  if (options.movieNav) {
    const el = document.getElementById('db-nav-movie')
    if (el) el.style.display = 'none'
  }
  if (options.musicNav) {
    const el = document.getElementById('db-nav-music')
    if (el) el.style.display = 'none'
  }
  if (options.bookNav) {
    const el = document.getElementById('db-nav-book')
    if (el) el.style.display = 'none'
  }
}

/**
 * Auto-hide native navigation based on the detected page type.
 * Movie pages: hide globalNav + movieNav
 * Music pages: hide globalNav + musicNav
 * Personage:   hide globalNav only
 * Homepages:   no nav hiding (native nav is part of the design)
 */
export function hideNavForPage(pageType: PageType): void {
  switch (pageType.type) {
    case 'detail':
    case 'photos':
    case 'trailer':
    case 'video':
    case 'celebrities':
      if (pageType.type === 'detail') {
        if (pageType.mediaType === 'music') hideNativeNav({ globalNav: true, musicNav: true })
        else if (pageType.mediaType === 'book') hideNativeNav({ globalNav: true })
        else hideNativeNav({ globalNav: true, movieNav: true })
      } else {
        hideNativeNav({ globalNav: true, movieNav: true })
      }
      break
    case 'albums':
    case 'genre':
    case 'artists-overview':
      hideNativeNav({ globalNav: true, musicNav: true })
      break
    case 'personage':
    case 'user-profile':
    case 'doulists':
    case 'doulist-detail':
      hideNativeNav({ globalNav: true })
      break
    case 'movie-profile':
    case 'user-celebrities':
    case 'user-reviews':
    case 'user-media':
      hideNativeNav({ globalNav: true, movieNav: true })
      break
    case 'book-reviews':
      hideNativeNav({ globalNav: true, bookNav: true })
      break
    case 'book-collect':
      hideNativeNav({ globalNav: true, bookNav: true })
      break
    case 'book-authors':
      hideNativeNav({ globalNav: true, bookNav: true })
      break
    case 'book-profile':
    case 'book-review-detail':
      hideNativeNav({ globalNav: true, bookNav: true })
      break
    case 'homepage':
    case 'music-homepage':
    case 'book-homepage':
    case 'search':
      // Native navigation is part of the page design for these types
      break
  }
}
