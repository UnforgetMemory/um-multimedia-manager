import { definePageMount } from '../../mount-factory'
import { createApp } from 'vue'
import { hideNavForPage } from '../../shared/hide-nav'
import { withRetry } from '../../shared/retry'

export const mountReviewDetail = definePageMount({
  cssPreset: 'review-detail',
  overlayId: 'umm-douban-overlay',
  importApp: () => import('./App.vue'),
  async beforeMount() {
    const { extractReviewDetailData } = await import('./review-detail-data')

    const data: import('./types').ReviewDetailData | null = await withRetry(
      () => extractReviewDetailData(),
      { attempts: 8, fixedDelay: 300, isValid: (d) => d },
    )
    if (!data) throw new Error('[UMM] Could not extract review detail data')
    hideNavForPage({ type: 'review-detail' })
    return data
  },
  createApp: (RootCmp, data) => createApp(RootCmp, { data }),
})
