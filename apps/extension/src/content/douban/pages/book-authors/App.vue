<script setup lang="ts">
import { computed } from 'vue'
import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import type { BookAuthorsData } from './types'
import UmmPaginator from '@/content/douban/components/UmmPaginator.vue'
import UmmUserBar from '@/content/douban/components/UmmUserBar.vue'

const props = defineProps<{
  data: BookAuthorsData
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
</script>

<template>
  <UmmPageLayout type="book">
    <div class="umm-authors-root">
      <UmmUserBar
        :avatar-url="data.avatarUrl"
        :display-name="data.displayName"
        :user-id="data.userId"
        :nav-links="data.navLinks"
      />

      <!-- Title -->
      <div class="umm-authors-titlebar">
        <h1 class="umm-authors-title">收藏的作者</h1>
        <span class="umm-authors-count">共 {{ data.total.toLocaleString() }} 位</span>
      </div>

      <!-- Grid -->
      <div v-if="data.items.length > 0" class="umm-authors-grid">
        <a
          v-for="item in data.items"
          :key="item.url"
          :href="item.url"
          class="umm-authors-card"
          target="_blank"
        >
          <div
            class="umm-authors-photo"
            :style="{ backgroundImage: `url(${item.photoUrl})` }"
          />
          <div class="umm-authors-body">
            <span class="umm-authors-name">{{ item.name }}</span>
            <span v-if="item.roles" class="umm-authors-roles">{{ item.roles }}</span>
            <div v-if="item.works.length > 0" class="umm-authors-works">
              <span
                v-for="(w, i) in item.works.slice(0, 3)"
                :key="w.url"
              >{{ w.title }}{{ i < Math.min(item.works.length, 3) - 1 ? ' / ' : '' }}</span>
            </div>
          </div>
        </a>
      </div>
      <div v-else class="umm-empty">暂无内容</div>

      <!-- Paginator -->
      <UmmPaginator
        :current-page="currentPage"
        :total-pages="totalPages"
        @page-change="onPageChange"
      />
    </div>
  </UmmPageLayout>
</template>
