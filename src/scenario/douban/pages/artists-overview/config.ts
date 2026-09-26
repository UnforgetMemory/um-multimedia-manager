import { definePageMount } from '../../mount-factory'
import { createApp } from 'vue'
import { hideNavForPage } from '../../shared/hide-nav'

export const mountArtistsOverview = definePageMount({
  cssPreset: 'artists-overview',
  overlayId: 'umm-douban-overlay',
  importApp: () => import('./App.vue'),
  async beforeMount() {
    const { extractArtistsOverview } = await import('./extractors')
    const data = extractArtistsOverview()
    if (!data) throw new Error('[UMM] Could not extract artists overview data')
    hideNavForPage({ type: 'artists-overview' })
    return data
  },
  createApp: (RootCmp, data) => createApp(RootCmp, { data }),
})
