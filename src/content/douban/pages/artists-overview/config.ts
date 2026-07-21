import { definePageMount } from '../../mount-factory'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { hideNavForPage } from '../../shared/hide-nav'

export const mountArtistsOverview = definePageMount({
  cssPreset: 'artists-overview',
  overlayId: 'umm-douban-overlay',
  importApp: () => import('./App'),
  async beforeMount() {
    const { extractArtistsOverview } = await import('./extractors')
    const data = extractArtistsOverview()
    if (!data) throw new Error('[UMM] Could not extract artists overview data')
    hideNavForPage({ type: 'artists-overview' })
    return data
  },
  createApp: (RootCmp, container, data) => { const root = createRoot(container); root.render(React.createElement(RootCmp, { data })); return root },
})
