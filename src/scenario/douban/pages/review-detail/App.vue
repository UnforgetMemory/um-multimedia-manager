<script setup lang="ts">
import { UmmPageLayout } from '@/scenario/douban/components/umm-page-layout';
import { t } from '../../shared/legacy-bridge';
import type { ReviewDetailData } from './types';

defineProps<{
  data: ReviewDetailData;
}>();

function starHtml(rating: number): string {
  const full = Math.max(0, Math.floor(rating));
  const half = rating - full >= 0.5;
  const empty = Math.max(0, 5 - full - (half ? 1 : 0));
  return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(empty);
}
</script>

<template vapor>
  <UmmPageLayout type="movie">
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
            <span v-if="data.director" class="umm-rd-subj-item">{{
              t('douban.rd.director', { name: data.director })
            }}</span>
            <span v-if="data.cast" class="umm-rd-subj-item">{{
              t('douban.rd.cast', { name: data.cast })
            }}</span>
            <span v-if="data.genre" class="umm-rd-subj-item">{{ data.genre }}</span>
            <span v-if="data.region" class="umm-rd-subj-item">{{ data.region }}</span>
            <span v-if="data.releaseDate" class="umm-rd-subj-item">{{ data.releaseDate }}</span>
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
          <a :href="data.authorUrl" class="umm-rd-author-name" target="_blank">{{
            data.authorName
          }}</a>
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
        <span v-if="data.readCount > 0" class="umm-rd-stat">{{
          t('douban.rev.read', { count: data.readCount })
        }}</span>
        <span v-if="data.source" class="umm-rd-stat">{{ data.source }}</span>
        <span class="umm-rd-stat-sep" />
        <span class="umm-rd-stat">{{ t('douban.useful', { count: data.usefulCount }) }}</span>
        <span class="umm-rd-stat">{{ t('douban.rev.useless', { count: data.uselessCount }) }}</span>
      </div>
    </div>
  </UmmPageLayout>
</template>
