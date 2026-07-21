import { definePageMount } from '../../mount-factory'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { hideNavForPage } from '../../shared/hide-nav'

/** Mount config for the Douban book review detail page overlay */
export const mountBookReviewDetail = definePageMount({
  cssPreset: 'book-review-detail',
  overlayId: 'umm-douban-overlay',
  importApp: () => import('./App'),
  async beforeMount() {
    const { extractBookReviewDetailData } = await import('./book-review-detail-data')

    // Retry extraction up to 8 times — the page content may not be in the DOM yet
    let data: import('./types').BookReviewDetailData | null = null
    for (let i = 0; i < 8; i++) {
      data = extractBookReviewDetailData()
      if (data) break
      await new Promise(r => setTimeout(r, 300))
    }
    if (!data) throw new Error('[UMM] Could not extract book review detail data')
    hideNavForPage({ type: 'book-review-detail' })
    return data
  },
  createApp: (RootCmp, container, data) => { const root = createRoot(container); root.render(React.createElement(RootCmp, { data })); return root },
})
