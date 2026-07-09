/**
 * Unified main entry factory for Douban pages.
 *
 * Routes to the correct page mount function based on URL:
 * - Homepage (movie.douban.com/) → mountHomepage()
 * - Music Homepage (music.douban.com/) → mountMusicHomepage()
 * - Search (search.douban.com/*) → mountSearch()
 * - Detail (movie/music.douban.com/subject/*) → mountDetail()
 *
 * Usage:
 *   import { mountDoubanMain } from '@/content/douban/main'
 *   mountDoubanMain()
 */

import themeCss from './styles/theme.css?raw'
import commonCss from './styles/common.css?raw'
import breakpointsCss from './styles/breakpoints.css?raw'
import homepageCss from './styles/homepage.css?raw'
import musicHomepageCss from './styles/music-homepage.css?raw'
import genreCss from './styles/genre.css?raw'
import artistsOverviewCss from './styles/artists-overview.css?raw'
import searchCss from './styles/search.css?raw'
import detailCss from './styles/detail.css?raw'
import photosCss from './styles/photos.css?raw'
import trailerCss from './styles/trailer.css?raw'
import celebritiesCss from './styles/celebrities.css?raw'
import personageCss from './styles/personage.css?raw'
import userProfileCss from './styles/user-profile.css?raw'
import movieProfileCss from './styles/movie-profile.css?raw'
import doulistsCss from './styles/doulists.css?raw'
import doulistDetailCss from './styles/doulist-detail.css?raw'
import userMediaCss from './styles/user-media.css?raw'
import userCelebritiesCss from './styles/user-celebrities.css?raw'
import userReviewsCss from './styles/user-reviews.css?raw'
import reviewDetailCss from './styles/review-detail.css?raw'
import albumsCss from './styles/albums.css?raw'
import pageLayoutCss from './styles/page-layout.css?raw'
import componentsCss from './styles/components.css?raw'
import interestCss from './styles/interest.css?raw'
import { mountUmmOverlay } from './overlay'
import { composeStylesForPage } from './css-composer'
import { createApp } from 'vue'
import { detectPageType, getUserMediaSubType } from './shared/url-detector'
import { hideNavForPage } from './shared/hide-nav'

const cssMap: Record<string, string> = {
  theme: themeCss,
  common: commonCss,
  breakpoints: breakpointsCss,
  'page-layout': pageLayoutCss,
  'shared-components': componentsCss,
  homepage: homepageCss,
  'music-homepage': musicHomepageCss,
  genre: genreCss,
  'artists-overview': artistsOverviewCss,
  search: searchCss,
  detail: detailCss,
  photos: photosCss,
  trailer: trailerCss,
  celebrities: celebritiesCss,
  personage: personageCss,
  'user-profile': userProfileCss,
  'movie-profile': movieProfileCss,
  doulists: doulistsCss,
  'doulist-detail': doulistDetailCss,
  'user-media': userMediaCss,
  'user-celebrities': userCelebritiesCss,
  'user-reviews': userReviewsCss,
  'review-detail': reviewDetailCss,
  albums: albumsCss,
  interest: interestCss,
}

// ---- Music Homepage mount ----

async function mountMusicHomepage(): Promise<void> {
  const css = composeStylesForPage('music-homepage', cssMap)
  const { default: App } = await import('./pages/music-homepage/App.vue')
  mountUmmOverlay({
    overlayId: 'umm-douban-overlay',
    css,
    createApp: () => createApp(App),
  })
}

// ---- Genre page mount ----

async function mountGenrePage(): Promise<void> {
  const css = composeStylesForPage('genre', cssMap)
  const { default: App } = await import('./pages/genre/App.vue')
  const { extractGenrePage } = await import('./pages/genre/extractors')

  mountUmmOverlay({
    overlayId: 'umm-douban-overlay',
    css,
    async beforeMount() {
      const data = extractGenrePage()
      if (!data) throw new Error('[UMM] Could not extract genre page data')
      hideNavForPage({ type: 'genre' })
      return data
    },
    createApp(_shadow, ctx) {
      return createApp(App, { data: ctx as import('./pages/genre/types').GenrePageData })
    },
  })
}

