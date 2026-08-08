<script setup lang="ts">
import { computed } from 'vue'
import { collectTitleLabel } from '../../shared/collect-title-label';
import { statusBadgeLabels } from '../../shared/status-labels'
import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import type { BookCollectData } from './types'
import UmmPaginator from '@/content/douban/components/UmmPaginator.vue'
import UmmUserBar from '@/content/douban/components/UmmUserBar.vue'
import { usePaginator } from '../../shared/composables/usePaginator'

const props = defineProps<{
  data: BookCollectData
}>()

/** Derive the current page number from .thispage paginator label */
const { currentPage, totalPages, onPageChange } = usePaginator(
  () => props.data.pageLinks,
  () => props.data.prevPageUrl,
  () => props.data.nextPageUrl,
)
/** Human-readable tab label for the current collection sub-type */
const titleLabel = computed(() => collectTitleLabel(statusBadgeLabels.book, props.data.subType, 'doing'))
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
      <div class="umm-titlebar">
        <h2 class="umm-titlebar-label">{{ titleLabel }}</h2>
        <span class="umm-titlebar-count">共 {{ data.total.toLocaleString() }} 本</span>
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
