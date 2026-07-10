<script setup lang="ts">
import { computed } from 'vue'
import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import type { GameCollectData } from './types'
import UmmPaginator from '@/content/douban/components/UmmPaginator.vue'
import UmmUserBar from '@/content/douban/components/UmmUserBar.vue'

const props = defineProps<{ data: GameCollectData }>()

const currentPage = computed(() => {
  const current = props.data.pageLinks.find(p => p.current)
  if (!current) return 1
  const n = parseInt(current.label, 10)
  return isNaN(n) ? 1 : n
})

const totalPages = computed(() => {
  const links = props.data.pageLinks
  if (links.length === 0) return 1
  const last = links[links.length - 1].label
  const n = parseInt(last, 10)
  return isNaN(n) ? 1 : n
})

function onPageChange(page: number): void {
  const link = props.data.pageLinks.find(p => p.label === String(page))
  if (link?.url) {
    if (isSafeDoubanUrl(link.url)) window.location.href = link.url
    return
  }
  if (page < currentPage.value && props.data.prevPageUrl && isSafeDoubanUrl(props.data.prevPageUrl)) {
    window.location.href = props.data.prevPageUrl
  } else if (page > currentPage.value && props.data.nextPageUrl && isSafeDoubanUrl(props.data.nextPageUrl)) {
    window.location.href = props.data.nextPageUrl
  }
}

function isSafeDoubanUrl(url: string): boolean {
  return /^https?:\/\/([a-z0-9-]+\.)*douban\.com\//.test(url)
}

function parseRating(rating: string): number {
  const match = rating.match(/allstar(\d+)/)
  return match ? parseInt(match[1], 10) / 10 : 0
}

const titleLabel = computed(() => {
  switch (props.data.subType) {
    case 'wish': return '想玩'
    case 'do': return '在玩'
    default: return '玩过'
  }
})
</script>

<template>
  <UmmPageLayout type="movie">
    <div class="umm-gc-root">
      <UmmUserBar
        :avatar-url="data.avatarUrl"
        :display-name="data.displayName"
        :user-id="data.userId"
        :nav-links="data.navLinks"
      />

      <div class="umm-gc-titlebar">
        <h2 class="umm-gc-titlebar-label">{{ titleLabel }}</h2>
        <span class="umm-gc-titlebar-count">共 {{ data.total.toLocaleString() }} 个</span>
      </div>

      <div v-if="data.total === 0 && data.items.length === 0" class="umm-gc-empty">
        <div class="umm-gc-empty-text">暂无内容</div>
      </div>

      <div v-if="data.items.length > 0" class="umm-gc-list">
        <div v-for="item in data.items" :key="item.subjectId || item.url" class="umm-gc-card">
          <a v-if="item.url" :href="item.url" class="umm-gc-cover-link" target="_blank">
            <div class="umm-gc-cover" :style="{ backgroundImage: `url(${item.posterUrl})` }" />
          </a>
          <div v-else class="umm-gc-cover-link">
            <div class="umm-gc-cover" :style="{ backgroundImage: `url(${item.posterUrl})` }" />
          </div>
          <div class="umm-gc-body">
            <a v-if="item.url" :href="item.url" class="umm-gc-title" target="_blank">{{ item.title }}</a>
            <span v-else class="umm-gc-title">{{ item.title }}</span>
            <div v-if="item.platforms" class="umm-gc-platforms">{{ item.platforms }}</div>
            <div class="umm-gc-meta">
              <span v-if="item.rating" class="umm-gc-rating">{{ parseRating(item.rating) }} 分</span>
              <span v-if="item.date" class="umm-gc-date">{{ item.date }}</span>
            </div>
            <div v-if="item.comment" class="umm-gc-comment">{{ item.comment }}</div>
          </div>
        </div>
      </div>

      <div v-if="totalPages > 0" class="umm-gc-pageinfo">
        第 {{ currentPage }} 页 / 共 {{ totalPages }} 页
      </div>

      <UmmPaginator
        :current-page="currentPage"
        :total-pages="totalPages"
        @page-change="onPageChange"
      />
    </div>
  </UmmPageLayout>
</template>
