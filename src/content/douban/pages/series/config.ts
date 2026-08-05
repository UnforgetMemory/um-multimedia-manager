import { definePageMount } from '../../mount-factory'
import { createApp } from 'vue'
import { hideNavForPage } from '../../shared/hide-nav'
import { withRetry } from '../../shared/retry'
import { loadRecordMap } from '../../shared/load-record-map'

/** Mount config for the Douban book series page overlay */
export const mountSeries = definePageMount({
  cssPreset: 'series',
  overlayId: 'umm-douban-overlay',
  importApp: () => import('./App.vue'),
  async beforeMount() {
    const { extractSeriesData } = await import('./data')

    // Retry extraction up to 8 times with increasing delay
    const data: import('./types').SeriesPageData | null = await withRetry(
      () => extractSeriesData(),
      { attempts: 8, baseDelay: 300, isValid: (d) => d && (d.items.length > 0 || d.volumes > 0) },
    )
    if (!data) throw new Error('[UMM] Could not extract series page data')
    hideNavForPage({ type: 'series' })

    // Enrich items with book record status from IndexedDB
    try {
      const ids = data.items.filter((i) => i.subjectId).map((i) => i.subjectId)
      const recordMap = await loadRecordMap('book', ids)
      return { data, recordMap }
    } catch {
      return { data, recordMap: undefined as Map<string, import('@/types').StoreRecord> | undefined }
    }
  },
  createApp: (RootCmp, data) => createApp(RootCmp, data),
})
