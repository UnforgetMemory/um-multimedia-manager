import { definePageMount } from '../../mount-factory'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { hideNavForPage } from '../../shared/hide-nav'

export const mountDoulists = definePageMount({
  cssPreset: 'doulists',
  overlayId: 'umm-douban-overlay',
  importApp: () => import('./App'),
  async beforeMount() {
    const { extractDoulistsData } = await import('./doulists-data')
    const data = extractDoulistsData()
    if (!data) throw new Error('[UMM] Could not extract doulists data')
    hideNavForPage({ type: 'doulists' })
    return data
  },
  createApp: (RootCmp, container, data) => { const root = createRoot(container); root.render(React.createElement(RootCmp, { data })); return root },
})
