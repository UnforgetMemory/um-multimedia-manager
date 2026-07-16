import { definePageMount } from '../../mount-factory'
import { createApp } from 'vue'
import { hideNavForPage } from '../../shared/hide-nav'
import { getBookCollectSubType } from '../../shared/url-detector'

/** Mount config for the Douban user book collection page overlay */
export const mountBookCollect = definePageMount({
  cssPreset: 'book-collect',
  overlayId: 'umm-douban-overlay',
  importApp: () => import('./App.vue'),
  async beforeMount() {
    const { extractBookCollectData } = await import('./book-collect-data')

    // Retry extraction up to 8 times with increasing delay
    let data: import('./types').BookCollectData | null = null
    for (let i = 0; i < 8; i++) {
      data = extractBookCollectData()
      if (data && (data.items.length > 0 || data.total === 0)) break
      await new Promise(r => setTimeout(r, 300 * (i + 1)))
    }
    if (!data) {
      data = {
        subType: getBookCollectSubType(location.href),
        userId: '',
        displayName: '',
        avatarUrl: '',
        navLinks: [],
        sortOptions: [],
        currentPage: '',
        total: 0,
        mode: 'grid' as const,
        items: [],
        pageLinks: [],
        prevPageUrl: '',
        nextPageUrl: '',
      }
    }
    hideNavForPage({ type: 'book-collect', subType: getBookCollectSubType(location.href) })
    return data
  },
  createApp: (RootCmp, data) => createApp(RootCmp, { data }),
})
