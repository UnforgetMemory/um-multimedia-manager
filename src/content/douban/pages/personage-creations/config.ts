import { definePageMount } from '../../mount-factory'
import { createApp } from 'vue'
import { hideNavForPage } from '../../shared/hide-nav'
import { withRetry } from '../../shared/retry'
import { loadRecordMap } from '../../shared/load-record-map'

export const mountPersonageCreations = definePageMount({
  cssPreset: 'personage-creations',
  overlayId: 'umm-personage-overlay',
  importApp: () => import('./App.vue'),
  async beforeMount() {
    const { extractPersonageCreationsPageData } = await import('./personage-creations-data')

    // Retry extraction — native JS may replace DOM after initial paint.
    // Accept pages with zero creations (e.g. an empty role filter result)
    // so the overlay renders an empty state instead of hanging on retries.
    const data: import('./personage-creations-data').PersonageCreationsPageData | null = await withRetry(
      () => extractPersonageCreationsPageData(),
      { attempts: 5, baseDelay: 500, isValid: (d) => d !== null },
    )
    if (!data) throw new Error('[UMM] Could not extract personage creations data')

    // Enrich creations with record status from IndexedDB
    try {
      const ids = data.creations
        .map((c) => c.url.match(/\/subject\/(\d+)/)?.[1])
        .filter((id): id is string => Boolean(id))
      const recordMap = await loadRecordMap('movie', ids)
      for (const creation of data.creations) {
        const subjectId = creation.url.match(/\/subject\/(\d+)/)?.[1]
        if (!subjectId) continue
        const rec = recordMap.get(subjectId)
        if (rec && rec.status > 0) {
          creation.recordStatus = rec.status
          creation.recordRating = rec.rating
        }
      }
    } catch { /* silent */ }

    hideNavForPage({ type: 'personage-creations' })
    return data
  },
  createApp: (RootCmp, data) => createApp(RootCmp, { data }),
})