// ---- Artists overview mount ----

async function mountArtistsOverview(): Promise<void> {
  const css = composeStylesForPage('artists-overview', cssMap)
  const { default: App } = await import('./pages/artists-overview/App.vue')
  const { extractArtistsOverview } = await import('./pages/artists-overview/extractors')

  mountUmmOverlay({
    overlayId: 'umm-douban-overlay',
    css,
    async beforeMount() {
      const data = extractArtistsOverview()
      if (!data) throw new Error('[UMM] Could not extract artists overview data')
      hideNavForPage({ type: 'artists-overview' })
      return data
    },
    createApp(_shadow, ctx) {
      return createApp(App, { data: ctx as import('./pages/artists-overview/types').ArtistsOverviewData })
    },
  })
}

// ---- Homepage mount ----

async function mountHomepage(): Promise<void> {
  const css = composeStylesForPage('homepage', cssMap)
  const { default: App } = await import('./pages/homepage/App.vue')
  mountUmmOverlay({
    overlayId: 'umm-douban-overlay',
    css,
    createApp: () => createApp(App),
  })
}

// ---- Search page mount ----

async function mountSearch(): Promise<void> {
  const css = composeStylesForPage('search', cssMap)
  const { default: App } = await import('./pages/search/App.vue')
  const { parseSearchData } = await import('./pages/search/search-data')
  const { loadRecordMap } = await import('./shared/load-record-map')

  mountUmmOverlay({
    overlayId: 'umm-search-overlay',
    css,
    async beforeMount() {
      const type = location.href.includes('search.douban.com/music') ? 'music' : 'movie'
      const [searchData, recordMap] = await Promise.all([
        parseSearchData(),
        loadRecordMap(type),
      ])
      return { searchData, recordMap }
    },
    createApp(_shadow, ctx) {
      const { searchData, recordMap } = ctx as {
        searchData: import('./pages/search/types').DoubanSearchData | undefined
        recordMap: Map<string, import('@/types').StoreRecord>
      }
      return createApp(App, { searchData, recordMap })
    },
  })
}

// ---- Albums (version list) page mount ----

async function mountAlbums(): Promise<void> {
  const css = composeStylesForPage('albums', cssMap)
  const { default: App } = await import('./pages/albums/App.vue')
  const { extractAlbumsData } = await import('./pages/albums/albums-data')
  const { loadRecordMap } = await import('./shared/load-record-map')
  type AlbumsPageData = import('./pages/albums/types').AlbumsPageData

  mountUmmOverlay({
    overlayId: 'umm-douban-overlay',
    css,
    async beforeMount() {
      const [data, recordMap] = await Promise.all([
        extractAlbumsData(),
        loadRecordMap(),
      ])
      if (!data) throw new Error('[UMM] Could not extract albums data')
      hideNavForPage({ type: 'albums' })
      return { data, recordMap }
    },
    createApp(_shadow, ctx) {
      const { data, recordMap } = ctx as {
        data: AlbumsPageData
        recordMap: Map<string, import('@/types').StoreRecord>
      }
      return createApp(App, { data, recordMap })
    },
  })
}

// ---- Detail page mount ----

