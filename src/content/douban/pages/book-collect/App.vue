<script setup lang="ts">
import { computed } from 'vue'
import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import type { BookCollectData } from './types'
import UmmPaginator from '@/content/douban/components/UmmPaginator.vue'
import UmmUserBar from '@/content/douban/components/UmmUserBar.vue'

const props = defineProps<{
  data: BookCollectData
}>()

/** Derive the current page number from .thispage paginator label */
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

/** Navigate to the selected page via paginator link or prev/next fallback */
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
    case 'wish': return '想读'
    case 'doing': return '在读'
    default: return '读过'
  }
})
</script>

<template>
  <UmmPageLayout type="book">
    <div class="umm-bc-root">
      <UmmUserBar
        :avatar-url="data.avatarUrl"
        :display-name="data.displayName"
        :user-id="data.userId"
        :nav-links="data.navLinks"
      />

      <!-- Title Bar -->
      <div class="umm-bc-titlebar">
        <h2 class="umm-bc-titlebar-label">{{ titleLabel }}</h2>
        <span class="umm-bc-titlebar-count">共 {{ data.total.toLocaleString() }} 本</span>
      </div>

      <!-- Sort Bar -->
      <div v-if="data.sortOptions.length > 0" class="umm-bc-optbar">
        <div class="umm-bc-optgroup">
          <a
            v-for="opt in data.sortOptions"
            :key="opt.label"
            :href="opt.url || undefined"
            :class="['umm-bc-opt', opt.active ? 'umm-bc-opt--active' : '']"
          >{{ opt.label }}</a>
        </div>
      </div>

      <!-- Empty State -->
      <div v-if="data.total === 0 && data.items.length === 0" class="umm-bc-empty">
        <div class="umm-bc-empty-text">暂无内容</div>
      </div>

      <!-- List -->
      <div v-if="data.items.length > 0" class="umm-bc-list">
        <div v-for="item in data.items" :key="item.subjectId" class="umm-bc-card">
          <a :href="item.url" class="umm-bc-cover-link" target="_blank">
            <div
              class="umm-bc-cover"
              :style="{ backgroundImage: `url(${item.posterUrl})` }"
            />
          </a>
          <div class="umm-bc-body">
            <a :href="item.url" class="umm-bc-title" target="_blank">{{ item.title }}</a>
            <div v-if="item.pubInfo" class="umm-bc-pub">{{ item.pubInfo }}</div>
            <div v-if="item.date" class="umm-bc-date">{{ item.date }}</div>
            <div v-if="item.comment" class="umm-bc-comment">{{ item.comment }}</div>
          </div>
        </div>
      </div>

      <!-- Page Info -->
      <div v-if="data.currentPage && data.total > 0" class="umm-bc-pageinfo">
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
