import { definePageMount } from '../../mount-factory'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { hideNavForPage } from '../../shared/hide-nav'

export const mountCelebrities = definePageMount({
  cssPreset: 'celebrities',
  overlayId: 'umm-celebrities-overlay',
  importApp: () => import('./App'),
  async beforeMount() {
    const { extractCelebritiesPageData } = await import('./celebrities-data')
    const data = extractCelebritiesPageData()
    if (!data) throw new Error('[UMM] Could not extract celebrities data')
    hideNavForPage({ type: 'celebrities' })
    return data
  },
  createApp: (RootCmp, container, data) => { const root = createRoot(container); root.render(React.createElement(RootCmp, { data })); return root },
})
