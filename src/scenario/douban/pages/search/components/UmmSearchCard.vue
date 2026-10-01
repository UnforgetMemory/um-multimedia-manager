<script setup lang="ts">
/**
 * UmmSearchCard — search result card for Douban movie/TV/music/book search page.
 * Displays cover, title, status badge, rating, metadata, and media format chips (music only).
 */
import { safeHref } from '@/libraries/utils/safe-url';
import type { SearchItem } from '../types';
import type { StoreRecord } from '@/types';
import { computed } from 'vue';
import { UmmImageWrapper } from '@/scenario/douban/components/umm-image-wrapper';
import { UmmStatusBadgeWrapper } from '@/scenario/douban/components/umm-status-badge-wrapper';
import { UmmRating } from '@/scenario/douban/components/umm-rating';
import {
  ASPECT_RATIO,
  MEDIA_FORMATS,
  FORMAT_LABEL_KEYS,
  FORMAT_COLORS,
} from '@/scenario/douban/shared/media-formats';
import { splitTitleYear } from '@/scenario/douban/shared/title-year';
import { t } from '../../../shared/legacy-bridge';

/** 规范化 IMDb ID → 小写 tt-xxx；非法值返回 null */
function normalizeImdbId(id: string | undefined | null): string | null {
  if (!id) return null;
  const m = id.trim().match(/^(tt\d+)$/i);
  return m ? (m[1]?.toLowerCase() ?? null) : null;
}

interface Props {
  item: SearchItem;
  records: Map<string, StoreRecord>;
  type?: 'movie' | 'music' | 'book';
}

const props = withDefaults(defineProps<Props>(), { type: 'movie' });

// Lookup must stay inside a computed: a setup-time read freezes the badge at
// whatever the map held when this card mounted, so a record written in another
// tab would never land (the reason `useRecordCache` reloads looked like no-ops).
const badge = computed(() => {
  const rec = props.records.get(String(props.item.id));
  return { status: rec?.status ?? 0, rating: rec?.rating ?? 0 };
});

const isMusic = props.type === 'music';
const isBook = props.type === 'book';

/** 渲染 IMDb 链接（跟随详情页 metaToChips 模式） */
const imdbId = normalizeImdbId(props.item.imdb);
const imdbHref = imdbId ? `https://www.imdb.com/title/${imdbId}/` : null;

/** Extract media format from abstract metadata string (music only) */
const mediaFormat = computed(() => {
  if (!isMusic || !props.item.abstract) return null;
  const segments = props.item.abstract.split(' / ');
  for (const seg of segments) {
    const trimmed = seg.trim();
    if (MEDIA_FORMATS.has(trimmed)) {
      // Display names come from the dictionary; the color lookup MUST use the
      // host string (FORMAT_COLORS' key domain is host formats — looking up
      // with a localized display name drops the color from the zh "数字" chip,
      // a regression caught by the X108 re-review).
      const key = FORMAT_LABEL_KEYS[trimmed];
      return { label: key ? t(key) : trimmed, hostFormat: trimmed };
    }
  }
  return null;
});

/** Split the trailing year out of the title so it stays visible when the title truncates */
const titleParts = computed(() => splitTitleYear(props.item.title));
</script>

<template vapor>
  <div class="umm-search-card-wrap" :class="{ 'umm-search-card-wrap--music': isMusic }">
    <a
      :href="safeHref(item.url)"
      target="_blank"
      rel="noopener noreferrer"
      class="umm-search-card"
      :class="{ 'umm-search-card--music': isMusic }"
    >
      <div
        class="umm-search-card-cover-area"
        :class="{ 'umm-search-card-cover-area--music': isMusic }"
      >
        <div class="umm-search-card-cover" :class="{ 'umm-search-card-cover--music': isMusic }">
          <UmmImageWrapper
            :src="item.cover_url"
            :alt="item.title"
            :aspect-ratio="isMusic ? ASPECT_RATIO.SQUARE : ASPECT_RATIO.POSTER"
          />
          <span v-if="item.labels?.length && !isBook" class="umm-search-label">{{
            item.labels[0]?.text
          }}</span>
        </div>
        <div v-if="isMusic && mediaFormat" class="umm-search-media-row">
          <span
            class="umm-search-media-chip"
            :class="FORMAT_COLORS[mediaFormat.hostFormat] || ''"
            >{{ mediaFormat.label }}</span
          >
        </div>
        <div v-if="titleParts.year" class="umm-search-year-row">
          <span class="umm-search-year">{{ titleParts.year }}</span>
        </div>
      </div>
      <div class="umm-search-card-body">
        <div class="umm-search-card-title-row">
          <span class="umm-search-card-title">{{ titleParts.title }}</span>
          <UmmStatusBadgeWrapper
            :status="badge.status"
            :rating="badge.rating"
            variant="small"
            :type="type"
          />
        </div>
        <UmmRating :score="item.rating.value.toFixed(1)" :count="item.rating.count" />
        <div v-if="item.abstract" class="umm-search-meta">{{ item.abstract }}</div>
        <div v-if="item.abstract_2 && !isBook" class="umm-search-cast">{{ item.abstract_2 }}</div>
      </div>
    </a>
    <a
      v-if="imdbHref"
      :href="imdbHref"
      target="_blank"
      rel="noopener noreferrer"
      class="umm-search-imdb"
      @click.stop
    >
      IMDb {{ imdbId }}
    </a>
  </div>
</template>
