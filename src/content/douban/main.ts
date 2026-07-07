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
import albumsCss from './styles/albums.css?raw'
import pageLayoutCss from './styles/page-layout.css?raw'
import componentsCss from './styles/components.css?raw'
import interestCss from './styles/interest.css?raw'
import { mountUmmOverlay } from './overlay'
import { composeStylesForPage } from './css-composer'
import { createApp } from 'vue'
import { detectPageType } from './shared/url-detector'
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
      hideNavForPage({ type: 'personage' })
      return data
    },
    createApp(_shadow, ctx) {
      return createApp(App, { data: ctx as PersonagePageData })
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
    }
  } catch (err) {
    console.warn('[UMM] mountDoubanMain error:', err)
  }
}
