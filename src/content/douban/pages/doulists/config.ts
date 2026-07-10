import { definePageMount } from '../../mount-factory'
import { createApp } from 'vue'
import { hideNavForPage } from '../../shared/hide-nav'

export const mountDoulists = definePageMount({
  cssPreset: 'doulists',
  overlayId: 'umm-douban-overlay',
  importApp: () => import('./App.vue'),
  async beforeMount() {
    const { extractDoulistsData } = await import('./doulists-data')
    const data = extractDoulistsData()
    if (!data) throw new Error('[UMM] Could not extract doulists data')
    hideNavForPage({ type: 'doulists' })
    return data
  },
  createApp: (RootCmp, data) => createApp(RootCmp, { data }),
})
