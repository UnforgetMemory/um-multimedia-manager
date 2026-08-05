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
    const data = extractAlbumsData()
    if (!data) throw new Error('[UMM] Could not extract albums data')
    // music.douban.com/albums — all versions are music subjects; thread their
    // ids for a targeted batch read instead of a full-store scan
    const ids = data.versions.filter((v) => v.id).map((v) => String(v.id))
    const recordMap = await loadRecordMap('music', ids)
    hideNavForPage({ type: 'albums' })
    return { data, recordMap }
  },
  createApp: (RootCmp, data) => createApp(RootCmp, data),
})
