import { definePageMount } from '../../mount-factory'
import { createApp } from 'vue'
import { hideNavForPage } from '../../shared/hide-nav'

/** Mount config for the Douban user book authors page overlay */
export const mountBookAuthors = definePageMount({
  cssPreset: 'book-authors',
  overlayId: 'umm-douban-overlay',
  importApp: () => import('./App.vue'),
  async beforeMount() {
    const { extractBookAuthorsData } = await import('./book-authors-data')

    // Retry extraction up to 8 times — the page content may not be in the DOM yet
    let data: import('./types').BookAuthorsData | null = null
    for (let i = 0; i < 8; i++) {
      data = extractBookAuthorsData()
      if (data && (data.items.length > 0 || data.total > 0)) break
      await new Promise(r => setTimeout(r, 300))
    }
    if (!data) throw new Error('[UMM] Could not extract book authors data')
    hideNavForPage({ type: 'book-authors' })
    return data
  },
  createApp: (RootCmp, data) => createApp(RootCmp, { data }),
})
