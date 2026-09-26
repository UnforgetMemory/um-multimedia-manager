import { definePageMount } from '../../mount-factory'
import { createApp } from 'vue'
import { hideNavForPage } from '../../shared/hide-nav'

export const mountCelebrities = definePageMount({
  cssPreset: 'celebrities',
  overlayId: 'umm-celebrities-overlay',
  importApp: () => import('./App.vue'),
  async beforeMount() {
    const { extractCelebritiesPageData } = await import('./celebrities-data')
    const data = extractCelebritiesPageData()
    if (!data) throw new Error('[UMM] Could not extract celebrities data')
    hideNavForPage({ type: 'celebrities' })
    return data
  },
  createApp: (RootCmp, data) => createApp(RootCmp, { data }),
})
