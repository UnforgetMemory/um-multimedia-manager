<script setup lang="ts">
import { onMounted } from 'vue'
import { useRecordCache } from '../../shared/composables/useRecordCache'
import { useDoubanSection } from './composables/useDoubanSection'
import { useHomepageObserver } from './composables/useHomepageObserver'
import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import UmmMediaRow from './components/UmmMediaRow.vue'
import UmmBillboardCard from './components/UmmBillboardCard.vue'
import UmmScrollRow from './components/UmmScrollRow.vue'
import UmmReviewsSection from './components/UmmReviewsSection.vue'
import {
  parseScreeningItems,
  parseBillboardItems,
  parseHotSection,
} from './extractors'

const { records, load } = useRecordCache()

const { items: screeningItems, refresh: refreshScreening } = useDoubanSection(parseScreeningItems, records)
const { items: billboardItems, refresh: refreshBillboard } = useDoubanSection(parseBillboardItems, records)
const { items: hotMovies, refresh: refreshHotMovies } = useDoubanSection(() => parseHotSection('.recent-hot-movie'), records)
const { items: hotTv, refresh: refreshHotTv } = useDoubanSection(() => parseHotSection('.recent-hot-tv'), records)

function refreshFromDom() {
  refreshScreening()
  refreshBillboard()
  refreshHotMovies()
  refreshHotTv()
}

const { start } = useHomepageObserver(refreshFromDom)

onMounted(async () => {
  await load()
  start()
  // Staggered re-parses: content injected by Douban's JS may not be
  // ready when the observer first fires (Swiper lazy load, XHR race).
  // Each retry is a no-op if the observer already caught it.
  setTimeout(refreshFromDom, 800)
  setTimeout(refreshFromDom, 2500)
  setTimeout(refreshFromDom, 6000)
})
</script>

<template>
  <UmmPageLayout>
    <div class="umm-top-panel">

    <UmmMediaRow title="正在热映" :items="screeningItems" :records="records" />

    <UmmScrollRow v-if="billboardItems.length > 0" title="一周口碑榜">
      <UmmBillboardCard
        v-for="item in billboardItems"
        :key="item.subjectId"
        :order="item.order"
        :title="item.title"
        :href="item.href"
        :badge-status="records.get(item.subjectId)?.status ?? 0"
        :badge-rating="records.get(item.subjectId)?.rating ?? 0"
      />
    </UmmScrollRow>

    <UmmMediaRow title="最近热门电影" :items="hotMovies" :records="records" />
    <UmmMediaRow title="最近热门电视剧" :items="hotTv" :records="records" :show-episodes="true" />

    <UmmReviewsSection :records="records" />
    </div>
  </UmmPageLayout>
</template>