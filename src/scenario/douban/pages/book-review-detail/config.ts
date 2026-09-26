import { definePageMount } from '../../mount-factory'
import { createApp } from 'vue'
import { hideNavForPage } from '../../shared/hide-nav'
import { withRetry } from '../../shared/retry'

/** Mount config for the Douban book review detail page overlay */
export const mountBookReviewDetail = definePageMount({
  cssPreset: 'book-review-detail',
  overlayId: 'umm-douban-overlay',
  importApp: () => import('./App.vue'),
  async beforeMount() {
    const { extractBookReviewDetailData } = await import('./book-review-detail-data')

    // Retry extraction up to 8 times — the page content may not be in the DOM yet
    const data: import('./types').BookReviewDetailData | null = await withRetry(
      () => extractBookReviewDetailData(),
      { attempts: 8, fixedDelay: 300, isValid: (d) => d },
    )
    if (!data) throw new Error('[UMM] Could not extract book review detail data')
    hideNavForPage({ type: 'book-review-detail' })
    return data
  },
  createApp: (RootCmp, data) => createApp(RootCmp, { data }),
})
