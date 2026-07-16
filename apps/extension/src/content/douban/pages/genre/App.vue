<script setup lang="ts">
import { computed } from 'vue'
import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import { UmmImageWrapper } from '@/content/douban/components/UmmImageWrapper'
import type { GenrePageData } from './types'

const props = defineProps<{ data: GenrePageData }>()
const d = props.data

const hasPrev = computed(() => !!d.pagination.prevUrl)
const hasNext = computed(() => !!d.pagination.nextUrl)

function goToPage(url: string): void {
  if (url) window.location.href = url
}
</script>

<template>
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
        >{{ link.name }}</a>
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
            <UmmImageWrapper
              :src="artist.avatarUrl"
              :alt="artist.name"
              aspect-ratio="1"
            />
          </div>
          <span class="umm-artist-name">{{ artist.name }}</span>
          <span class="umm-artist-likes">{{ artist.likes }}人喜欢</span>
        </a>
      </div>

      <!-- Pagination -->
      <div class="umm-pagination">
        <button
          class="umm-page-btn"
          :disabled="!hasPrev"
          @click="goToPage(d.pagination.prevUrl)"
        >‹ 前页</button>
        <span class="umm-page-info">{{ d.pagination.currentPage }} / {{ d.pagination.totalPages }}</span>
        <button
          class="umm-page-btn"
          :disabled="!hasNext"
          @click="goToPage(d.pagination.nextUrl)"
        >后页 ›</button>
      </div>
    </div>
  </UmmPageLayout>
</template>