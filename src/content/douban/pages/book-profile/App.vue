<script setup lang="ts">
/**
 * Book Profile — book.douban.com/people/{uid}/ overlay.
 *
 * Displays the user's book reading profile: stats, read/wish collections,
 * recent reading activity, reviews, and book doulists.
 *
 * Reuses UmmPageLayout, UmmStatBar from shared components.
 */
import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import UmmStatBar from '@/content/douban/components/UmmStatBar.vue'
import type { BookProfileData, RecentReadingItem } from './types'

defineProps<{
  data: BookProfileData
}>()

function parseRating(rating: number): string {
  return '★'.repeat(Math.floor(rating)) + (rating % 1 >= 0.5 ? '½' : '')
}

function actionLabel(item: RecentReadingItem): string {
  switch (item.action) {
    case 'read': return '读过'
    case 'wish': return '想读'
    case 'review': return '写了书评'
    default: return ''
  }
}
</script>

<template>
  <UmmPageLayout type="book">
    <div class="umm-book-profile-root">

      <!-- ===== Hero ===== -->
      <div class="umm-hero">
        <div
          v-if="data.user.avatarUrl"
          class="umm-hero-avatar"
          :style="{ backgroundImage: `url(${data.user.avatarUrl})` }"
        />
        <div class="umm-hero-body">
          <h1 class="umm-hero-name">{{ data.user.displayName }}</h1>
          <p v-if="data.user.joinDate" class="umm-hero-meta">
            <span class="umm-hero-tag">🗓️ {{ data.user.joinDate }} 加入</span>
          </p>
        </div>
      </div>

      <!-- ===== Nav Tabs ===== -->
      <nav v-if="data.navItems.length > 0" class="umm-profile-nav">
        <a
          v-for="item in data.navItems"
          :key="item.label"
          :href="item.url"
          class="umm-profile-nav-item"
          :class="{ 'umm-profile-nav-item--active': item.active }"
          target="_blank"
          rel="noopener"
        >{{ item.label }}</a>
      </nav>

      <!-- ===== Stat Bars ===== -->
      <div class="umm-statbars">
        <UmmStatBar
          title="📚 读书"
          :items="[
            ...(data.readTotal > 0 ? [{ label: '读过', value: data.readTotal, url: `https://book.douban.com/people/${data.user.userId}/collect` }] : []),
            ...(data.wishTotal > 0 ? [{ label: '想读', value: data.wishTotal, url: `https://book.douban.com/people/${data.user.userId}/wish` }] : []),
            ...(data.user.reviewCount > 0 ? [{ label: '书评', value: data.user.reviewCount, url: `https://book.douban.com/people/${data.user.userId}/reviews` }] : []),
          ]"
        />
      </div>

      <!-- ===== Read Books ===== -->
      <div v-if="data.readBooks.length > 0" class="umm-dash-section">
        <h2 class="umm-dash-head">
          读过
          <a
            v-if="data.readTotal > 0"
            :href="`https://book.douban.com/people/${data.user.userId}/collect`"
            class="umm-dash-head-link"
            target="_blank"
          >全部{{ data.readTotal }}</a>
        </h2>
        <div class="umm-dash-grid">
          <a
            v-for="book in data.readBooks"
            :key="book.subjectId"
            :href="book.href"
            class="umm-dash-card"
            target="_blank"
            rel="noopener noreferrer"
          >
            <div
              class="umm-dash-card-cover"
              :style="{ backgroundImage: `url(${book.coverUrl})` }"
            />
            <span class="umm-dash-card-title">{{ book.title }}</span>
          </a>
        </div>
      </div>

      <!-- ===== Wish Books ===== -->
      <div v-if="data.wishBooks.length > 0" class="umm-dash-section">
        <h2 class="umm-dash-head">
          想读
          <a
            v-if="data.wishTotal > 0"
            :href="`https://book.douban.com/people/${data.user.userId}/wish`"
            class="umm-dash-head-link"
            target="_blank"
          >全部{{ data.wishTotal }}</a>
        </h2>
        <div class="umm-dash-grid">
          <a
            v-for="book in data.wishBooks"
            :key="book.subjectId"
            :href="book.href"
            class="umm-dash-card"
            target="_blank"
            rel="noopener noreferrer"
          >
            <div
              class="umm-dash-card-cover"
              :style="{ backgroundImage: `url(${book.coverUrl})` }"
            />
            <span class="umm-dash-card-title">{{ book.title }}</span>
          </a>
        </div>
      </div>

      <!-- ===== Collected Authors ===== -->
      <div v-if="data.authors.length > 0" class="umm-dash-section">
        <h2 class="umm-dash-head">
          收藏的作者
          <a
            :href="`https://book.douban.com/people/${data.user.userId}/authors`"
            class="umm-dash-head-link"
            target="_blank"
          >全部{{ data.authors.length }}</a>
        </h2>
        <div class="umm-author-grid">
          <a
            v-for="author in data.authors"
            :key="author.authorId"
            :href="author.href"
            class="umm-author-card"
            target="_blank"
            rel="noopener noreferrer"
          >
            <div
              class="umm-author-avatar"
              :style="{ backgroundImage: `url(${author.avatarUrl})` }"
            />
            <span class="umm-author-name">{{ author.name }}</span>
          </a>
        </div>
      </div>

      <!-- ===== Recent Reading Activity ===== -->
      <div v-if="data.recentReading.length > 0" class="umm-dash-section">
        <h2 class="umm-dash-head">最近阅读</h2>
        <div class="umm-timeline">
          <template
            v-for="(item, idx) in data.recentReading"
            :key="`${item.subjectId}-${item.date}-${idx}`"
          >
            <!-- Date separator -->
            <div
              v-if="idx === 0 || item.date !== data.recentReading[idx - 1].date"
              class="umm-timeline-date"
            >
              <span class="umm-timeline-date-dot" />
              <span class="umm-timeline-date-text">{{ item.date }}</span>
            </div>
            <!-- Entry -->
            <div class="umm-timeline-item">
              <span class="umm-timeline-action">{{ actionLabel(item) }}</span>
              <a :href="item.href" class="umm-timeline-title" target="_blank" rel="noopener noreferrer">{{ item.title }}</a>
              <span v-if="item.rating > 0" class="umm-timeline-stars">{{ '★'.repeat(item.rating) }}</span>
              <p v-if="item.quote" class="umm-timeline-quote">{{ item.quote }}</p>
            </div>
          </template>
        </div>
      </div>

      <!-- ===== Reviews ===== -->
      <div v-if="data.reviews.length > 0" class="umm-dash-section">
        <h2 class="umm-dash-head">
          书评
          <a
            v-if="data.user.reviewCount > 0"
            :href="`https://book.douban.com/people/${data.user.userId}/reviews`"
            class="umm-dash-head-link"
            target="_blank"
          >全部{{ data.user.reviewCount }}</a>
        </h2>
        <div class="umm-reviews-list">
          <article v-for="rev in data.reviews" :key="rev.id" class="umm-review-card">
            <div v-if="rev.coverUrl" class="umm-review-poster">
              <a :href="rev.subjectUrl" target="_blank" rel="noopener noreferrer">
                <img :src="rev.coverUrl" :alt="rev.subjectTitle" loading="lazy" />
              </a>
            </div>
            <div class="umm-review-body">
              <a :href="rev.url" class="umm-review-title" target="_blank" rel="noopener noreferrer">{{ rev.title }}</a>
              <div class="umm-review-meta">
                <a :href="rev.subjectUrl" target="_blank" rel="noopener noreferrer" class="umm-review-subject">{{ rev.subjectTitle }}</a>
                <span v-if="rev.rating > 0" class="umm-review-stars">{{ parseRating(rev.rating) }}</span>
              </div>
              <p class="umm-review-excerpt">{{ rev.excerpt.slice(0, 200) }}{{ rev.excerpt.length > 200 ? '...' : '' }}</p>
            </div>
          </article>
        </div>
      </div>

      <!-- ===== Book Doulists ===== -->
      <div v-if="data.doulists.length > 0" class="umm-dash-section">
        <h2 class="umm-dash-head">
          📋 图书豆列
          <a
            :href="`https://www.douban.com/people/${data.user.userId}/subject_doulists/book`"
            class="umm-dash-head-link"
            target="_blank"
          >全部</a>
        </h2>
        <div class="umm-doulist-grid">
          <a
            v-for="dl in data.doulists"
            :key="dl.url"
            :href="dl.url"
            class="umm-doulist-item"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span class="umm-doulist-item-title">{{ dl.title }}</span>
            <span v-if="dl.recommendCount > 0" class="umm-doulist-item-count">{{ dl.recommendCount }}人推荐</span>
          </a>
        </div>
      </div>

    </div>
  </UmmPageLayout>
</template>
