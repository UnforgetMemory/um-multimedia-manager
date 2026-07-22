import { definePageMount } from '../../mount-factory'
import { createApp } from 'vue'
import { hideNavForPage } from '../../shared/hide-nav'
import { getMusicCollectSubType } from '../../shared/url-detector'

/** Mount config for the Douban user music collection page overlay */
export const mountMusicCollect = definePageMount({
  cssPreset: 'music-collect',
  overlayId: 'umm-douban-overlay',
  importApp: () => import('./App.vue'),
  async beforeMount() {
    const { extractMusicCollectData } = await import('./music-collect-data')

    // Retry extraction up to 8 times with increasing delay
    let data: import('./types').MusicCollectData | null = null
    for (let i = 0; i < 8; i++) {
      data = extractMusicCollectData()
      if (data && (data.items.length > 0 || data.total === 0)) break
      await new Promise(r => setTimeout(r, 300 * (i + 1)))
    }
    if (!data) {
      data = {
        subType: getMusicCollectSubType(location.href),
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
    hideNavForPage({ type: 'music-collect', subType: getMusicCollectSubType(location.href) })
    return data
  },
  createApp: (RootCmp, data) => createApp(RootCmp, { data }),
})
