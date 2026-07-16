import { definePageMount } from '../../mount-factory'
import { createApp } from 'vue'
import { hideNavForPage } from '../../shared/hide-nav'

export const mountGameCollect = definePageMount({
  cssPreset: 'game-collect',
  overlayId: 'umm-douban-overlay',
  importApp: () => import('./App.vue'),
  async beforeMount() {
    const { extractGameCollectData } = await import('./game-collect-data')
    let data: import('./types').GameCollectData | null = null
    for (let i = 0; i < 8; i++) {
      data = extractGameCollectData()
      if (data && (data.items.length > 0 || data.total === 0)) break
      await new Promise(r => setTimeout(r, 300 * (i + 1)))
    }
    if (!data) {
      const subType: import('./types').GameCollectData['subType'] =
        location.href.includes('action=wish') ? 'wish'
        : location.href.includes('action=do') ? 'do'
        : 'collect'
      data = {
        subType, userId: '', displayName: '', avatarUrl: '',
        navLinks: [], currentPage: '', total: 0,
        items: [], pageLinks: [],
        prevPageUrl: '', nextPageUrl: '',
      }
    }
    hideNavForPage({ type: 'game-collect', subType: data.subType })
    return data
  },
  createApp: (RootCmp, data) => createApp(RootCmp, { data }),
})
