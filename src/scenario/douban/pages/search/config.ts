import { definePageMount } from '../../mount-factory'
import { createApp } from 'vue'
import { loadRecordMap } from '../../shared/load-record-map'

export const mountSearch = definePageMount({
  cssPreset: 'search',
  overlayId: 'umm-search-overlay',
  importApp: () => import('./App.vue'),
  async beforeMount() {
    const { parseSearchData } = await import('./search-data')
    const type = location.href.includes('search.douban.com/music')
      ? 'music'
      : location.href.includes('search.douban.com/book')
        ? 'book'
        : 'movie'
    const searchData = await parseSearchData()
    // Thread visible item ids for a targeted batch read (falls back to
    // full-store scan when parsing produced no items)
    const ids = searchData?.items?.filter((i) => i.id).map((i) => String(i.id))
    const recordMap = await loadRecordMap(type, ids)
    return { searchData, recordMap, type }
  },
  createApp: (RootCmp, data) => createApp(RootCmp, data),
})
