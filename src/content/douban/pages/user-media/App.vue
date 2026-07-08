<script setup lang="ts">
import { computed } from 'vue'
import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import { UmmRating } from '@/content/douban/components/UmmRating'
import type { UserMediaPageData } from './types'

const props = defineProps<{
  data: UserMediaPageData
}>()

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

      <!-- User Profile Bar -->
      <div v-if="data.displayName" class="umm-umedia-userbar">
        <div
          v-if="data.avatarUrl"
          class="umm-umedia-userbar-avatar"
          :style="{ backgroundImage: `url(${data.avatarUrl})` }"
        />
        <div class="umm-umedia-userbar-info">
          <a :href="`/people/${data.userId}/`" class="umm-umedia-userbar-name" target="_blank">{{ data.displayName }}</a>
          <div v-if="data.navLinks.length > 0" class="umm-umedia-userbar-nav">
            <a
              v-for="link in data.navLinks"
              :key="link.url"
              :href="link.url"
              class="umm-umedia-userbar-link"
              target="_blank"
            >{{ link.label }}</a>
          </div>
        </div>
      </div>

      <!-- Title Bar -->
      <div class="umm-umedia-titlebar">
        <h2 class="umm-umedia-titlebar-label">{{ titleLabel }}</h2>
        <span class="umm-umedia-titlebar-count">共 {{ data.total.toLocaleString() }} 部</span>
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
      <div v-if="data.pageLinks.length > 0" class="umm-umedia-paginator">
        <a
          v-if="data.prevPageUrl"
          :href="data.prevPageUrl"
          class="umm-umedia-page"
        >‹</a>
        <a
          v-for="pl in data.pageLinks"
          :key="pl.label"
          :href="pl.url || undefined"
          :class="['umm-umedia-page', pl.current ? 'umm-umedia-page--active' : '']"
        >{{ pl.label }}</a>
        <a
          v-if="data.nextPageUrl"
          :href="data.nextPageUrl"
          class="umm-umedia-page"
        >›</a>
      </div>
    </div>
  </UmmPageLayout>
</template>
