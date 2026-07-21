import { definePageMount } from '../../mount-factory'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { loadRecordMap } from '../../shared/load-record-map'

export const mountSearch = definePageMount({
  cssPreset: 'search',
  overlayId: 'umm-search-overlay',
  importApp: () => import('./App'),
  async beforeMount() {
    const { parseSearchData } = await import('./search-data')
    const type = location.href.includes('search.douban.com/music')
      ? 'music'
      : location.href.includes('search.douban.com/book')
        ? 'book'
        : 'movie'
    const [searchData, recordMap] = await Promise.all([
      parseSearchData(),
      loadRecordMap(type),
    ])
    return { searchData, recordMap, type }
  },
  createApp: (RootCmp, container, data) => { const root = createRoot(container); root.render(React.createElement(RootCmp, data)); return root },
})
