import { definePageMount } from '../../mount-factory'
import { createApp } from 'vue'
import { hideNavForPage } from '../../shared/hide-nav'
import { withRetry } from '../../shared/retry'
import { getUserMediaSubType } from '../../shared/url-detector'

export const mountUserMedia = definePageMount({
  cssPreset: 'user-media',
  overlayId: 'umm-douban-overlay',
  importApp: () => import('./App.vue'),
  async beforeMount() {
    const { extractUserMediaData } = await import('./user-media-data')

    // Retry extraction — items may not be in DOM immediately
    let data: import('./types').UserMediaPageData | null = await withRetry(
      () => extractUserMediaData(),
      { attempts: 8, baseDelay: 300, isValid: (d) => d && (d.items.length > 0 || d.total === 0) },
    )
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