async function mountDetail(): Promise<void> {
  const css = composeStylesForPage('detail', cssMap)
  const { default: App } = await import('./pages/detail/App.vue')
  const { extractDetailData, loadRecord } = await import('./pages/detail/detail-data')
  type DetailData = import('./pages/detail/detail-data').DetailData

  mountUmmOverlay({
    overlayId: 'umm-detail-mask',
    css,
    async beforeMount() {
      const detailData = await extractDetailData()
      if (!detailData) {
        throw new Error('[UMM] Could not extract detail data from page')
      }
      detailData.record = await loadRecord(detailData.identity)
      const mediaType = location.href.includes('music.douban.com') ? 'music' : 'movie'
      hideNavForPage({ type: 'detail', mediaType })
      return detailData
    },
    createApp(_shadow: ShadowRoot, ctx?: unknown) {
      return createApp(App, { detailData: ctx as DetailData })
    },
    afterMount(_shadow: ShadowRoot, app: ReturnType<typeof createApp>, _container: HTMLDivElement, ctx?: unknown) {
      const detailData = ctx as DetailData
      const recordPoller = setInterval(async () => {
        if (!detailData.identity) return
        const updated = await loadRecord(detailData.identity)
        if (updated && app && app._instance) {
          const vm = app._instance?.proxy as unknown as Record<string, unknown>
          if (vm && typeof vm.updateRecord === 'function') {
            vm.updateRecord(updated)
          }
        }
      }, 3000)

      ;(window as unknown as Record<string, unknown>).__ummDismissDetailMask = () => {
        clearInterval(recordPoller)
        app.unmount()
      }
    },
  })
}

// ---- Photos page mount ----

async function mountPhotos(): Promise<void> {
  const css = composeStylesForPage('photos', cssMap)
  const { default: App } = await import('./pages/photos/App.vue')
  const { extractPhotosPageData } = await import('./pages/photos/photos-data')
  type PhotosPageData = import('./pages/photos/photos-data').PhotosPageData

  mountUmmOverlay({
    overlayId: 'umm-photos-overlay',
    css,
    async beforeMount() {
      const data = extractPhotosPageData()
      if (!data) {
        throw new Error('[UMM] Could not extract photos data from page')
      }
      hideNavForPage({ type: 'photos' })
      return data
    },
    createApp(_shadow: ShadowRoot, ctx?: unknown) {
      return createApp(App, { data: ctx as PhotosPageData })
    },
  })
}

// ---- Trailer page mount ----

async function mountTrailer(): Promise<void> {
  const css = composeStylesForPage('trailer', cssMap)
  const { default: App } = await import('./pages/trailer/App.vue')
  const { extractTrailerData } = await import('./pages/trailer/trailer-data')
  type TrailerPageData = import('./pages/trailer/trailer-data').TrailerPageData

  mountUmmOverlay({
    overlayId: 'umm-trailer-overlay',
    css,
    async beforeMount() {
      const data = extractTrailerData()
      if (!data) throw new Error('[UMM] Could not extract trailer data')
      hideNavForPage({ type: 'trailer' })

      // Disable native video player to prevent auto-play / audio bleed
      document.querySelectorAll<HTMLVideoElement>('video').forEach((v) => {
        v.pause()
        v.removeAttribute('src')
        v.load()
      })
      // Remove native player containers entirely — pause/hide is insufficient
      // because video.js may recreate elements or keep audio playing
      document.querySelectorAll<HTMLElement>(
        '#player, #movie_player, .html5-video-container, .stage-cont'
      ).forEach((el) => {
        el.remove()
      })

      return data
    },
    createApp(_shadow, ctx) {
      return createApp(App, { data: ctx as TrailerPageData })
    },
  })
}

// ---- Celebrities page mount ----

async function mountCelebrities(): Promise<void> {
  const css = composeStylesForPage('celebrities', cssMap)
  const { default: App } = await import('./pages/celebrities/App.vue')
  const { extractCelebritiesPageData } = await import('./pages/celebrities/celebrities-data')
  type CelebritiesPageData = import('./pages/celebrities/celebrities-data').CelebritiesPageData

  mountUmmOverlay({
    overlayId: 'umm-celebrities-overlay',
    css,
    async beforeMount() {
      const data = extractCelebritiesPageData()
      if (!data) throw new Error('[UMM] Could not extract celebrities data')
      hideNavForPage({ type: 'celebrities' })
      return data
    },
    createApp(_shadow, ctx) {
      return createApp(App, { data: ctx as CelebritiesPageData })
    },
  })
}

