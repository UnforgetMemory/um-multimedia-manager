import { definePageMount } from '../../mount-factory'
import { createApp } from 'vue'
import { hideNavForPage } from '../../shared/hide-nav'
import { loadRecordMap } from '../../shared/load-record-map'

export const mountDoulistDetail = definePageMount({
  cssPreset: 'doulist-detail',
  overlayId: 'umm-douban-overlay',
  importApp: () => import('./App.vue'),
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
  createApp: (RootCmp, data) => createApp(RootCmp, data),
})
