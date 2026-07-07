<script setup lang="ts">
/**
 * UmmSearchCard — search result card for Douban movie/TV search page.
 * Displays cover, title, status badge, rating, metadata and cast.
 */
import type { SearchItem } from '../types'
import type { StoreRecord } from '@/types'
import { UmmImageWrapper } from '@/content/douban/components/UmmImageWrapper'
import { UmmStatusBadgeWrapper } from '@/content/douban/components/UmmStatusBadgeWrapper'
import { UmmRating } from '@/content/douban/components/UmmRating'
import { ASPECT_RATIO } from '@/content/douban/shared/constants'

interface Props {
  item: SearchItem
  records: Map<string, StoreRecord>
}

const props = defineProps<Props>()

const rec = props.records.get(String(props.item.id))
const badgeStatus = rec?.status === 2 ? 2 : 0
const badgeRating = rec?.rating ?? 0
</script>

<template>
  <a
    :href="item.url"
    target="_blank" rel="noopener noreferrer"
    class="umm-search-card"
  >
    <div class="umm-search-card-cover">
      <UmmImageWrapper :src="item.cover_url" :alt="item.title" :aspect-ratio="ASPECT_RATIO.POSTER" />
      <span v-if="item.labels?.length" class="umm-search-label">{{ item.labels[0].text }}</span>
    </div>
    <div class="umm-search-card-body">
      <div class="umm-search-card-title-row">
        <span class="umm-search-card-title">{{ item.title }}</span>
        <UmmStatusBadgeWrapper
          :status="badgeStatus"
          :rating="badgeRating"
          variant="small"
        />
      </div>
      <UmmRating :score="item.rating.value.toFixed(1)" :count="item.rating.count" />
      <div v-if="item.abstract" class="umm-search-meta">{{ item.abstract }}</div>
      <div v-if="item.abstract_2" class="umm-search-cast">{{ item.abstract_2 }}</div>
    </div>
  </a>
</template>