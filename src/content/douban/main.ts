/**
 * Unified main entry factory for Douban pages.
 *
 * Routes to the correct page mount function based on URL:
 * - Homepage (movie.douban.com/) → mountHomepage()
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
import searchCss from './styles/search.css?raw'
import detailCss from './styles/detail.css?raw'
import { mountUmmOverlay } from './overlay'
import { composeStyles } from './css-composer'
import { createApp } from 'vue'

// ---- URL detection ----

function isHomepage(url: string): boolean {
  return /^https?:\/\/movie\.douban\.com\/?(\?.*)?$/.test(url)
}

function isSearchPage(url: string): boolean {
  return /^https?:\/\/search\.douban\.com\/(movie|music)\/subject_search/.test(url)
}

function isDetailPage(url: string): boolean {
  return /^https?:\/\/(movie|music)\.douban\.com\/subject\//.test(url)
}

// ---- Homepage mount ----

async function mountHomepage(): Promise<void> {
  const css = composeStyles(
    { name: 'theme', css: themeCss },
    { name: 'common', css: commonCss },
    { name: 'breakpoints', css: breakpointsCss },
    { name: 'components', css: homepageCss },
  )
  const { default: App } = await import('./pages/homepage/App.vue')
  mountUmmOverlay({
    overlayId: 'umm-douban-overlay',
    css,
    createApp: () => createApp(App),
  })
}

// ---- Search page mount ----

async function mountSearch(): Promise<void> {
  const css = composeStyles(
    { name: 'theme', css: themeCss },
    { name: 'common', css: commonCss },
    { name: 'components', css: searchCss },
  )
  const { default: App } = await import('./pages/search/App.vue')
  const { parseSearchData, loadRecordMap } = await import('./pages/search/search-data')

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

// ---- Detail page mount ----

async function mountDetail(): Promise<void> {
  const css = composeStyles(
    { name: 'theme', css: themeCss },
    { name: 'common', css: commonCss },
    { name: 'components', css: detailCss },
  )
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

      const globalNav = document.getElementById('db-global-nav')
      const movieNav = document.getElementById('db-nav-movie')
      const musicNav = document.getElementById('db-nav-music')
      if (globalNav) globalNav.style.display = 'none'
      if (movieNav) movieNav.style.display = 'none'
      if (musicNav) musicNav.style.display = 'none'

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

// ---- Public API ----

/**
 * Mount the appropriate Vue app for the current Douban page.
 * Call from document_idle content script.
 */
export async function mountDoubanMain(): Promise<void> {
  const url = location.href
  try {
    if (isHomepage(url)) {
      await mountHomepage()
    } else if (isSearchPage(url)) {
      await mountSearch()
    } else if (isDetailPage(url)) {
      await mountDetail()
    } else {
      console.warn('[UMM] Unknown Douban page type — skipping mount')
    }
  } catch (err) {
    console.warn('[UMM] mountDoubanMain error:', err)
  }
}
