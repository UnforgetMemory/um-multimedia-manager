import { definePageMount } from '../../mount-factory'
import { createApp } from 'vue'
import { hideNavForPage } from '../../shared/hide-nav'
import { loadRecordMap } from '../../shared/load-record-map'

export const mountAlbums = definePageMount({
  cssPreset: 'albums',
  overlayId: 'umm-douban-overlay',
  importApp: () => import('./App.vue'),
  async beforeMount() {
    const { extractAlbumsData } = await import('./albums-data')
    const [data, recordMap] = await Promise.all([
      extractAlbumsData(),
      loadRecordMap(),
    ])
    if (!data) throw new Error('[UMM] Could not extract albums data')
    hideNavForPage({ type: 'albums' })
    return { data, recordMap }
  },
  createApp: (RootCmp, data) => createApp(RootCmp, data),
})
