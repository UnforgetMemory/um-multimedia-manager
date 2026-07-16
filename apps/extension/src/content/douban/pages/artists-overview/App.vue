<script setup lang="ts">
import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import { UmmImageWrapper } from '@/content/douban/components/UmmImageWrapper'
import type { ArtistsOverviewData } from './types'

defineProps<{ data: ArtistsOverviewData }>()
</script>

<template>
  <UmmPageLayout type="music">
    <div class="umm-artists-root">
      <!-- Section: Recommended artists -->
      <div v-if="data.recommendedArtists.length > 0" class="umm-section">
        <h2 class="umm-section-title">你可能感兴趣的音乐人</h2>
        <div class="umm-artist-grid">
          <a
            v-for="(artist, i) in data.recommendedArtists"
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
          </a>
        </div>
      </div>

      <!-- Section: Events -->
      <div v-if="data.events.length > 0" class="umm-section">
        <h2 class="umm-section-title">推荐活动</h2>
        <div class="umm-event-list">
          <a
            v-for="(evt, i) in data.events"
            :key="i"
            :href="evt.href"
            target="_blank"
            rel="noopener noreferrer"
            class="umm-event-card"
          >
            <div class="umm-event-image">
              <UmmImageWrapper
                :src="evt.imageUrl"
                :alt="evt.title"
                aspect-ratio="1"
              />
            </div>
            <div class="umm-event-info">
              <div class="umm-event-desc">{{ evt.description }}</div>
            </div>
          </a>
        </div>
      </div>

      <!-- Section: Genre navigation -->
      <div v-if="data.genreNav.length > 0" class="umm-section">
        <h2 class="umm-section-title">流派</h2>
        <div class="umm-genre-section">
          <div class="umm-genre-tags">
            <a
              v-for="genre in data.genreNav"
              :key="genre.name"
              :href="genre.href"
              target="_blank"
              rel="noopener noreferrer"
              class="umm-genre-tag"
            >{{ genre.name }}</a>
          </div>
        </div>
      </div>
    </div>
  </UmmPageLayout>
</template>