// ---- Personage page mount ----

async function mountPersonage(): Promise<void> {
  const css = composeStylesForPage('personage', cssMap)
  const { default: App } = await import('./pages/personage/App.vue')
  const { extractPersonagePageData } = await import('./pages/personage/personage-data')
  const { loadRecordMap } = await import('./shared/load-record-map')
  type PersonagePageData = import('./pages/personage/personage-data').PersonagePageData

  mountUmmOverlay({
    overlayId: 'umm-personage-overlay',
    css,
    async beforeMount() {
      // Retry extraction — native JS may replace bottom sections (works,
      // partners) after initial DOM paint. Poll 5 times with backoff.
      let data: PersonagePageData | null = null
      for (let i = 0; i < 5; i++) {
        data = extractPersonagePageData()
        if (data && (data.recentWorks.length > 0 || data.partners.length > 0)) break
        await new Promise((r) => setTimeout(r, 500 * (i + 1)))
      }
      if (!data) throw new Error('[UMM] Could not extract personage data')

      // Enrich works with record status from IndexedDB
      try {
        const recordMap = await loadRecordMap()
        for (const work of [...data.recentWorks, ...data.popularWorks]) {
          const subjectId = work.url.match(/\/subject\/(\d+)/)?.[1]
          if (!subjectId) continue
          const rec = recordMap.get(subjectId)
          if (rec && rec.status > 0) {
            work.recordStatus = rec.status
            work.recordRating = rec.rating
          }
        }
      } catch { /* silent */ }

      hideNavForPage({ type: 'personage' })
      return data
    },
    createApp(_shadow, ctx) {
      return createApp(App, { data: ctx as PersonagePageData })
    },
  })
}

// ---- User Profile mount ----

async function mountUserProfile(): Promise<void> {
  const css = composeStylesForPage('user-profile', cssMap)
  const { default: App } = await import('./pages/user-profile/App.vue')
  const { extractUserProfileData } = await import('./pages/user-profile/user-profile-data')
  type UserProfileData = import('./pages/user-profile/types').UserProfileData

  mountUmmOverlay({
    overlayId: 'umm-douban-overlay',
    css,
    async beforeMount() {
      // Retry extraction — movie/music/book sections may load async via /j/mine/page
      let data: UserProfileData | null = null
      for (let i = 0; i < 5; i++) {
        data = extractUserProfileData()
        if (data && (data.movieStats.collect > 0 || data.musicStats.collect > 0 || data.bookStats.collect > 0)) break
        await new Promise((r) => setTimeout(r, 500 * (i + 1)))
      }
      if (!data) throw new Error('[UMM] Could not extract user profile data')
      hideNavForPage({ type: 'user-profile' })
      return data
    },
    createApp(_shadow, ctx) {
      return createApp(App, { data: ctx as UserProfileData })
    },
  })
}

// ---- Movie Profile mount ----

async function mountMovieProfile(): Promise<void> {
  const css = composeStylesForPage('movie-profile', cssMap)
  const { default: App } = await import('./pages/movie-profile/App.vue')
  const { extractMovieProfileData } = await import('./pages/movie-profile/movie-profile-data')
  type MovieProfileData = import('./pages/movie-profile/types').MovieProfileData

  mountUmmOverlay({
    overlayId: 'umm-douban-overlay',
    css,
    async beforeMount() {
      let data: MovieProfileData | null = null
      for (let i = 0; i < 5; i++) {
        data = extractMovieProfileData()
        if (data && data.stats.length > 0) break
        await new Promise((r) => setTimeout(r, 500 * (i + 1)))
      }
      if (!data) throw new Error('[UMM] Could not extract movie profile data')
      hideNavForPage({ type: 'movie-profile' })
      return data
    },
    createApp(_shadow, ctx) {
      return createApp(App, { data: ctx as MovieProfileData })
    },
  })
}

