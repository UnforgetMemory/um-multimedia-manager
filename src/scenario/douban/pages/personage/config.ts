import { definePageMount } from '../../mount-factory';
import { createApp } from 'vue';
import { hideNavForPage } from '../../shared/hide-nav';
import { withRetry } from '../../shared/retry';
import { loadRecordMapForIds } from '../../shared/load-record-map';
import { subjectIdFromUrl } from '../../shared/subject-keys';

export const mountPersonage = definePageMount({
  cssPreset: 'personage',
  overlayId: 'umm-personage-overlay',
  importApp: () => import('./App.vue'),
  async beforeMount() {
    const { extractPersonagePageData } = await import('./personage-data');

    // Retry extraction — native JS may replace bottom sections after initial DOM paint
    const data: import('./personage-data').PersonagePageData | null = await withRetry(
      () => extractPersonagePageData(),
      {
        attempts: 5,
        baseDelay: 500,
        isValid: (d) => d && (d.recentWorks.length > 0 || d.partners.length > 0),
      },
    );
    if (!data) throw new Error('[UMM] Could not extract personage data');

    // Douban film/TV records are always stored under `movie::` (no douban
    // tv:: keys exist), so a targeted batch read with the 'movie' prefix
    // preserves the old id-matching behavior without a full-store scan.
    // The map seeds the overlay's reactive record cache — badges stay live
    // without mutating the extracted work objects.
    const works = [...data.recentWorks, ...data.popularWorks];
    const ids = works
      .map((work) => subjectIdFromUrl(work.url))
      .filter((id): id is string => Boolean(id));
    const recordMap = await loadRecordMapForIds('movie', ids);

    hideNavForPage({ type: 'personage' });
    return { data, recordMap };
  },
  createApp: (RootCmp, data) => createApp(RootCmp, data),
});
