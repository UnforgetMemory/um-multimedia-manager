import { definePageMount } from '../../mount-factory'
import { createApp } from 'vue'
import { hideNavForPage } from '../../shared/hide-nav'

export const mountUserCelebrities = definePageMount({
  cssPreset: 'user-celebrities',
  overlayId: 'umm-douban-overlay',
  importApp: () => import('./App.vue'),
  async beforeMount() {
    const { extractUserCelebritiesData } = await import('./user-celebrities-data')
    const data = extractUserCelebritiesData()
    if (!data) throw new Error('[UMM] Could not extract celebrity data')
    hideNavForPage({ type: 'user-celebrities' })
    return data
  },
  createApp: (RootCmp, data) => createApp(RootCmp, { data }),
})
