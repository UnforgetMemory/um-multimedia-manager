import { definePageMount } from '../../mount-factory'
import { createApp } from 'vue'
import { hideNavForPage } from '../../shared/hide-nav'
import { withRetry } from '../../shared/retry'

export const mountUserReviews = definePageMount({
  cssPreset: 'user-reviews',
  overlayId: 'umm-douban-overlay',
  importApp: () => import('./App.vue'),
  async beforeMount() {
    const { extractUserReviewsData } = await import('./user-reviews-data')

    const data: import('./types').UserReviewsData | null = await withRetry(
      () => extractUserReviewsData(),
      { attempts: 8, fixedDelay: 300, isValid: (d) => d && (d.items.length > 0 || d.total > 0) },
    )
    if (!data) throw new Error('[UMM] Could not extract reviews data')
    hideNavForPage({ type: 'user-reviews' })
    return data
  },
  createApp: (RootCmp, data) => createApp(RootCmp, { data }),
})
