import { definePageMount } from '../../mount-factory';
import { createApp } from 'vue';
import { hideNavForPage } from '../../shared/hide-nav';
import { withRetry } from '../../shared/retry';
import { loadRecordMapForIds } from '../../shared/load-record-map';
import { subjectIdFromUrl } from '../../shared/subject-keys';

export const mountPersonageCreations = definePageMount({
  cssPreset: 'personage-creations',
  overlayId: 'umm-personage-overlay',
  importApp: () => import('./App.vue'),
  async beforeMount() {
    const { extractPersonageCreationsPageData } = await import('./personage-creations-data');

    // Retry extraction — native JS may replace DOM after initial paint.
    // Accept pages with zero creations (e.g. an empty role filter result)
    // so the overlay renders an empty state instead of hanging on retries.
    const data: import('./personage-creations-data').PersonageCreationsPageData | null =
      await withRetry(() => extractPersonageCreationsPageData(), {
        attempts: 5,
        baseDelay: 500,
        isValid: (d) => d !== null,
      });
    if (!data) throw new Error('[UMM] Could not extract personage creations data');

    // Targeted batch read (`movie::` — douban TV shares the movie prefix),
    // threaded to the overlay as the seed for its live record cache.
    const ids = data.creations
      .map((creation) => subjectIdFromUrl(creation.url))
      .filter((id): id is string => Boolean(id));
    const recordMap = await loadRecordMapForIds('movie', ids);

    hideNavForPage({ type: 'personage-creations' });
    return { data, recordMap };
  },
  createApp: (RootCmp, data) => createApp(RootCmp, data),
});
