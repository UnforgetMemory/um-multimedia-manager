<script setup lang="ts">
import { computed } from 'vue'
import { statusBadgeLabels } from '../../shared/status-labels'
import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import type { GameCollectData } from './types'
import UmmPaginator from '@/content/douban/components/UmmPaginator.vue'
import UmmUserBar from '@/content/douban/components/UmmUserBar.vue'
import { usePaginator } from '../../shared/composables/usePaginator'

const props = defineProps<{ data: GameCollectData }>()

const { currentPage, totalPages, onPageChange } = usePaginator(
  () => props.data.pageLinks,
  () => props.data.prevPageUrl,
  () => props.data.nextPageUrl,
)

function parseRating(rating: string): number {
  const match = rating.match(/allstar(\d+)/)
  return match ? parseInt(match[1], 10) / 10 : 0
}

const titleLabel = computed(() => {
  const labels = statusBadgeLabels.game
  switch (props.data.subType) {
    case 'wish': return labels.wish
    case 'do': return labels.doing
    default: return labels.done
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

      <div class="umm-titlebar">
        <h2 class="umm-titlebar-label">{{ titleLabel }}</h2>
        <span class="umm-titlebar-count">共 {{ data.total.toLocaleString() }} 个</span>
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
