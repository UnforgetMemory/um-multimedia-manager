import { definePageMount } from '../../mount-factory'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { hideNavForPage } from '../../shared/hide-nav'

export const mountReviewDetail = definePageMount({
  cssPreset: 'review-detail',
  overlayId: 'umm-douban-overlay',
  importApp: () => import('./App'),
  async beforeMount() {
    const { extractReviewDetailData } = await import('./review-detail-data')

    let data: import('./types').ReviewDetailData | null = null
    for (let i = 0; i < 8; i++) {
      data = extractReviewDetailData()
      if (data) break
      await new Promise(r => setTimeout(r, 300))
    }
    if (!data) throw new Error('[UMM] Could not extract review detail data')
    hideNavForPage({ type: 'review-detail' })
    return data
  },
  createApp: (RootCmp, container, data) => { const root = createRoot(container); root.render(React.createElement(RootCmp, { data })); return root },
})
