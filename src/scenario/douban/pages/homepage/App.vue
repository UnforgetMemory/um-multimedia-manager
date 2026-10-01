<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRecordCache } from '../../shared/composables/use-record-cache';
import { candidateRecordKeys } from '../../shared/subject-keys';
import { useDoubanSection } from './composables/use-douban-section';
import { useHomepageObserver } from './composables/use-homepage-observer';
import { UmmPageLayout } from '@/scenario/douban/components/umm-page-layout';
import UmmMediaRow from './components/UmmMediaRow.vue';
import UmmBillboardCard from './components/UmmBillboardCard.vue';
import UmmScrollRow from './components/UmmScrollRow.vue';
import UmmReviewsSection from './components/UmmReviewsSection.vue';
import {
  parseScreeningItems,
  parseBillboardItems,
  parseHotSection,
  parseReviewItems,
} from './homepage-extract';
import { t } from '../../shared/legacy-bridge';

// Only keys for currently-visible subjects are fetched (dbGetBulk), never a
// full-store scan. Grows as late-parsed items appear; see collectKeys().
const visibleKeys = ref<string[]>([]);
const { records, load } = useRecordCache(undefined, visibleKeys);

const { items: screeningItems, refresh: refreshScreening } = useDoubanSection(
  parseScreeningItems,
  records,
);
const { items: billboardItems, refresh: refreshBillboard } = useDoubanSection(
  parseBillboardItems,
  records,
);
const { items: hotMovies, refresh: refreshHotMovies } = useDoubanSection(
  () => parseHotSection('.recent-hot-movie'),
  records,
);
const { items: hotTv, refresh: refreshHotTv } = useDoubanSection(
  () => parseHotSection('.recent-hot-tv'),
  records,
);

function collectKeys() {
  const keys = new Set<string>();
  const add = (subjectId: string | undefined, href?: string) => {
    if (!subjectId) return;
    for (const key of candidateRecordKeys(subjectId, href)) keys.add(key);
  };
  for (const item of screeningItems.value) add(item.subjectId, item.href);
  for (const item of billboardItems.value) add(item.subjectId, item.href);
  for (const item of hotMovies.value) add(item.subjectId, item.href);
  for (const item of hotTv.value) add(item.subjectId, item.href);
  for (const item of parseReviewItems()) add(item.subjectId, item.href);
  visibleKeys.value = Array.from(keys);
}

function refreshFromDom() {
  collectKeys();
  refreshScreening();
  refreshBillboard();
  refreshHotMovies();
  refreshHotTv();
}

const { start } = useHomepageObserver(refreshFromDom, {
  containerSelectors: '#screening, .recent-hot, #billboard, #reviews, .review',
});

// Late-parsed items grow visibleKeys → reload so their badges appear.
watch(visibleKeys, () => void load());

onMounted(async () => {
  collectKeys();
  await load();
  start();
  // Staggered re-parses: content injected by Douban's JS may not be
  // ready when the observer first fires (Swiper lazy load, XHR race).
  // Each retry is a no-op if the observer already caught it.
  setTimeout(refreshFromDom, 800);
  setTimeout(refreshFromDom, 2500);
  setTimeout(refreshFromDom, 6000);
});
</script>

<template vapor>
  <UmmPageLayout>
    <div class="umm-top-panel">
      <UmmMediaRow
        :title="t('douban.home.screening')"
        :items="screeningItems"
        :records="records"
        grid
      />

      <UmmScrollRow v-if="billboardItems.length > 0" :title="t('douban.home.billboard')">
        <UmmBillboardCard
          v-for="item in billboardItems"
          :key="item.subjectId || item.href"
          :order="item.order"
          :title="item.title"
          :href="item.href"
          :badge-status="records.get(item.subjectId)?.status ?? 0"
          :badge-rating="records.get(item.subjectId)?.rating ?? 0"
        />
      </UmmScrollRow>

      <UmmMediaRow :title="t('douban.home.hot_movie')" :items="hotMovies" :records="records" grid />
      <UmmMediaRow
        :title="t('douban.home.hot_tv')"
        :items="hotTv"
        :records="records"
        :show-episodes="true"
        grid
      />

      <UmmReviewsSection :records="records" />
    </div>
  </UmmPageLayout>
</template>