// ---- Doulists mount ----

async function mountDoulists(): Promise<void> {
  const css = composeStylesForPage('doulists', cssMap)
  const { default: App } = await import('./pages/doulists/App.vue')
  const { extractDoulistsData } = await import('./pages/doulists/doulists-data')
  type DoulistsPageData = import('./pages/doulists/types').DoulistsPageData

  mountUmmOverlay({
    overlayId: 'umm-douban-overlay',
    css,
    async beforeMount() {
      const data = extractDoulistsData()
      if (!data) throw new Error('[UMM] Could not extract doulists data')
      hideNavForPage({ type: 'doulists' })
      return data
    },
    createApp(_shadow, ctx) {
      return createApp(App, { data: ctx as DoulistsPageData })
    },
  })
}

// ---- Doulist Detail mount ----

async function mountDoulistDetail(): Promise<void> {
  const css = composeStylesForPage('doulist-detail', cssMap)
  const { default: App } = await import('./pages/doulist-detail/App.vue')
  const { extractDoulistDetailData } = await import('./pages/doulist-detail/doulist-detail-data')
  const { loadRecordMap } = await import('./shared/load-record-map')
  type DoulistDetailPageData = import('./pages/doulist-detail/types').DoulistDetailPageData

  mountUmmOverlay({
    overlayId: 'umm-douban-overlay',
    css,
    async beforeMount() {
      const data = extractDoulistDetailData()
      if (!data) throw new Error('[UMM] Could not extract doulist detail data')
      hideNavForPage({ type: 'doulist-detail' })

      // Enrich items with record status from IndexedDB
      try {
        const recordMap = await loadRecordMap()
        return { data, recordMap }
      } catch {
        return { data, recordMap: undefined }
      }
    },
    createApp(_shadow, ctx) {
      const { data, recordMap } = ctx as {
        data: DoulistDetailPageData
        recordMap?: Map<string, import('@/types').StoreRecord>
      }
      return createApp(App, { data, recordMap })
    },
  })
}

// ---- User Media (collections/wishlist/doing) mount ----

async function mountUserMedia(): Promise<void> {
  const css = composeStylesForPage('user-media', cssMap)
  const { default: App } = await import('./pages/user-media/App.vue')
  const { extractUserMediaData } = await import('./pages/user-media/user-media-data')
  type UserMediaPageData = import('./pages/user-media/types').UserMediaPageData

  mountUmmOverlay({
    overlayId: 'umm-douban-overlay',
    css,
    async beforeMount() {
      // Retry extraction — items may not be in DOM immediately
      let data: UserMediaPageData | null = null
      for (let i = 0; i < 8; i++) {
        data = extractUserMediaData()
        if (data && (data.items.length > 0 || data.total === 0)) break
        await new Promise((r) => setTimeout(r, 300 * (i + 1)))
      }
      if (!data) {
        data = { subType: getUserMediaSubType(location.href), userId: '', displayName: '', avatarUrl: '', navLinks: [], sortOptions: [], filterGroups: [], currentPage: '', total: 0, mode: 'grid' as const, items: [], pageLinks: [], prevPageUrl: '', nextPageUrl: '' }
      }
      hideNavForPage({ type: 'user-media', subType: getUserMediaSubType(location.href) })
      return data
    },
    createApp(_shadow, ctx) {
      return createApp(App, { data: ctx as UserMediaPageData })
    },
  })
}

// ---- User Celebrities mount ----

