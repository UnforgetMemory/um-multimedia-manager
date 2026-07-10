/**
 * Unified main entry factory for Douban pages.
 *
 * Routes to the correct page mount function based on URL via a
 * MountRegistry — replacing the hardcoded switch statement that
 * previously dispatched across 19 cases.
 *
 * Page mount functions are created by `definePageMount()`, which
 * encapsulates the common bootstrap pattern:
 *   1. Compose page-specific CSS from presets
 *   2. Dynamic-import the root Vue component
 *   3. Call `mountUmmOverlay` with lifecycle hooks
 *
 * Usage:
 *   import { mountDoubanMain } from '@/content/douban/main'
 *   mountDoubanMain()
 */

import { MountRegistry } from './page-registry'
import { detectPageType } from './shared/url-detector'

import { mountMusicHomepage } from './pages/music-homepage/config'
import { mountGenre } from './pages/genre/config'
import { mountArtistsOverview } from './pages/artists-overview/config'
import { mountHomepage } from './pages/homepage/config'
import { mountSearch } from './pages/search/config'
import { mountAlbums } from './pages/albums/config'
import { mountBookHomepage } from './pages/book-homepage/config'
import { mountDetail } from './pages/detail/config'
import { mountPhotos } from './pages/photos/config'
import { mountTrailer } from './pages/trailer/config'
import { mountCelebrities } from './pages/celebrities/config'
import { mountPersonage } from './pages/personage/config'
import { mountUserProfile } from './pages/user-profile/config'
import { mountMovieProfile } from './pages/movie-profile/config'
import { mountDoulists } from './pages/doulists/config'
import { mountDoulistDetail } from './pages/doulist-detail/config'
import { mountUserMedia } from './pages/user-media/config'
import { mountUserCelebrities } from './pages/user-celebrities/config'
import { mountUserReviews } from './pages/user-reviews/config'
import { mountReviewDetail } from './pages/review-detail/config'

const registry = new MountRegistry()

registry.register('music-homepage', mountMusicHomepage)
registry.register('genre', mountGenre)
registry.register('artists-overview', mountArtistsOverview)
registry.register('homepage', mountHomepage)
registry.register('search', mountSearch)
registry.register('albums', mountAlbums)
registry.register('book-homepage', mountBookHomepage)
registry.register('detail', mountDetail)
registry.register('photos', mountPhotos)
registry.register('trailer', mountTrailer)
registry.register('celebrities', mountCelebrities)
registry.register('personage', mountPersonage)
registry.register('user-profile', mountUserProfile)
registry.register('movie-profile', mountMovieProfile)
registry.register('doulists', mountDoulists)
registry.register('doulist-detail', mountDoulistDetail)
registry.register('user-media', mountUserMedia)
registry.register('user-celebrities', mountUserCelebrities)
registry.register('user-reviews', mountUserReviews)
registry.register('review-detail', mountReviewDetail)

// ---- Public API ----

/**
 * Mount the appropriate Vue app for the current Douban page.
 * Call from document_idle content script.
 */
export async function mountDoubanMain(): Promise<void> {
  try {
    const pageType = detectPageType()
    if (!pageType) throw new Error('Unknown Douban page type')

    // video shares the trailer mount function
    const pageKey = pageType.type === 'video' ? 'trailer' : pageType.type
    const mountFn = registry.getMountFn(pageKey)
    if (mountFn) await mountFn()
  } catch (err) {
    console.warn('[UMM] mountDoubanMain error:', err)
  }
}
