import { definePageMount } from '../../mount-factory';
import { createApp } from 'vue';
import { hideNavForPage } from '../../shared/hide-nav';
import { inferMediaTypeFromUrl } from '../../shared/url-detector';
import { loadRecordMapForIds } from '../../shared/load-record-map';
import { initDoulistReplacement } from '@/entrypoints/content/ui/doulist-replace';

export const mountDetail = definePageMount({
  cssPreset: 'detail',
  overlayId: 'umm-detail-mask',
  importApp: () => import('./App.vue'),
  async beforeMount() {
    const { extractDetailData, loadRecord } = await import('./detail-data');
    const detailData = await extractDetailData();
    if (!detailData) throw new Error('[UMM] Could not extract detail data from page');
    detailData.record = await loadRecord(detailData.identity);
    const mediaType = inferMediaTypeFromUrl(location.href);

    // Seed the recommendation badges' cache from one targeted batch read; the
    // overlay keeps them live from here (never baked into `recItems`).
    const recIds = detailData.recItems.map((item) => item.subjectId);
    const recRecordMap = await loadRecordMapForIds(detailData.identity.type, recIds);

    hideNavForPage({ type: 'detail', mediaType });
    return { detailData, recRecordMap };
  },
  createApp: (RootCmp, data) => createApp(RootCmp, data),
  afterMount(_shadow, _app, _container, data) {
    // Initialize doulist modal click handler ("添加到片单" / "+ 添加到书单")
    if (data.detailData.identity) {
      initDoulistReplacement(data.detailData.identity);
    }
  },
});
