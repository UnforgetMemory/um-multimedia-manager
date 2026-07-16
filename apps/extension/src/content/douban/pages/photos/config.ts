import { definePageMount } from '../../mount-factory'
import { createApp } from 'vue'
import { hideNavForPage } from '../../shared/hide-nav'

export const mountPhotos = definePageMount({
  cssPreset: 'photos',
  overlayId: 'umm-photos-overlay',
  importApp: () => import('./App.vue'),
  async beforeMount() {
    const { extractPhotosPageData } = await import('./photos-data')
    const data = extractPhotosPageData()
    if (!data) throw new Error('[UMM] Could not extract photos data from page')
    hideNavForPage({ type: 'photos' })
    return data
  },
  createApp: (RootCmp, data) => createApp(RootCmp, { data }),
})
