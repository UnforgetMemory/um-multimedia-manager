<script setup lang="ts">
import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import type { BookReviewDetailData } from './types'

defineProps<{
  data: BookReviewDetailData
}>()

/** Render 0-10 rating as ★/½/☆ characters */
function starHtml(rating: number): string {
  const full = Math.floor(rating)
  const half = rating - full >= 0.5
  let s = ''
  for (let i = 0; i < full; i++) s += '★'
  if (half) s += '½'
  const empty = 5 - full - (half ? 1 : 0)
  for (let i = 0; i < empty; i++) s += '☆'
  return s
}
</script>

<template>
  <UmmPageLayout type="book">
    <div class="umm-rd-root">
      <!-- Subject info card -->
      <div class="umm-rd-subject-card">
        <div class="umm-rd-subject-poster">
          <a :href="data.subjectUrl" target="_blank">
            <img :src="data.posterUrl" :alt="data.subjectTitle" loading="lazy" />
          </a>
        </div>
        <div class="umm-rd-subject-body">
          <h3 class="umm-rd-subject-title">
            <a :href="data.subjectUrl" target="_blank">{{ data.subjectTitle }}</a>
          </h3>
          <div class="umm-rd-subject-meta">
            <span v-if="data.author" class="umm-rd-subj-item">{{ data.author }}</span>
            <span v-if="data.publisher" class="umm-rd-subj-item">{{ data.publisher }}</span>
            <span v-if="data.pages" class="umm-rd-subj-item">{{ data.pages }}页</span>
          </div>
        </div>
      </div>

      <!-- Author bar -->
      <div class="umm-rd-authorbar">
        <a :href="data.authorUrl" class="umm-rd-avatar-link" target="_blank">
          <div
            v-if="data.avatarUrl"
            class="umm-rd-avatar"
            :style="{ backgroundImage: `url(${data.avatarUrl})` }"
          />
        </a>
        <div class="umm-rd-author-info">
          <a :href="data.authorUrl" class="umm-rd-author-name" target="_blank">{{ data.authorName }}</a>
          <div class="umm-rd-meta-line">
            <span v-if="data.date" class="umm-rd-date">{{ data.date }}</span>
            <span v-if="data.location" class="umm-rd-location">· {{ data.location }}</span>
          </div>
        </div>
        <div v-if="data.rating > 0" class="umm-rd-rating" v-html="starHtml(data.rating)" />
      </div>

      <!-- Review title -->
      <h1 class="umm-rd-title">{{ data.title }}</h1>

      <!-- Review content (article body) -->
      <div class="umm-rd-article">
        <p v-for="(p, idx) in data.paragraphs" :key="idx">{{ p }}</p>
      </div>

      <!-- Stats bar -->
      <div class="umm-rd-stats">
        <span v-if="data.readCount > 0" class="umm-rd-stat">{{ data.readCount }} 阅读</span>
        <span v-if="data.source" class="umm-rd-stat">{{ data.source }}</span>
        <span class="umm-rd-stat-sep" />
        <span class="umm-rd-stat">{{ data.usefulCount }} 有用</span>
        <span class="umm-rd-stat">{{ data.uselessCount }} 没用</span>
      </div>
    </div>
  </UmmPageLayout>
</template>
