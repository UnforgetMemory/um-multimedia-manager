<script setup lang="ts">
import { computed } from 'vue'
import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import { UmmRating } from '@/content/douban/components/UmmRating'
import type { UserMediaPageData } from './types'
import UmmPaginator from '@/content/douban/components/UmmPaginator.vue'
import UmmUserBar from '@/content/douban/components/UmmUserBar.vue'
import { usePaginator } from '../../shared/composables/usePaginator'

const props = defineProps<{
  data: UserMediaPageData
}>()

/** Derive current page number from pageLinks */
const { currentPage, totalPages, onPageChange } = usePaginator(
  () => props.data.pageLinks,
  () => props.data.prevPageUrl,
  () => props.data.nextPageUrl,
)
const titleLabel = computed(() => {
  switch (props.data.subType) {
    case 'wish': return '想看'
    case 'doing': return '在看'
    default: return '看过'
  }
})
</script>

<template>
  <UmmPageLayout type="movie">
    <div class="umm-umedia-root">

      <UmmUserBar
        :avatar-url="data.avatarUrl"
        :display-name="data.displayName"
        :user-id="data.userId"
        :nav-links="data.navLinks"
      />

      <!-- Title Bar -->
      <div class="umm-titlebar">
        <h2 class="umm-titlebar-label">{{ titleLabel }}</h2>
        <span class="umm-titlebar-count">共 {{ data.total.toLocaleString() }} 部</span>
      </div>

      <!-- Sort & Filter Bar -->
      <div v-if="data.sortOptions.length > 0 || data.filterGroups.length > 0" class="umm-umedia-optbar">
        <div v-if="data.sortOptions.length > 0" class="umm-umedia-optgroup">
          <a
            v-for="opt in data.sortOptions"
            :key="opt.label"
            :href="opt.url || undefined"
            :class="['umm-umedia-opt', opt.active ? 'umm-umedia-opt--active' : '']"
          >{{ opt.label }}</a>
        </div>
        <div v-for="fg in data.filterGroups" :key="fg.label" class="umm-umedia-optgroup">
          <span class="umm-umedia-opt-muted">{{ fg.label }}:</span>
          <span class="umm-umedia-opt umm-umedia-opt--active">{{ fg.current }}</span>
          <a
            v-for="item in fg.items"
            :key="item.label"
            :href="item.url"
            class="umm-umedia-opt"
          >{{ item.label }}</a>
        </div>
      </div>

      <!-- Empty State -->
      <div v-if="data.total === 0 && data.items.length === 0" class="umm-umedia-empty">
        <div class="umm-umedia-empty-icon">📭</div>
        <div class="umm-umedia-empty-text">暂无内容</div>
      </div>

      <!-- Grid -->
      <div v-if="data.items.length > 0" class="umm-dash-grid">
        <a
          v-for="item in data.items"
          :key="item.subjectId"
          :href="item.url"
          class="umm-dash-card"
          target="_blank"
        >
          <span v-if="item.date" class="umm-dash-card-date">{{ item.date }}</span>
          <div
            class="umm-dash-card-cover"
            :style="{ backgroundImage: `url(${item.posterUrl})` }"
          />
          <div class="umm-dash-card-body">
            <span class="umm-dash-card-title">{{ item.title }}</span>
            <UmmRating :score="item.rating !== '0' ? (Number(item.rating) * 2).toString() : undefined" />
            <span v-if="item.comment" class="umm-dash-card-comment">{{ item.comment }}</span>
          </div>
        </a>
      </div>

      <!-- Page Info -->
      <div v-if="data.currentPage && data.total > 0" class="umm-umedia-pageinfo">
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
