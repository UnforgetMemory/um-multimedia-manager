<script setup lang="ts">
import type { AlbumsPageData, AlbumVersionItem } from './types'
import type { StoreRecord } from '@/types'
import { computed } from 'vue'
import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import { UmmImageWrapper } from '@/content/douban/components/UmmImageWrapper'
import { UmmStatusBadgeWrapper } from '@/content/douban/components/UmmStatusBadgeWrapper'
import { UmmRating } from '@/content/douban/components/UmmRating'
import { ASPECT_RATIO } from '@/content/douban/shared/constants'

const props = defineProps<{
  data: AlbumsPageData
  recordMap: Map<string, StoreRecord>
}>()

const MEDIA_FORMATS = new Set([
  'CD', 'DVD', 'CD/DVD', '磁带', '数字(Digital)',
  '黑胶', 'LP', 'SACD', 'Blu-ray', 'VCD', 'LD', '流媒体', 'Digital',
])

const FORMAT_LABELS: Record<string, string> = {
  '数字(Digital)': '数字',
  'Digital': '数字',
}

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

function getRecordStatus(item: AlbumVersionItem): { status: number; rating: number } {
  const rec = props.recordMap.get(String(item.id))
  if (!rec) return { status: 0, rating: 0 }
  return { status: rec.status ?? 0, rating: rec.rating ?? 0 }
}

function extractMediaFormat(abstract: string): { label: string; colorClass: string } | null {
  if (!abstract) return null
  const segments = abstract.split(' / ')
  for (const seg of segments) {
    const trimmed = seg.trim()
    if (MEDIA_FORMATS.has(trimmed)) {
      const label = FORMAT_LABELS[trimmed] || trimmed
      return { label, colorClass: FORMAT_COLORS[label] || '' }
    }
  }
  return null
}

const chipData = computed(() => {
  return props.data.versions.map((v) => extractMediaFormat(v.abstract))
})
</script>

<template>
  <UmmPageLayout type="music">
    <div class="umm-albums-root">
      <div class="umm-albums-header">
        <h1 class="umm-albums-title">{{ data.albumTitle }}</h1>
        <span class="umm-albums-count">{{ data.versions.length }} 个版本</span>
      </div>

      <div class="umm-albums-list">
        <a
          v-for="(item, i) in data.versions"
          :key="item.id"
          :href="item.url"
          target="_blank" rel="noopener noreferrer"
          class="umm-album-card"
        >
          <div class="umm-album-cover-wrap">
            <UmmImageWrapper
              :src="item.coverUrl"
              :alt="item.title"
              :aspect-ratio="ASPECT_RATIO.SQUARE"
            />
            <div v-if="chipData[i]" class="umm-album-media-row">
              <span class="umm-album-media-chip" :class="chipData[i]!.colorClass">{{ chipData[i]!.label }}</span>
            </div>
          </div>

          <div class="umm-album-card-body">
            <div class="umm-album-title-row">
              <span class="umm-album-card-title">{{ item.title }}</span>
              <UmmStatusBadgeWrapper
                :status="getRecordStatus(item).status"
                :rating="getRecordStatus(item).rating"
                variant="small"
                type="music"
              />
            </div>
            <div v-if="item.subTitle" class="umm-album-subtitle">{{ item.subTitle }}</div>
            <UmmRating :score="item.ratingValue.toFixed(1)" :count="item.ratingCount" />
            <div v-if="item.abstract" class="umm-album-abstract">{{ item.abstract }}</div>
          </div>
        </a>
      </div>
    </div>
  </UmmPageLayout>
</template>
