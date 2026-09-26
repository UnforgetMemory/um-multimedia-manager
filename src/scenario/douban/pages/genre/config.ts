import { definePageMount } from '../../mount-factory'
import { createApp } from 'vue'
import { hideNavForPage } from '../../shared/hide-nav'

export const mountGenre = definePageMount({
  cssPreset: 'genre',
  overlayId: 'umm-douban-overlay',
  importApp: () => import('./App.vue'),
  async beforeMount() {
    const { extractGenrePage } = await import('./extractors')
    const data = extractGenrePage()
    if (!data) throw new Error('[UMM] Could not extract genre page data')
    hideNavForPage({ type: 'genre' })
    return data
  },
  createApp: (RootCmp, data) => createApp(RootCmp, { data }),
})
