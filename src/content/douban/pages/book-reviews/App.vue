<script setup lang="ts">
import UmmPageLinks from '@/content/douban/components/UmmPageLinks.vue';
import { ref } from 'vue'
import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import type { BookReviewsData } from './types'
import UmmUserBar from '@/content/douban/components/UmmUserBar.vue'

defineProps<{
  data: BookReviewsData
}>()

/** Track which reviews have been expanded to show full content */
const expandedRev = ref<Set<string>>(new Set())

function toggleExpand(id: string): void {
  const s = expandedRev.value
  if (s.has(id)) s.delete(id)
  else s.add(id)
  // Replace Set reference to trigger Vue 3 reactivity
  expandedRev.value = new Set(s)
}

function isExpanded(id: string): boolean {
  return expandedRev.value.has(id)
}

/** Render 0-10 rating as ★/½/☆ characters */
function starHtml(rating: number): string {
  const full = Math.max(0, Math.floor(rating))
  const half = rating - full >= 0.5
  const empty = Math.max(0, 5 - full - (half ? 1 : 0))
  return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(empty)
}
</script>

<template>
  <UmmPageLayout type="book">
    <div class="umm-reviews-root">
      <UmmUserBar
        :avatar-url="data.avatarUrl"
        :display-name="data.displayName"
        :user-id="data.userId"
        :nav-links="data.navLinks"
      />

      <!-- Title -->
      <div class="umm-titlebar">
        <h1 class="umm-titlebar-label">我的书评</h1>
        <span class="umm-titlebar-count">共 {{ data.total }} 篇</span>
      </div>

      <!-- Reviews -->
      <div v-if="data.items.length > 0" class="umm-reviews-list">
        <article v-for="item in data.items" :key="item.id" class="umm-reviews-card">
          <div class="umm-reviews-poster">
            <a :href="item.subjectUrl" target="_blank">
              <img :src="item.posterUrl" :alt="item.subjectTitle" loading="lazy" />
            </a>
          </div>
          <div class="umm-reviews-body">
            <h3 class="umm-reviews-review-title">
              <a :href="item.reviewUrl" target="_blank">{{ item.title }}</a>
            </h3>
            <div class="umm-reviews-meta">
              <span class="umm-reviews-subject">
                <a :href="item.subjectUrl" target="_blank">{{ item.subjectTitle }}</a>
              </span>
              <span v-if="item.rating > 0" class="umm-reviews-rating" v-html="starHtml(item.rating)" />
              <span class="umm-reviews-stats">
                <span v-if="item.readCount > 0">{{ item.readCount }} 阅读</span>
                <span v-if="item.usefulCount > 0">· {{ item.usefulCount }} 有用</span>
              </span>
            </div>
            <div :class="['umm-reviews-content', isExpanded(item.id) ? 'umm-reviews-content--expanded' : '']">
              <p>{{ isExpanded(item.id) ? item.content : item.content.slice(0, 400) }}{{ !isExpanded(item.id) && item.content.length > 400 ? '...' : '' }}</p>
              <button
                v-if="item.content.length > 400"
                class="umm-reviews-expand"
                @click.prevent="toggleExpand(item.id)"
              >{{ isExpanded(item.id) ? '收起' : '展开全文' }}</button>
            </div>
          </div>
        </article>
      </div>
      <div v-else class="umm-empty">暂无书评</div>

      <!-- Paginator -->
      <UmmPageLinks
        v-if="data.pageLinks.length > 0"
        :pages="data.pageLinks"
        :prev-url="data.prevPageUrl"
        :next-url="data.nextPageUrl"
        container-class="umm-reviews-paginator"
        page-class="umm-reviews-page"
      />
    </div>
  </UmmPageLayout>
</template>
