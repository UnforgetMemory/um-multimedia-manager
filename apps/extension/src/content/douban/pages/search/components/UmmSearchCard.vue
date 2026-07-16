<script setup lang="ts">
/**
 * UmmSearchCard — search result card for Douban movie/TV/music/book search page.
 * Displays cover, title, status badge, rating, metadata, and media format chips (music only).
 */
import type { SearchItem } from '../types'
import type { StoreRecord } from '@/types'
import { computed } from 'vue'
import { UmmImageWrapper } from '@/content/douban/components/UmmImageWrapper'
import { UmmStatusBadgeWrapper } from '@/content/douban/components/UmmStatusBadgeWrapper'
import { UmmRating } from '@/content/douban/components/UmmRating'
import { ASPECT_RATIO } from '@/content/douban/shared/constants'

/** Known media format keywords in Douban music metadata */
const MEDIA_FORMATS = new Set([
  'CD', 'DVD', 'CD/DVD', '磁带', '数字(Digital)',
  '黑胶', 'LP', 'SACD', 'Blu-ray', 'VCD', 'LD', '流媒体', 'Digital',
])

/** Map media format to a short display label */
const FORMAT_LABELS: Record<string, string> = {
  '数字(Digital)': '数字',
  'Digital': '数字',
}

/** Map display label → CSS color variant class */
const FORMAT_COLORS: Record<string, string> = {
  'CD': 'umm-chip-cd',
  'DVD': 'umm-chip-dvd',
  'CD/DVD': 'umm-chip-cd-dvd',
  '磁带': 'umm-chip-cassette',
  '数字': 'umm-chip-digital',
  '黑胶': 'umm-chip-vinyl',
  'LP': 'umm-chip-lp',
  'SACD': 'umm-chip-sacd',
  'Blu-ray': 'umm-chip-bluray',
  'VCD': 'umm-chip-vcd',
  '流媒体': 'umm-chip-streaming',
}

interface Props {
  item: SearchItem
  records: Map<string, StoreRecord>
  type?: 'movie' | 'music' | 'book'
}

const props = withDefaults(defineProps<Props>(), { type: 'movie' })

const rec = props.records.get(String(props.item.id))
const badgeStatus = rec?.status ?? 0
const badgeRating = rec?.rating ?? 0

const isMusic = props.type === 'music'
const isBook = props.type === 'book'

/** Extract media format from abstract metadata string (music only) */
const mediaFormat = computed(() => {
  if (!isMusic || !props.item.abstract) return null
  const segments = props.item.abstract.split(' / ')
  for (const seg of segments) {
    const trimmed = seg.trim()
    if (MEDIA_FORMATS.has(trimmed)) {
      return FORMAT_LABELS[trimmed] || trimmed
    }
  }
  return null
})
</script>

<template>
  <a
    :href="item.url"
    target="_blank" rel="noopener noreferrer"
    class="umm-search-card"
    :class="{ 'umm-search-card--music': isMusic }"
  >
    <div class="umm-search-card-cover-area" :class="{ 'umm-search-card-cover-area--music': isMusic }">
      <div class="umm-search-card-cover" :class="{ 'umm-search-card-cover--music': isMusic }">
        <UmmImageWrapper
          :src="item.cover_url"
          :alt="item.title"
          :aspect-ratio="isMusic ? ASPECT_RATIO.SQUARE : ASPECT_RATIO.POSTER"
        />
        <span v-if="item.labels?.length && !isBook" class="umm-search-label">{{ item.labels[0].text }}</span>
      </div>
      <div v-if="isMusic && mediaFormat" class="umm-search-media-row">
        <span class="umm-search-media-chip" :class="FORMAT_COLORS[mediaFormat] || ''">{{ mediaFormat }}</span>
      </div>
    </div>
    <div class="umm-search-card-body">
      <div class="umm-search-card-title-row">
        <span class="umm-search-card-title">{{ item.title }}</span>
        <UmmStatusBadgeWrapper
          :status="badgeStatus"
          :rating="badgeRating"
          variant="small"
          :type="type"
        />
      </div>
      <UmmRating :score="item.rating.value.toFixed(1)" :count="item.rating.count" />
      <div v-if="item.abstract" class="umm-search-meta">{{ item.abstract }}</div>
      <div v-if="item.abstract_2 && !isBook" class="umm-search-cast">{{ item.abstract_2 }}</div>
    </div>
  </a>
</template>