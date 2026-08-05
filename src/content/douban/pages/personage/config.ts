import { definePageMount } from '../../mount-factory'
import { createApp } from 'vue'
import { hideNavForPage } from '../../shared/hide-nav'
import { withRetry } from '../../shared/retry'
import { loadRecordMap } from '../../shared/load-record-map'

export const mountPersonage = definePageMount({
  cssPreset: 'personage',
  overlayId: 'umm-personage-overlay',
  importApp: () => import('./App.vue'),
  async beforeMount() {
    const { extractPersonagePageData } = await import('./personage-data')

    // Retry extraction — native JS may replace bottom sections after initial DOM paint
    const data: import('./personage-data').PersonagePageData | null = await withRetry(
      () => extractPersonagePageData(),
      { attempts: 5, baseDelay: 500, isValid: (d) => d && (d.recentWorks.length > 0 || d.partners.length > 0) },
    )
    if (!data) throw new Error('[UMM] Could not extract personage data')

    // Enrich works with record status from IndexedDB
    try {
      const works = [...data.recentWorks, ...data.popularWorks]
      const ids = works
        .map((work) => work.url.match(/\/subject\/(\d+)/)?.[1])
        .filter((id): id is string => Boolean(id))
      // Douban film/TV records are always stored under `movie::` (no douban
      // tv:: keys exist), so a targeted batch read with the 'movie' prefix
      // preserves the old id-matching behavior without a full-store scan.
      const recordMap = await loadRecordMap('movie', ids)
      for (const work of works) {
        const subjectId = work.url.match(/\/subject\/(\d+)/)?.[1]
        if (!subjectId) continue
        const rec = recordMap.get(subjectId)
        if (rec && rec.status > 0) {
          work.recordStatus = rec.status
          work.recordRating = rec.rating
        }
      }
    } catch { /* silent */ }

    hideNavForPage({ type: 'personage' })
    return data
  },
  createApp: (RootCmp, data) => createApp(RootCmp, { data }),
})
