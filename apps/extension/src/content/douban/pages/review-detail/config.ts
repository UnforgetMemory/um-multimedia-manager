import { definePageMount } from '../../mount-factory'
import { createApp } from 'vue'
import { hideNavForPage } from '../../shared/hide-nav'

export const mountReviewDetail = definePageMount({
  cssPreset: 'review-detail',
  overlayId: 'umm-douban-overlay',
  importApp: () => import('./App.vue'),
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
  createApp: (RootCmp, data) => createApp(RootCmp, { data }),
})
