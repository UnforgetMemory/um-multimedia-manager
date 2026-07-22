import { definePageMount } from '../../mount-factory'
import { createApp } from 'vue'
import { hideNavForPage } from '../../shared/hide-nav'
import { loadRecordMap } from '../../shared/load-record-map'

/** Mount config for the Douban book series page overlay */
export const mountSeries = definePageMount({
  cssPreset: 'series',
  overlayId: 'umm-douban-overlay',
  importApp: () => import('./App.vue'),
  async beforeMount() {
    const { extractSeriesData } = await import('./data')

    // Retry extraction up to 8 times with increasing delay
    let data: import('./types').SeriesPageData | null = null
    for (let i = 0; i < 8; i++) {
      data = extractSeriesData()
      if (data && (data.items.length > 0 || data.volumes > 0)) break
      await new Promise(r => setTimeout(r, 300 * (i + 1)))
    }
    if (!data) throw new Error('[UMM] Could not extract series page data')
    hideNavForPage({ type: 'series' })

    // Enrich items with book record status from IndexedDB
    try {
      const recordMap = await loadRecordMap('book')
      return { data, recordMap }
    } catch {
      return { data, recordMap: undefined as Map<string, import('@/types').StoreRecord> | undefined }
    }
  },
  createApp: (RootCmp, data) => createApp(RootCmp, data),
})
