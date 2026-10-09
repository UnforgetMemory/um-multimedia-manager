import { definePageMount } from '../../mount-factory';
import { createApp } from 'vue';
import { hideNavForPage } from '../../shared/hide-nav';
import { withRetry } from '../../shared/retry';
import { loadRecordMapForIds } from '../../shared/load-record-map';

export const mountBookProfile = definePageMount({
  cssPreset: 'book-profile',
  overlayId: 'umm-douban-overlay',
  importApp: () => import('./App.vue'),
  async beforeMount() {
    const { extractBookProfileData } = await import('./data');

    // Retry extraction — data may load async
    const data: import('./types').BookProfileData | null = await withRetry(
      () => extractBookProfileData(),
      {
        attempts: 5,
        baseDelay: 500,
        isValid: (d) => d && (d.readBooks.length > 0 || d.recentReading.length > 0),
      },
    );
    if (!data) throw new Error('[UMM] Could not extract book profile data');

    // Seed the overlay's record cache with a targeted batch read. Book records
    // live under `book::<subjectId>`, which the extractor already parsed out of
    // each card's href, so no full-store scan is needed. The map only seeds the
    // first paint — badges stay live through useRecordCache in App.vue, and the
    // extracted BookItem objects are never mutated (writing state into them
    // would freeze it under Vapor).
    const ids = [...data.readBooks, ...data.wishBooks]
      .map((book) => book.subjectId)
      .filter((id): id is string => Boolean(id));
    const recordMap = await loadRecordMapForIds('book', ids);

    hideNavForPage({ type: 'book-profile' });
    return { data, recordMap };
  },
  createApp: (RootCmp, data) => createApp(RootCmp, data),
});
