<script setup lang="ts">
/**
 * UmmMediaRow — scrollable media card row for homepage sections.
 * Combines UmmScrollRow + UmmMediaCard with automatic record lookup.
 * Used by screening, hot-movie, and hot-tv sections.
 */
import type { StoreRecord } from '@/types'
import UmmScrollRow from './UmmScrollRow.vue'
import UmmMediaCard from './UmmMediaCard.vue'

interface MediaRowItem {
  subjectId: string
  title: string
  rate: string
  posterUrl: string
  href: string
  intro?: string
  episodes?: string
}

interface Props {
  title: string
  items: MediaRowItem[]
  records: Map<string, StoreRecord>
  showEpisodes?: boolean
  type?: 'movie' | 'music'
  grid?: boolean
}

const props = defineProps<Props>()

function recordFor(item: MediaRowItem) {
  const rec = props.records.get(item.subjectId)
  const status = rec?.status ?? 0
  const rating = rec?.rating ?? 0
  return { status, rating }
}
</script>

<template>
  <UmmScrollRow v-if="items.length > 0" :title="title" :mode="grid ? 'grid' : 'scroll'">
    <UmmMediaCard
      v-for="item in items"
      :key="`${item.subjectId}-${recordFor(item).status}-${recordFor(item).rating}`"
      :poster-url="item.posterUrl"
      :title="item.title"
      :href="item.href"
      :rate="item.rate"
      :intro="item.intro"
      :episodes="showEpisodes ? item.episodes : undefined"
      :badge-status="recordFor(item).status"
      :badge-rating="recordFor(item).rating"
      :type="props.type ?? 'movie'"
      :mode="grid ? 'grid' : 'scroll'"
    />
  </UmmScrollRow>
</template>
