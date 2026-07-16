import { definePageMount } from '../../mount-factory'
import { createApp } from 'vue'
import { hideNavForPage } from '../../shared/hide-nav'
import { getUserMediaSubType } from '../../shared/url-detector'

export const mountUserMedia = definePageMount({
  cssPreset: 'user-media',
  overlayId: 'umm-douban-overlay',
  importApp: () => import('./App.vue'),
  async beforeMount() {
    const { extractUserMediaData } = await import('./user-media-data')

    // Retry extraction — items may not be in DOM immediately
    let data: import('./types').UserMediaPageData | null = null
    for (let i = 0; i < 8; i++) {
      data = extractUserMediaData()
      if (data && (data.items.length > 0 || data.total === 0)) break
      await new Promise((r) => setTimeout(r, 300 * (i + 1)))
    }
    if (!data) {
      data = {
        subType: getUserMediaSubType(location.href),
        userId: '',
        displayName: '',
        avatarUrl: '',
        navLinks: [],
        sortOptions: [],
        filterGroups: [],
        currentPage: '',
        total: 0,
        mode: 'grid' as const,
        items: [],
        pageLinks: [],
        prevPageUrl: '',
        nextPageUrl: '',
      }
    }
    hideNavForPage({ type: 'user-media', subType: getUserMediaSubType(location.href) })
    return data
  },
  createApp: (RootCmp, data) => createApp(RootCmp, { data }),
})
