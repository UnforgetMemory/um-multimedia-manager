import { definePageMount } from '../../mount-factory';
import { createApp } from 'vue';
import { loadRecordMapForIds } from '../../shared/load-record-map';
import { inferMediaTypeFromUrl } from '../../shared/url-detector';

export const mountSearch = definePageMount({
  cssPreset: 'search',
  overlayId: 'umm-search-overlay',
  importApp: () => import('./App.vue'),
  async beforeMount() {
    const { parseSearchData } = await import('./search-data');
    const type = inferMediaTypeFromUrl(location.href);
    const searchData = await parseSearchData();
    // Thread visible item ids for a targeted batch read; a parse that
    // produced no items reads nothing.
    const ids = searchData?.items?.filter((i) => i.id).map((i) => String(i.id));
    const recordMap = await loadRecordMapForIds(type, ids);
    return { searchData, recordMap, type };
  },
  createApp: (RootCmp, data) => createApp(RootCmp, data),
});
