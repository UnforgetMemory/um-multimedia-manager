<script setup lang="ts">
import { safeHref } from '@/libraries/utils/safe-url';
import { t } from '../../shared/legacy-bridge';
import { computed } from 'vue';
import { UmmPageLayout } from '@/scenario/douban/components/umm-page-layout';
import { UmmImageWrapper } from '@/scenario/douban/components/umm-image-wrapper';
import type { GenrePageData } from './types';

const props = defineProps<{ data: GenrePageData }>();
const d = props.data;

const hasPrev = computed(() => !!d.pagination.prevUrl);
const hasNext = computed(() => !!d.pagination.nextUrl);

function goToPage(url: string): void {
  if (url) window.location.href = safeHref(url);
}
</script>

<template vapor>
  <UmmPageLayout type="music">
    <div class="umm-genre-root">
      <!-- Header -->
      <div class="umm-genre-header">
        <h1 class="umm-genre-title">{{ d.genreName }}</h1>
      </div>

      <!-- Genre nav -->
      <div v-if="d.navLinks.length > 0" class="umm-genre-nav">
        <a
          v-for="link in d.navLinks"
          :key="link.name"
          :href="link.href"
          :class="link.isCurrent ? 'umm-genre-nav-current' : 'umm-genre-nav-link'"
          target="_blank"
          rel="noopener noreferrer"
          >{{ link.name }}</a
        >
      </div>

      <!-- Artist grid -->
      <div class="umm-artist-grid">
        <a
          v-for="(artist, i) in d.artists"
          :key="i"
          :href="artist.href"
          target="_blank"
          rel="noopener noreferrer"
          class="umm-artist-card"
        >
          <div class="umm-artist-avatar">
            <UmmImageWrapper :src="artist.avatarUrl" :alt="artist.name" aspect-ratio="1" />
          </div>
          <span class="umm-artist-name">{{ artist.name }}</span>
          <span class="umm-artist-likes">{{
            t('douban.genre.likes', { count: artist.likes })
          }}</span>
        </a>
      </div>

      <!-- Pagination -->
      <div class="umm-pagination">
        <button class="umm-page-btn" :disabled="!hasPrev" @click="goToPage(d.pagination.prevUrl)">
          {{ t('douban.genre.prev') }}
        </button>
        <span class="umm-page-info"
          >{{ d.pagination.currentPage }} / {{ d.pagination.totalPages }}</span
        >
        <button class="umm-page-btn" :disabled="!hasNext" @click="goToPage(d.pagination.nextUrl)">
          {{ t('douban.genre.next') }}
        </button>
      </div>
    </div>
  </UmmPageLayout>
</template>
