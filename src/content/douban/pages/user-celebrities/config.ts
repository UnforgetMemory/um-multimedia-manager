import { definePageMount } from '../../mount-factory'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { hideNavForPage } from '../../shared/hide-nav'

export const mountUserCelebrities = definePageMount({
  cssPreset: 'user-celebrities',
  overlayId: 'umm-douban-overlay',
  importApp: () => import('./App'),
  async beforeMount() {
    const { extractUserCelebritiesData } = await import('./user-celebrities-data')
    const data = extractUserCelebritiesData()
    if (!data) throw new Error('[UMM] Could not extract celebrity data')
    hideNavForPage({ type: 'user-celebrities' })
    return data
  },
  createApp: (RootCmp, container, data) => { const root = createRoot(container); root.render(React.createElement(RootCmp, { data })); return root },
})
