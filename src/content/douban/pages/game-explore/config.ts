import { definePageMount } from '../../mount-factory'
import { createApp } from 'vue'
import { loadRecordMap } from '../../shared/load-record-map'

export const mountGameExplore = definePageMount({
  cssPreset: 'game-explore',
  overlayId: 'umm-douban-overlay',
  importApp: () => import('./App.vue'),
  async beforeMount() {
    const { parseGameExploreData } = await import('./game-explore-data')
    const exploreData = await parseGameExploreData()
    // Thread visible game ids for a targeted batch read (falls back to
    // full-store scan when parsing produced no items)
    const ids = exploreData?.items?.filter((i) => i.id).map((i) => String(i.id))
    const recordMap = await loadRecordMap('game', ids)
    return { exploreData, recordMap }
  },
  createApp: (RootCmp, data) => createApp(RootCmp, data),
})
