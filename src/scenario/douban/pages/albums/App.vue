<script setup lang="ts">
import type { AlbumsPageData, AlbumVersionItem } from './types';
import type { StoreRecord } from '@/types';
import { computed } from 'vue';
import { UmmPageLayout } from '@/scenario/douban/components/umm-page-layout';
import { useRecordCache } from '../../shared/composables/use-record-cache';
import { t } from '../../shared/legacy-bridge';
import { UmmImageWrapper } from '@/scenario/douban/components/umm-image-wrapper';
import { UmmStatusBadgeWrapper } from '@/scenario/douban/components/umm-status-badge-wrapper';
import { UmmRating } from '@/scenario/douban/components/umm-rating';
import {
  ASPECT_RATIO,
  MEDIA_FORMATS,
  FORMAT_LABEL_KEYS,
  FORMAT_COLORS,
} from '@/scenario/douban/shared/media-formats';

const props = defineProps<{
  data: AlbumsPageData;
  recordMap: Map<string, StoreRecord>;
}>();

// Seeded from the mount-time batch read; re-reads when a visible album is
// written elsewhere so badges stop being a reload-away stale state.
const { records } = useRecordCache(
  'music',
  () => props.data.versions.filter((v) => v.id).map((v) => String(v.id)),
  props.recordMap,
);

function getRecordStatus(item: AlbumVersionItem): { status: number; rating: number } {
  const rec = records.value.get(String(item.id));
  if (!rec) return { status: 0, rating: 0 };
  return { status: rec.status ?? 0, rating: rec.rating ?? 0 };
}

function extractMediaFormat(abstract: string): { label: string; colorClass: string } | null {
  if (!abstract) return null;
  const segments = abstract.split(' / ');
  for (const seg of segments) {
    const trimmed = seg.trim();
    if (MEDIA_FORMATS.has(trimmed)) {
      const labelKey = FORMAT_LABEL_KEYS[trimmed];
      const label = labelKey ? t(labelKey) : trimmed;
      return { label, colorClass: FORMAT_COLORS[trimmed] || '' };
    }
  }
  return null;
}

const chipData = computed(() => {
  return props.data.versions.map((v) => extractMediaFormat(v.abstract));
});
</script>

<template vapor>
  <UmmPageLayout type="music">
    <div class="umm-albums-root">
      <div class="umm-albums-header">
        <h1 class="umm-albums-title">{{ data.albumTitle }}</h1>
        <span class="umm-albums-count">{{
          t('douban.albums.count', { count: data.versions.length })
        }}</span>
      </div>

      <div class="umm-albums-list">
        <a
          v-for="(item, i) in data.versions"
          :key="item.id"
          :href="item.url"
          target="_blank"
          rel="noopener noreferrer"
          class="umm-album-card"
        >
          <div class="umm-album-cover-wrap">
            <UmmImageWrapper
              :src="item.coverUrl"
              :alt="item.title"
              :aspect-ratio="ASPECT_RATIO.SQUARE"
            />
            <div v-if="chipData[i]" class="umm-album-media-row">
              <span class="umm-album-media-chip" :class="chipData[i]!.colorClass">{{
                chipData[i]!.label
              }}</span>
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
