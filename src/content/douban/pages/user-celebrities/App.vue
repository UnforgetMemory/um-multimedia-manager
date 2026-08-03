<script setup lang="ts">
import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import type { UserCelebritiesData } from './types'
import UmmPaginator from '@/content/douban/components/UmmPaginator.vue'
import UmmUserBar from '@/content/douban/components/UmmUserBar.vue'
import { usePaginator } from '../../shared/composables/usePaginator'

const props = defineProps<{
  data: UserCelebritiesData
}>()

const { currentPage, totalPages, onPageChange } = usePaginator(
  () => props.data.pageLinks,
  () => props.data.prevPageUrl,
  () => props.data.nextPageUrl,
)
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
      <div class="umm-titlebar">
        <h1 class="umm-titlebar-label">收藏的影人</h1>
        <span class="umm-titlebar-count">共 {{ data.total.toLocaleString() }} 位</span>
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
