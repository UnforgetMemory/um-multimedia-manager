import { definePageMount } from '../../mount-factory'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { hideNavForPage } from '../../shared/hide-nav'

/** Mount config for the Douban user book reviews page overlay */
export const mountBookReviews = definePageMount({
  cssPreset: 'book-reviews',
  overlayId: 'umm-douban-overlay',
  importApp: () => import('./App'),
  async beforeMount() {
    const { extractBookReviewsData } = await import('./book-reviews-data')

    // Retry extraction up to 8 times — the page content may not be in the DOM yet
    let data: import('./types').BookReviewsData | null = null
    for (let i = 0; i < 8; i++) {
      data = extractBookReviewsData()
      if (data && (data.items.length > 0 || data.total > 0)) break
      await new Promise(r => setTimeout(r, 300))
    }
    if (!data) throw new Error('[UMM] Could not extract book reviews data')
    hideNavForPage({ type: 'book-reviews' })
    return data
  },
  createApp: (RootCmp, container, data) => { const root = createRoot(container); root.render(React.createElement(RootCmp, { data })); return root },
})
