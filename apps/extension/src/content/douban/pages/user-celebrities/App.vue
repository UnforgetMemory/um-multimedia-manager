<script setup lang="ts">
import { computed } from 'vue'
import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import type { UserCelebritiesData } from './types'
import UmmPaginator from '@/content/douban/components/UmmPaginator.vue'
import UmmUserBar from '@/content/douban/components/UmmUserBar.vue'

const props = defineProps<{
  data: UserCelebritiesData
}>()

/** Derive current page number from pageLinks */
const currentPage = computed(() => {
  const current = props.data.pageLinks.find(p => p.current)
  if (!current) return 1
  const n = parseInt(current.label, 10)
  return isNaN(n) ? 1 : n
})

/** Derive total pages from last page link label */
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
    window.location.href = link.url
    return
  }
  if (page < currentPage.value && props.data.prevPageUrl) {
    window.location.href = props.data.prevPageUrl
  } else if (page > currentPage.value && props.data.nextPageUrl) {
    window.location.href = props.data.nextPageUrl
  }
}
</script>

<template>
  <UmmPageLayout type="movie">
    <div class="umm-celebrities-root">
      <UmmUserBar
        :avatar-url="data.avatarUrl"
        :display-name="data.displayName"
        :user-id="data.userId"
        :nav-links="data.navLinks"
      />

      <!-- Title -->
      <div class="umm-celebrities-titlebar">
        <h1 class="umm-celebrities-title">收藏的影人</h1>
        <span class="umm-celebrities-count">共 {{ data.total.toLocaleString() }} 位</span>
      </div>

      <!-- Grid -->
      <div v-if="data.items.length > 0" class="umm-celebrities-grid">
        <a
          v-for="item in data.items"
          :key="item.url"
          :href="item.url"
          class="umm-celebrities-card"
          target="_blank"
        >
          <div
            class="umm-celebrities-photo"
            :style="{ backgroundImage: `url(${item.photoUrl})` }"
          />
          <div class="umm-celebrities-body">
            <span class="umm-celebrities-name">{{ item.name }}</span>
            <span v-if="item.roles" class="umm-celebrities-roles">{{ item.roles }}</span>
            <div v-if="item.works.length > 0" class="umm-celebrities-works">
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
