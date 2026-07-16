<script setup lang="ts">
import { ref } from 'vue'
import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import type { UserReviewsData } from './types'
import UmmUserBar from '@/content/douban/components/UmmUserBar.vue'

defineProps<{
  data: UserReviewsData
}>()

const expandedRev = ref<Set<string>>(new Set())

function toggleExpand(id: string): void {
  const s = expandedRev.value
  if (s.has(id)) s.delete(id)
  else s.add(id)
  // Trigger reactivity — Set mutations are invisible to Vue 3
  expandedRev.value = new Set(s)
}

function isExpanded(id: string): boolean {
  return expandedRev.value.has(id)
}

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
  <UmmPageLayout type="movie">
    <div class="umm-reviews-root">
      <UmmUserBar
        :avatar-url="data.avatarUrl"
        :display-name="data.displayName"
        :user-id="data.userId"
        :nav-links="data.navLinks"
      />

      <!-- Title -->
      <div class="umm-reviews-titlebar">
        <h1 class="umm-reviews-title">我的影评</h1>
        <span class="umm-reviews-count">共 {{ data.total }} 篇</span>
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
      <div v-else class="umm-empty">暂无影评</div>

      <!-- Paginator -->
      <div v-if="data.pageLinks.length > 0" class="umm-reviews-paginator">
        <a v-if="data.prevPageUrl" :href="data.prevPageUrl" class="umm-reviews-page">‹</a>
        <a
          v-for="pl in data.pageLinks" :key="pl.label"
          :href="pl.url || undefined"
          :class="['umm-reviews-page', pl.current ? 'umm-reviews-page--active' : '']"
        >{{ pl.label }}</a>
        <a v-if="data.nextPageUrl" :href="data.nextPageUrl" class="umm-reviews-page">›</a>
      </div>
    </div>
  </UmmPageLayout>
</template>
