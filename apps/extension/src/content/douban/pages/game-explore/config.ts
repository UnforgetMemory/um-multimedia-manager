import { definePageMount } from '../../mount-factory'
import { createApp } from 'vue'
import { loadRecordMap } from '../../shared/load-record-map'

export const mountGameExplore = definePageMount({
  cssPreset: 'game-explore',
  overlayId: 'umm-douban-overlay',
  importApp: () => import('./App.vue'),
  async beforeMount() {
    const { parseGameExploreData } = await import('./game-explore-data')
    const [exploreData, recordMap] = await Promise.all([
      parseGameExploreData(),
      loadRecordMap('game'),
    ])
    return { exploreData, recordMap }
  },
  createApp: (RootCmp, data) => createApp(RootCmp, data),
})
