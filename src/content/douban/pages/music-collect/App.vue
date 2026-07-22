<script setup lang="ts">
import { computed } from 'vue'
import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import { UmmRating } from '@/content/douban/components/UmmRating'
import type { MusicCollectData } from './types'
import UmmPaginator from '@/content/douban/components/UmmPaginator.vue'
import UmmUserBar from '@/content/douban/components/UmmUserBar.vue'

const props = defineProps<{
  data: MusicCollectData
}>()

/** Derive the current page number from paginator link */
const currentPage = computed(() => {
  const current = props.data.pageLinks.find(p => p.current)
  if (!current) return 1
  const n = parseInt(current.label, 10)
  return isNaN(n) ? 1 : n
})

/** Derive total page count from the last paginator link label */
const totalPages = computed(() => {
  const links = props.data.pageLinks
  if (links.length === 0) return 1
  const last = links[links.length - 1].label
  const n = parseInt(last, 10)
  return isNaN(n) ? 1 : n
})

/** Navigate to the URL for the requested page */
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

/** Validate URL is a same-origin Douban link before programmatic navigation */
function isSafeDoubanUrl(url: string): boolean {
  return /^https?:\/\/([a-z0-9-]+\.)*douban\.com\//.test(url)
}

/** Human-readable tab label for the current collection sub-type */
const titleLabel = computed(() => {
  switch (props.data.subType) {
    case 'wish': return '想听'
    case 'doing': return '在听'
    default: return '听过'
  }
})

/** Convert music rating (1-3) to 0-10 scale for UmmRating */
function toRatingScore(rating: string): string | undefined {
  if (rating === '0' || !rating) return undefined
  const n = parseInt(rating, 10) // 1, 2, or 3
  return n === 3 ? '10.0' : String(n * 3.0)
}
</script>

<template>
  <UmmPageLayout type="music">
    <div class="umm-mc-root">
      <UmmUserBar
        :avatar-url="data.avatarUrl"
        :display-name="data.displayName"
        :user-id="data.userId"
        :nav-links="data.navLinks"
      />

      <!-- Title Bar -->
      <div class="umm-mc-titlebar">
        <h2 class="umm-mc-titlebar-label">{{ titleLabel }}</h2>
        <span class="umm-mc-titlebar-count">共 {{ data.total.toLocaleString() }} 张</span>
      </div>

      <!-- Sort Bar -->
      <div v-if="data.sortOptions.length > 0" class="umm-mc-optbar">
        <div class="umm-mc-optgroup">
          <a
            v-for="opt in data.sortOptions"
            :key="opt.label"
            :href="opt.url || undefined"
            :class="['umm-mc-opt', opt.active ? 'umm-mc-opt--active' : '']"
          >{{ opt.label }}</a>
        </div>
      </div>

      <!-- Empty State -->
      <div v-if="data.total === 0 && data.items.length === 0" class="umm-mc-empty">
        <div class="umm-mc-empty-text">暂无内容</div>
      </div>

      <!-- Grid -->
      <div v-if="data.items.length > 0" class="umm-mc-grid">
        <a
          v-for="item in data.items"
          :key="item.subjectId"
          :href="item.url"
          class="umm-mc-card"
          target="_blank"
        >
          <span v-if="item.date" class="umm-mc-card-date">{{ item.date }}</span>
          <div
            class="umm-mc-card-cover"
            :style="{ backgroundImage: `url(${item.posterUrl})` }"
          />
          <div class="umm-mc-card-body">
            <span class="umm-mc-card-title">{{ item.title }}</span>
            <span v-if="item.subtitle" class="umm-mc-card-subtitle">{{ item.subtitle }}</span>
            <span v-if="item.intro" class="umm-mc-card-intro">{{ item.intro }}</span>
            <UmmRating :score="toRatingScore(item.rating)" />
          </div>
        </a>
      </div>

      <!-- Page Info -->
      <div v-if="data.currentPage && data.total > 0" class="umm-mc-pageinfo">
        {{ data.currentPage }} / {{ data.total.toLocaleString() }}
      </div>

      <!-- Paginator -->
      <UmmPaginator
        :current-page="currentPage"
        :total-pages="totalPages"
        @page-change="onPageChange"
      />
    </div>
  </UmmPageLayout>
</template>
