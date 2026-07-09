<script setup lang="ts">
/**
 * Doulist Detail Page — Overlay Vue App
 *
 * Shows the doulist header info, filter tabs, item grid, and paginator.
 * Items are linked to their subject pages; watched/wish status is shown
 * via record data when available.
 */

import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import type { DoulistDetailPageData, DoulistDetailItem } from './types'

const props = defineProps<{
  data: DoulistDetailPageData
  recordMap?: Map<string, import('@/types').StoreRecord>
}>()

function setFilter(url: string) {
  window.location.href = url
}

// Get full record for an item
function getItemRecord(item: DoulistDetailItem): import('@/types').StoreRecord | undefined {
  if (!props.recordMap) return undefined
  return props.recordMap.get(item.subjectId)
}

// Star display helper (0-10 scale → 5 stars)
function starRating(rating: number): number {
  return rating / 2  // 0-10 → 0-5
}

// Star classes for display
function starClass(item: DoulistDetailItem, starIndex: number): string {
  const stars = starRating(item.rating)
  const filled = starIndex + 1
  if (stars >= filled) return 'umm-dlist-item-star umm-dlist-item-star--filled'
  if (stars >= filled - 0.5) return 'umm-dlist-item-star umm-dlist-item-star--half'
  return 'umm-dlist-item-star'
}

// Format count
function formatCount(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + '万'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return n.toString()
}
</script>

<template>
  <UmmPageLayout type="movie">
    <div class="umm-dlist-root">
      <div class="umm-dlist-layout">
        <!-- Cover column -->
        <div class="umm-dlist-cover-col">
          <div v-if="data.coverUrl" class="umm-dlist-cover">
            <img :src="data.coverUrl" :alt="data.title" loading="lazy" />
          </div>
        </div>

        <!-- Info column — vertical sandwich -->
        <div class="umm-dlist-info-col">
          <!-- Top: header info -->
          <div class="umm-dlist-info-top">
            <h1 class="umm-dlist-title">{{ data.title }}</h1>
            <div class="umm-dlist-creator">
              <div v-if="data.creator.avatarUrl" class="umm-dlist-avatar">
                <img :src="data.creator.avatarUrl" :alt="data.creator.name" loading="lazy" />
              </div>
              <a
                :href="`https://www.douban.com/people/${data.creator.id}/`"
                class="umm-dlist-creator-name"
                target="_blank"
              >{{ data.creator.name }}</a>
              <span v-if="data.creator.location" class="umm-dlist-creator-location">{{ data.creator.location }}</span>
            </div>
            <div class="umm-dlist-times">
              <span v-if="data.createdTime">创建 {{ data.createdTime }}</span>
              <span v-if="data.updatedTime">更新 {{ data.updatedTime }}</span>
            </div>
            <p v-if="data.description" class="umm-dlist-desc">{{ data.description }}</p>
          </div>

          <!-- Middle: stats, filters, items -->
          <div class="umm-dlist-info-mid">
            <div class="umm-dlist-stats-bar">
              <span class="umm-dlist-stat-item">
                共 <span class="umm-dlist-stat-value">{{ data.totalCount }}</span> 项
              </span>
              <span class="umm-dlist-stat-divider" />
              <span class="umm-dlist-stat-item">
                本页 <span class="umm-dlist-stat-value">{{ data.items.length }}</span> 项
              </span>
            </div>

            <div v-if="data.filters.length > 0" class="umm-dlist-filters">
              <button
                v-for="f in data.filters"
                :key="f.url"
                :class="['umm-dlist-filter-btn', f.active ? 'umm-dlist-filter-btn--active' : '']"
                @click="setFilter(f.url)"
              >{{ f.label }}<template v-if="f.count > 0"> ({{ f.count }})</template></button>
            </div>

            <div v-if="data.items.length > 0" class="umm-dlist-items">
              <div
                v-for="item in data.items"
                :key="item.subjectId"
                class="umm-dlist-item"
              >
                <div class="umm-dlist-item-poster">
                  <a :href="item.subjectUrl" target="_blank">
                    <img :src="item.posterUrl" :alt="item.title" loading="lazy" />
                  </a>
                </div>
                <div class="umm-dlist-item-body">
                  <template v-if="getItemRecord(item)">
                    <span
                      v-if="getItemRecord(item)!.status === 2"
                      class="umm-status umm-status--inline umm-status--done"
                    >{{ getItemRecord(item)!.rating && getItemRecord(item)!.rating > 0 ? `已看 ${getItemRecord(item)!.rating}` : '已看' }}</span>
                    <span
                      v-else-if="getItemRecord(item)!.status === 1"
                      class="umm-status umm-status--inline umm-status--wish"
                    >想看</span>
                  </template>

                  <a
                    :href="item.subjectUrl"
                    class="umm-dlist-item-title"
                    target="_blank"
                  >{{ item.title }}</a>

                  <div v-if="item.rating > 0" class="umm-dlist-item-rating">
                    <span class="umm-dlist-item-stars">
                      <span
                        v-for="i in 5"
                        :key="i"
                        :class="starClass(item, i - 1)"
                      />
                    </span>
                    <span class="umm-dlist-item-score">{{ item.rating }}</span>
                    <span class="umm-dlist-item-count">({{ formatCount(item.ratingCount) }})</span>
                  </div>

                  <div class="umm-dlist-item-meta">
                    <template v-if="item.director">导演: {{ item.director }}<br /></template>
                    <template v-if="item.actors">主演: {{ item.actors }}<br /></template>
                    <template v-if="item.genres">{{ item.genres }}<br /></template>
                    <template v-if="item.region || item.year">{{ [item.region, item.year].filter(Boolean).join(' · ') }}</template>
                  </div>
                </div>
              </div>
            </div>
            <div v-else class="umm-dlist-empty">暂无内容</div>
          </div>

          <!-- Bottom: paginator -->
          <div v-if="data.paginator.pages.length > 1" class="umm-dlist-info-bot">
            <div class="umm-dlist-paginator">
              <a
                v-if="data.paginator.prevUrl"
                :href="data.paginator.prevUrl"
                class="umm-dlist-page-btn"
              >‹</a>
              <a
                v-for="p in data.paginator.pages"
                :key="p.label"
                :href="p.url || undefined"
                :class="['umm-dlist-page-btn', p.current ? 'umm-dlist-page-btn--active' : '']"
              >{{ p.label }}</a>
              <a
                v-if="data.paginator.nextUrl"
                :href="data.paginator.nextUrl"
                class="umm-dlist-page-btn"
              >›</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  </UmmPageLayout>
</template>
