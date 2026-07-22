<script setup lang="ts">
// Series overlay: header info, sort options, book list with record badges, paginator
import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import type { SeriesPageData, SeriesItem } from './types'

const props = defineProps<{
  data: SeriesPageData
  recordMap?: Map<string, import('@/types').StoreRecord>
}>()

// Get full record for an item
function getItemRecord(item: SeriesItem): import('@/types').StoreRecord | undefined {
  if (!props.recordMap) return undefined
  return props.recordMap.get(item.subjectId)
}

// Star display helper (0-10 scale → 5 stars)
function starRating(rating: number): number {
  return rating / 2
}

// Star classes for display
function starClass(item: SeriesItem, starIndex: number): string {
  const stars = starRating(item.rating)
  const filled = starIndex + 1
  if (stars >= filled) return 'umm-series-item-star umm-series-item-star--filled'
  if (stars >= filled - 0.5) return 'umm-series-item-star umm-series-item-star--half'
  return 'umm-series-item-star'
}

// Format count with Chinese-friendly units
function formatCount(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + '万'
  return n.toLocaleString()
}

// Status label helper
function statusLabel(status: number): string {
  switch (status) {
    case 2: return '已读'
    case 1: return '想读'
    case 3: return '在读'
    default: return ''
  }
}
</script>

<template>
  <UmmPageLayout type="book">
    <div class="umm-series-root">
      <!-- ═══ Header section ═══ -->
      <div class="umm-series-header">
        <h1 class="umm-series-title">{{ data.title }}</h1>

        <div v-if="data.publisher" class="umm-series-meta">
          <span class="umm-series-meta-label">出版社：</span>{{ data.publisher }}
        </div>
        <div v-if="data.volumes > 0" class="umm-series-meta">
          <span class="umm-series-meta-label">册数：</span>{{ data.volumes }}
        </div>

        <p v-if="data.description" class="umm-series-desc">{{ data.description }}</p>

        <!-- Actions -->
        <div class="umm-series-actions">
          <a
            :href="`https://book.douban.com/series/collect?series_id=${data.id}`"
            class="umm-series-collect-btn"
            target="_blank"
          >收藏丛书</a>
        </div>
      </div>

      <!-- ═══ Stats bar ═══ -->
      <div class="umm-series-stats-bar">
        <span class="umm-series-stat-item">
          共 <span class="umm-series-stat-value">{{ data.totalCount }}</span> 本
        </span>
        <span v-if="data.volumes > 1" class="umm-series-stat-divider" />
        <span v-if="data.volumes > 1" class="umm-series-stat-item">
          <span class="umm-series-stat-value">{{ data.volumes }}</span> 册
        </span>
      </div>

      <!-- ═══ Sort bar ═══ -->
      <div v-if="data.sortOptions.length > 0" class="umm-series-sortbar">
        <span class="umm-series-sort-label">排序：</span>
        <a
          v-for="opt in data.sortOptions"
          :key="opt.label"
          :href="opt.url || undefined"
          :class="['umm-series-sort-link', opt.active ? 'umm-series-sort-link--active' : '']"
        >{{ opt.label }}</a>
      </div>

      <!-- ═══ Book list ═══ -->
      <div v-if="data.items.length > 0" class="umm-series-items">
        <div
          v-for="item in data.items"
          :key="item.subjectId"
          class="umm-series-item"
        >
          <div class="umm-series-item-cover">
            <a :href="item.subjectUrl" target="_blank">
              <img :src="item.coverUrl" :alt="item.title" loading="lazy" />
            </a>
          </div>
          <div class="umm-series-item-body">
            <div class="umm-series-item-title-line">
              <span
                v-if="getItemRecord(item)"
                :class="[
                  'umm-series-status',
                  getItemRecord(item)!.status === 2 ? 'umm-series-status--done' : '',
                  getItemRecord(item)!.status === 1 ? 'umm-series-status--wish' : '',
                  getItemRecord(item)!.status === 3 ? 'umm-series-status--doing' : '',
                ]"
              >{{ statusLabel(getItemRecord(item)!.status) }}</span>
              <a
                :href="item.subjectUrl"
                class="umm-series-item-title"
                target="_blank"
              >{{ item.title }}</a>
            </div>

            <div v-if="item.pubInfo" class="umm-series-item-pub">{{ item.pubInfo }}</div>

            <div v-if="item.rating > 0" class="umm-series-item-rating">
              <span class="umm-series-item-stars">
                <span
                  v-for="i in 5"
                  :key="i"
                  :class="starClass(item, i - 1)"
                />
              </span>
              <span class="umm-series-item-score">{{ item.rating }}</span>
              <span class="umm-series-item-count">({{ formatCount(item.ratingCount) }})</span>
            </div>

            <div v-if="item.description" class="umm-series-item-desc">{{ item.description }}</div>
          </div>
        </div>
      </div>
      <div v-else class="umm-series-empty">暂无内容</div>

      <!-- ═══ Paginator ═══ -->
      <div v-if="data.paginator.pages.length > 1" class="umm-series-paginator">
        <a
          v-if="data.paginator.prevUrl"
          :href="data.paginator.prevUrl"
          class="umm-series-page-btn"
        >‹</a>
        <a
          v-for="p in data.paginator.pages"
          :key="p.label"
          :href="p.url || undefined"
          :class="['umm-series-page-btn', p.current ? 'umm-series-page-btn--active' : '']"
        >{{ p.label }}</a>
        <a
          v-if="data.paginator.nextUrl"
          :href="data.paginator.nextUrl"
          class="umm-series-page-btn"
        >›</a>
      </div>
    </div>
  </UmmPageLayout>
</template>
