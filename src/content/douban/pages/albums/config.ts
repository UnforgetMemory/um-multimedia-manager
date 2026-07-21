import { definePageMount } from '../../mount-factory'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { hideNavForPage } from '../../shared/hide-nav'
import { loadRecordMap } from '../../shared/load-record-map'

export const mountAlbums = definePageMount({
  cssPreset: 'albums',
  overlayId: 'umm-douban-overlay',
  importApp: () => import('./App'),
  async beforeMount() {
    const { extractAlbumsData } = await import('./albums-data')
    const [data, recordMap] = await Promise.all([
      extractAlbumsData(),
      loadRecordMap(),
    ])
    if (!data) throw new Error('[UMM] Could not extract albums data')
    hideNavForPage({ type: 'albums' })
    return { data, recordMap }
  },
  createApp: (RootCmp, container, data) => { const root = createRoot(container); root.render(React.createElement(RootCmp, data)); return root },
})
