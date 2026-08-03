import { definePageMount } from '../../mount-factory'
import { createApp } from 'vue'
import { hideNavForPage } from '../../shared/hide-nav'
import { withRetry } from '../../shared/retry'

/** Mount config for the Douban user book reviews page overlay */
export const mountBookReviews = definePageMount({
  cssPreset: 'book-reviews',
  overlayId: 'umm-douban-overlay',
  importApp: () => import('./App.vue'),
  async beforeMount() {
    const { extractBookReviewsData } = await import('./book-reviews-data')

    // Retry extraction up to 8 times — the page content may not be in the DOM yet
    const data: import('./types').BookReviewsData | null = await withRetry(
      () => extractBookReviewsData(),
      { attempts: 8, fixedDelay: 300, isValid: (d) => d && (d.items.length > 0 || d.total > 0) },
    )
    if (!data) throw new Error('[UMM] Could not extract book reviews data')
    hideNavForPage({ type: 'book-reviews' })
    return data
  },
  createApp: (RootCmp, data) => createApp(RootCmp, { data }),
})
