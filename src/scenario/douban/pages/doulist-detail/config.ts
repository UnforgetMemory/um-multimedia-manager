import { definePageMount } from '../../mount-factory';
import { createApp } from 'vue';
import { hideNavForPage } from '../../shared/hide-nav';
import { loadRecordMapForKeys } from '../../shared/load-record-map';
import { candidateRecordKeys } from '../../shared/subject-keys';

export const mountDoulistDetail = definePageMount({
  cssPreset: 'doulist-detail',
  overlayId: 'umm-douban-overlay',
  importApp: () => import('./App.vue'),
  async beforeMount() {
    const { extractDoulistDetailData } = await import('./doulist-detail-data');
    const data = extractDoulistDetailData();
    if (!data) throw new Error('[UMM] Could not extract doulist detail data');
    hideNavForPage({ type: 'doulist-detail' });

    // Seed the overlay's live record cache with one targeted bulk read of the
    // visible subjects' keys. An empty section reads nothing at all.
    try {
      const keys = data.items.flatMap((item) =>
        item.subjectId ? candidateRecordKeys(item.subjectId, item.subjectUrl) : [],
      );
      const recordMap = await loadRecordMapForKeys(keys);
      return { data, recordMap };
    } catch {
      return {
        data,
        recordMap: undefined as Map<string, import('@/types').StoreRecord> | undefined,
      };
    }
  },
  createApp: (RootCmp, data) => createApp(RootCmp, data),
});
