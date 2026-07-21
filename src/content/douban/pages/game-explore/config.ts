import { definePageMount } from '../../mount-factory'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { loadRecordMap } from '../../shared/load-record-map'

export const mountGameExplore = definePageMount({
  cssPreset: 'game-explore',
  overlayId: 'umm-douban-overlay',
  importApp: () => import('./App'),
  async beforeMount() {
    const { parseGameExploreData } = await import('./game-explore-data')
    const [exploreData, recordMap] = await Promise.all([
      parseGameExploreData(),
      loadRecordMap('game'),
    ])
    return { exploreData, recordMap }
  },
  createApp: (RootCmp, container, data) => { const root = createRoot(container); root.render(React.createElement(RootCmp, data)); return root },
})
