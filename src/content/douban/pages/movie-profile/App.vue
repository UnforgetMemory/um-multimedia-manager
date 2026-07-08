<script setup lang="ts">
import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import type { MovieProfileData } from './types'

defineProps<{
  data: MovieProfileData
}>()
</script>

<template>
  <UmmPageLayout type="movie">
    <div class="umm-movie-profile-root">
      <!-- Hero -->
      <div class="umm-hero">
        <div
          v-if="data.avatarUrl"
          class="umm-hero-avatar"
          :style="{ backgroundImage: `url(${data.avatarUrl})` }"
        />
        <div class="umm-hero-body">
          <h1 class="umm-hero-name">{{ data.displayName }}</h1>
        </div>
      </div>

      <!-- Stat Pills -->
      <div v-if="data.stats.length > 0" class="umm-statbar">
        <div class="umm-statbar-items">
          <a
            v-for="s in data.stats"
            :key="s.label"
            :href="s.url"
            class="umm-statbar-item"
            target="_blank"
          >
            <span class="umm-statbar-val">{{ s.count.toLocaleString() }}</span>
            <span class="umm-statbar-lbl">{{ s.label }}</span>
          </a>
        </div>
      </div>

      <!-- Sections -->
      <div v-for="sec in data.sections" :key="sec.label" class="umm-dash-section">
        <div class="umm-dash-row-head">
          <span class="umm-dash-row-lbl">{{ sec.label }}</span>
          <a :href="sec.url" class="umm-dash-more" target="_blank">全部 {{ sec.count.toLocaleString() }} →</a>
        </div>
        <div v-if="sec.items.length > 0" class="umm-dash-grid">
          <a
            v-for="item in sec.items"
            :key="item.url"
            :href="item.url"
            class="umm-dash-card"
            target="_blank"
          >
            <div
              class="umm-dash-card-cover"
              :style="{ backgroundImage: `url(${item.posterUrl})` }"
            />
            <span class="umm-dash-card-title">{{ item.title }}</span>
          </a>
        </div>
      </div>

      <!-- Celebrity & Review Row -->
      <div v-if="data.celebrityCount > 0 || data.reviewCount > 0" class="umm-movie-profile-extras">
        <a
          v-if="data.celebrityCount > 0"
          :href="data.celebrityUrl"
          class="umm-statbar-item"
          target="_blank"
        >
          <span class="umm-statbar-val">{{ data.celebrityCount }}</span>
          <span class="umm-statbar-lbl">收藏的影人</span>
        </a>
        <a
          v-if="data.reviewCount > 0"
          :href="data.reviewUrl"
          class="umm-statbar-item"
          target="_blank"
        >
          <span class="umm-statbar-val">{{ data.reviewCount }}</span>
          <span class="umm-statbar-lbl">我的影评</span>
        </a>
      </div>

      <!-- Doulists -->
      <div v-if="data.doulists.length > 0" class="umm-dash-section">
        <div class="umm-dash-row-head">
          <span class="umm-dash-row-lbl">我的片单</span>
        </div>
        <div class="umm-movie-profile-doulist">
          <a
            v-for="dl in data.doulists"
            :key="dl.url"
            :href="dl.url"
            class="umm-movie-profile-doulist-item"
            target="_blank"
          >
            <span class="umm-movie-profile-doulist-title">{{ dl.title }}</span>
            <span class="umm-movie-profile-doulist-followers">{{ dl.followers }}人关注</span>
          </a>
        </div>
      </div>
    </div>
  </UmmPageLayout>
</template>
