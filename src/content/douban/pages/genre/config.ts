import { definePageMount } from '../../mount-factory'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { hideNavForPage } from '../../shared/hide-nav'

export const mountGenre = definePageMount({
  cssPreset: 'genre',
  overlayId: 'umm-douban-overlay',
  importApp: () => import('./App'),
  async beforeMount() {
    const { extractGenrePage } = await import('./extractors')
    const data = extractGenrePage()
    if (!data) throw new Error('[UMM] Could not extract genre page data')
    hideNavForPage({ type: 'genre' })
    return data
  },
  createApp: (RootCmp, container, data) => { const root = createRoot(container); root.render(React.createElement(RootCmp, { data })); return root },
})
