import { definePageMount } from '../../mount-factory';
import { createApp } from 'vue';
import { hideNavForPage } from '../../shared/hide-nav';
import { loadRecordMapForIds } from '../../shared/load-record-map';
import { Store } from '@/engine/database';
import { initDoulistReplacement } from '@/entrypoints/content/ui/doulist-replace';
import { withRetry } from '../../shared/retry';

export const mountGameDetail = definePageMount({
  cssPreset: 'game-detail',
  overlayId: 'umm-douban-overlay',
  importApp: () => import('./App.vue'),
  async beforeMount() {
    const { extractGameDetailData } = await import('./game-detail-data');
    const data: import('./game-detail-data').GameDetailData | null = await withRetry(
      () => extractGameDetailData(),
      { attempts: 8, baseDelay: 300, isValid: (d) => d?.title },
    );
    if (!data) throw new Error('[UMM] Could not extract game detail data');

    if (data.identity) {
      const key = `${data.identity.type}::${data.identity.providerId}`;
      const record = await Store.dbGet('douban_records', key);
      if (record) {
        // Handed to the overlay so the companion NeoDB reconcile runs for an
        // already-watched game instead of waiting for a mark event.
        data.record = record;
        if (record.status) data.initialStatus = record.status;
        if (record.rating) data.initialRating = record.rating / 2;
      }
    }

    // Recommendation badges: one targeted batch read seeds the live cache the
    // overlay derives from — the rows themselves are never mutated.
    const recordMap = await loadRecordMapForIds(
      'game',
      data.recItems.map((item) => item.subjectId),
    );

    hideNavForPage({ type: 'game-detail' });
    return { data, recordMap };
  },
  createApp: (RootCmp, data) => createApp(RootCmp, data),
  afterMount(_shadow, _app, _container, data) {
    // Initialize doulist modal click handler ("+ 添加到豆列")
    if (data.data.identity) {
      initDoulistReplacement(data.data.identity);
    }
  },
});
