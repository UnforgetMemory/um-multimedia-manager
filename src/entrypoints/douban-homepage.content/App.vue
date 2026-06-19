<script setup lang="ts">
import { onMounted } from 'vue'
import { useRecordCache } from './composables/useRecordCache'
import { useDoubanScreeningItems } from './composables/useDoubanScreeningItems'
import { useDoubanBillboard } from './composables/useDoubanBillboard'
import { useDoubanHotSection } from './composables/useDoubanHotSection'
import { useHomepageObserver } from './composables/useHomepageObserver'
import UmmDynamicIsland from './components/UmmDynamicIsland.vue'
import UmmScrollRow from './components/UmmScrollRow.vue'
import UmmMediaCard from './components/UmmMediaCard.vue'
import UmmBillboardCard from './components/UmmBillboardCard.vue'
import UmmReviewsSection from './components/UmmReviewsSection.vue'

const { records, load } = useRecordCache()

const { items: screeningItems, parse: parseScreening } = useDoubanScreeningItems(records)
const { items: billboardItems, parse: parseBillboard } = useDoubanBillboard(records)
const { items: hotMovies, parse: parseHotMovies } = useDoubanHotSection('.recent-hot-movie', '最近热门电影', records)
const { items: hotTv, parse: parseHotTv } = useDoubanHotSection('.recent-hot-tv', '最近热门电视剧', records)

function refreshFromDom() {
  parseScreening()
  parseBillboard()
  parseHotMovies()
  parseHotTv()
}

const { start } = useHomepageObserver(refreshFromDom)

onMounted(async () => {
  await load()
  start()
})
</script>

<template>
  <div class="umm-top-panel">
    <UmmDynamicIsland />

    <UmmScrollRow v-if="screeningItems.length > 0" title="正在热映">
      <UmmMediaCard
        v-for="item in screeningItems"
        :key="item.subjectId"
        :poster-url="item.posterUrl"
        :title="item.title"
        :href="item.href"
        :rate="item.rate"
        :star-num="item.starNum"
        :intro="item.intro"
        :badge-status="records.get(item.subjectId)?.status ?? 0"
        :badge-rating="records.get(item.subjectId)?.rating ?? 0"
      />
    </UmmScrollRow>

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

    <UmmScrollRow v-if="hotMovies.length > 0" title="最近热门电影">
      <UmmMediaCard
        v-for="item in hotMovies"
        :key="item.subjectId"
        :poster-url="item.posterUrl"
        :title="item.title"
        :href="item.href"
        :rate="item.rate"
        :badge-status="records.get(item.subjectId)?.status ?? 0"
        :badge-rating="records.get(item.subjectId)?.rating ?? 0"
      />
    </UmmScrollRow>

    <UmmScrollRow v-if="hotTv.length > 0" title="最近热门电视剧">
      <UmmMediaCard
        v-for="item in hotTv"
        :key="item.subjectId"
        :poster-url="item.posterUrl"
        :title="item.title"
        :href="item.href"
        :rate="item.rate"
        :badge-status="records.get(item.subjectId)?.status ?? 0"
        :badge-rating="records.get(item.subjectId)?.rating ?? 0"
        :episodes="item.episodes"
      />
    </UmmScrollRow>

    <UmmReviewsSection :records="records" />
  </div>
</template>