async function mountUserCelebrities(): Promise<void> {
  const css = composeStylesForPage('user-celebrities', cssMap)
  const { default: App } = await import('./pages/user-celebrities/App.vue')
  const { extractUserCelebritiesData } = await import('./pages/user-celebrities/user-celebrities-data')
  type UserCelebritiesData = import('./pages/user-celebrities/types').UserCelebritiesData

  mountUmmOverlay({
    overlayId: 'umm-douban-overlay',
    css,
    async beforeMount() {
      const data = extractUserCelebritiesData()
      if (!data) throw new Error('[UMM] Could not extract celebrity data')
      hideNavForPage({ type: 'user-celebrities' })
      return data
    },
    createApp(_shadow, ctx) {
      return createApp(App, { data: ctx as UserCelebritiesData })
    },
  })
}

// ---- Review Detail mount ----

async function mountReviewDetail(): Promise<void> {
  const css = composeStylesForPage('review-detail', cssMap)
  const { default: App } = await import('./pages/review-detail/App.vue')
  const { extractReviewDetailData } = await import('./pages/review-detail/review-detail-data')
  type ReviewDetailData = import('./pages/review-detail/types').ReviewDetailData

  mountUmmOverlay({
    overlayId: 'umm-douban-overlay',
    css,
    async beforeMount() {
      let data: ReviewDetailData | null = null
      for (let i = 0; i < 8; i++) {
        data = extractReviewDetailData()
        if (data) break
        await new Promise(r => setTimeout(r, 300))
      }
      if (!data) throw new Error('[UMM] Could not extract review detail data')
      hideNavForPage({ type: 'review-detail' })
      return data
    },
    createApp(_shadow, ctx) {
      return createApp(App, { data: ctx as ReviewDetailData })
    },
  })
}

// ---- User Reviews mount ----

async function mountUserReviews(): Promise<void> {
  const css = composeStylesForPage('user-reviews', cssMap)
  const { default: App } = await import('./pages/user-reviews/App.vue')
  const { extractUserReviewsData } = await import('./pages/user-reviews/user-reviews-data')
  type UserReviewsData = import('./pages/user-reviews/types').UserReviewsData

  mountUmmOverlay({
    overlayId: 'umm-douban-overlay',
    css,
    async beforeMount() {
      // Retry extraction — DOM may not be immediately accessible
      let data: UserReviewsData | null = null
      for (let i = 0; i < 8; i++) {
        data = extractUserReviewsData()
        if (data && (data.items.length > 0 || data.total > 0)) break
        await new Promise(r => setTimeout(r, 300))
      }
      if (!data) throw new Error('[UMM] Could not extract reviews data')
      hideNavForPage({ type: 'user-reviews' })
      return data
    },
    createApp(_shadow, ctx) {
      return createApp(App, { data: ctx as UserReviewsData })
    },
  })
}

// ---- Public API ----

/**
 * Mount the appropriate Vue app for the current Douban page.
 * Call from document_idle content script.
 */
export async function mountDoubanMain(): Promise<void> {
  try {
    const pageType = detectPageType()
    if (!pageType) throw new Error('Unknown Douban page type')
    switch (pageType.type) {
      case 'albums': await mountAlbums(); break
      case 'music-homepage': await mountMusicHomepage(); break
      case 'genre': await mountGenrePage(); break
      case 'artists-overview': await mountArtistsOverview(); break
      case 'homepage': await mountHomepage(); break
      case 'search': await mountSearch(); break
      case 'photos': await mountPhotos(); break
      case 'celebrities': await mountCelebrities(); break
      case 'trailer': await mountTrailer(); break
      case 'video': await mountTrailer(); break
      case 'detail': await mountDetail(); break
      case 'personage': await mountPersonage(); break
      case 'user-profile': await mountUserProfile(); break
case 'movie-profile': await mountMovieProfile(); break
      case 'doulists': await mountDoulists(); break
      case 'doulist-detail': await mountDoulistDetail(); break
      case 'user-media': await mountUserMedia(); break
      case 'user-celebrities': await mountUserCelebrities(); break
      case 'user-reviews': await mountUserReviews(); break
      case 'review-detail': await mountReviewDetail(); break
    }
  } catch (err) {
    console.warn('[UMM] mountDoubanMain error:', err)
  }
}
