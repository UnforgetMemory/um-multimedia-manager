import { definePageMount } from '../../mount-factory'
import { createApp } from 'vue'
import { hideNavForPage } from '../../shared/hide-nav'
import { withRetry } from '../../shared/retry'

/** Mount config for the Douban user book authors page overlay */
export const mountBookAuthors = definePageMount({
  cssPreset: 'book-authors',
  overlayId: 'umm-douban-overlay',
  importApp: () => import('./App.vue'),
  async beforeMount() {
    const { extractBookAuthorsData } = await import('./book-authors-data')

    // Retry extraction up to 8 times — the page content may not be in the DOM yet
    const data: import('./types').BookAuthorsData | null = await withRetry(
      () => extractBookAuthorsData(),
      { attempts: 8, fixedDelay: 300, isValid: (d) => d && (d.items.length > 0 || d.total > 0) },
    )
    if (!data) throw new Error('[UMM] Could not extract book authors data')
    hideNavForPage({ type: 'book-authors' })
    return data
  },
  createApp: (RootCmp, data) => createApp(RootCmp, { data }),
})
