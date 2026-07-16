import { definePageMount } from '../../mount-factory'
import { createApp } from 'vue'
import { hideNavForPage } from '../../shared/hide-nav'

export const mountUserReviews = definePageMount({
  cssPreset: 'user-reviews',
  overlayId: 'umm-douban-overlay',
  importApp: () => import('./App.vue'),
  async beforeMount() {
    const { extractUserReviewsData } = await import('./user-reviews-data')

    let data: import('./types').UserReviewsData | null = null
    for (let i = 0; i < 8; i++) {
      data = extractUserReviewsData()
      if (data && (data.items.length > 0 || data.total > 0)) break
      await new Promise(r => setTimeout(r, 300))
    }
    if (!data) throw new Error('[UMM] Could not extract reviews data')
    hideNavForPage({ type: 'user-reviews' })
    return data
  },
  createApp: (RootCmp, data) => createApp(RootCmp, { data }),
})
