import { definePageMount } from '../../mount-factory'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { hideNavForPage } from '../../shared/hide-nav'
import { loadRecordMap } from '../../shared/load-record-map'

export const mountDoulistDetail = definePageMount({
  cssPreset: 'doulist-detail',
  overlayId: 'umm-douban-overlay',
  importApp: () => import('./App'),
  async beforeMount() {
    const { extractDoulistDetailData } = await import('./doulist-detail-data')
    const data = extractDoulistDetailData()
    if (!data) throw new Error('[UMM] Could not extract doulist detail data')
    hideNavForPage({ type: 'doulist-detail' })

    // Enrich items with record status from IndexedDB
    try {
      const recordMap = await loadRecordMap()
      return { data, recordMap }
    } catch {
      return { data, recordMap: undefined as (Map<string, import('@/types').StoreRecord> | undefined) }
    }
  },
  createApp: (RootCmp, container, data) => { const root = createRoot(container); root.render(React.createElement(RootCmp, data)); return root },
})
