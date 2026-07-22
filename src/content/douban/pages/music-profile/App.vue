<script setup lang="ts">
import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import UmmStatBar from '@/content/douban/components/UmmStatBar.vue'
import type { MusicProfileData } from './types'

defineProps<{
  data: MusicProfileData
}>()
</script>

<template>
  <UmmPageLayout type="music">
    <div class="umm-mp-root">
      <!-- Hero -->
      <div class="umm-mp-hero">
        <div
          v-if="data.avatarUrl"
          class="umm-mp-hero-avatar"
          :style="{ backgroundImage: `url(${data.avatarUrl})` }"
        />
        <div class="umm-mp-hero-body">
          <h1 class="umm-mp-hero-name">{{ data.displayName }}</h1>
        </div>
      </div>

      <!-- Stats -->
      <UmmStatBar
        v-if="data.stats.length > 0"
        :items="data.stats.map(stat => ({ label: stat.label, value: stat.count, url: stat.url }))"
      />

      <!-- Album Section -->
      <div v-if="data.albumSection" class="umm-mp-section">
        <div class="umm-mp-section-head">
          <span class="umm-mp-section-lbl">{{ data.albumSection.label }}</span>
          <a :href="data.albumSection.url" class="umm-mp-section-more" target="_blank">
            全部 {{ data.albumSection.count.toLocaleString() }} →
          </a>
        </div>
        <div v-if="data.albumSection.items.length > 0" class="umm-mp-grid">
          <a
            v-for="item in data.albumSection.items"
            :key="item.url"
            :href="item.url"
            class="umm-mp-card"
            target="_blank"
          >
            <div
              class="umm-mp-card-cover"
              :style="{ backgroundImage: `url(${item.posterUrl})` }"
            />
            <span class="umm-mp-card-title">{{ item.title }}</span>
          </a>
        </div>
      </div>

      <!-- Musicians -->
      <div v-if="data.musicians.length > 0" class="umm-mp-section">
        <div class="umm-mp-section-head">
          <span class="umm-mp-section-lbl">我喜欢的艺术家</span>
        </div>
        <div class="umm-mp-musicians">
          <a
            v-for="m in data.musicians"
            :key="m.url"
            :href="m.url"
            class="umm-mp-musician"
            target="_blank"
          >{{ m.name }}</a>
        </div>
      </div>

      <!-- Doulists -->
      <div v-if="data.doulists.length > 0" class="umm-mp-section">
        <div class="umm-mp-section-head">
          <span class="umm-mp-section-lbl">我的音乐豆列</span>
        </div>
        <div class="umm-mp-doulist">
          <a
            v-for="dl in data.doulists"
            :key="dl.url"
            :href="dl.url"
            class="umm-mp-doulist-item"
            target="_blank"
          >
            <span class="umm-mp-doulist-title">{{ dl.title }}</span>
            <span class="umm-mp-doulist-followers">{{ dl.followers }}人关注</span>
          </a>
        </div>
      </div>
    </div>
  </UmmPageLayout>
</template>
