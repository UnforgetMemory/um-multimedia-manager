import { definePageMount } from '../../mount-factory'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { hideNavForPage } from '../../shared/hide-nav'
import { loadRecordMap } from '../../shared/load-record-map'

export const mountPersonage = definePageMount({
  cssPreset: 'personage',
  overlayId: 'umm-personage-overlay',
  importApp: () => import('./App'),
  async beforeMount() {
    const { extractPersonagePageData } = await import('./personage-data')

    // Retry extraction — native JS may replace bottom sections after initial DOM paint
    let data: import('./personage-data').PersonagePageData | null = null
    for (let i = 0; i < 5; i++) {
      data = extractPersonagePageData()
      if (data && (data.recentWorks.length > 0 || data.partners.length > 0)) break
      await new Promise((r) => setTimeout(r, 500 * (i + 1)))
    }
    if (!data) throw new Error('[UMM] Could not extract personage data')

    // Enrich works with record status from IndexedDB
    try {
      const recordMap = await loadRecordMap()
      for (const work of [...data.recentWorks, ...data.popularWorks]) {
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
  createApp: (RootCmp, container, data) => { const root = createRoot(container); root.render(React.createElement(RootCmp, { data })); return root },
})
