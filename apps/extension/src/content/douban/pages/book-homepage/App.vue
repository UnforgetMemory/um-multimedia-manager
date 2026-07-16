<script setup lang="ts">
/**
 * Book homepage — book.douban.com/ overlay.
 *
 * Sections: 新书速递 (UmmMediaRow grid), 每月热门图书榜 (ranking list),
 * 读书活动 (activity cards). Status badges via UmmStatusBadge type="book":
 * 已读/想读/未读/在读. Record lookup via useRecordCache on douban_records store.
 *
 * Reuses UmmMediaRow/UmmStatusBadge/UmmPageLayout components from movie/music
 * homepage, with type="book" to select correct badge labels and aspect ratio.
 */
import { ref, onMounted } from 'vue'
import { useRecordCache } from '../../shared/composables/useRecordCache'
import { useDoubanSection } from '../homepage/composables/useDoubanSection'
import { usePageObserver } from '../homepage/composables/useHomepageObserver'
import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import UmmMediaRow from '../homepage/components/UmmMediaRow.vue'
import { UmmStatusBadge } from '@/content/douban/components/UmmStatusBadge'
import {
  parseBookExpress,
  parsePopularBooks,
  parseBookActivities,
} from './extractors'
import type { BookActivityItem, PopularBookItem } from './types'

const { records, load } = useRecordCache()

const { items: expressBooks, refresh: refreshExpress } = useDoubanSection(parseBookExpress, records)
const { items: popularBooks, refresh: refreshPopular } = useDoubanSection(parsePopularBooks, records)
const activities = ref<BookActivityItem[]>([])

function refreshFromDom() {
  refreshExpress()
  refreshPopular()
  const acts = parseBookActivities()
  if (acts.length > 0) activities.value = acts
}

const { start } = usePageObserver(refreshFromDom, {
  containerSelectors: '.books-express, .popular-books, .books-activities',
})

onMounted(async () => {
  await load()
  activities.value = parseBookActivities()
  start()
  setTimeout(refreshFromDom, 800)
  setTimeout(refreshFromDom, 2500)
  setTimeout(refreshFromDom, 6000)
})

function recordFor(item: { subjectId: string }) {
  const rec = records.value.get(item.subjectId)
  return { status: rec?.status ?? 0, rating: rec?.rating ?? 0 }
}

function rankClass(rank: number): string {
  if (rank <= 3) return 'umm-rank-number--top3'
  return ''
}

function trendIcon(trend: PopularBookItem['trend']): string {
  switch (trend) {
    case 'up': return '↑'
    case 'down': return '↓'
    case 'new': return 'N'
    default: return '—'
  }
}
</script>

<template>
  <UmmPageLayout type="book">
    <div class="umm-top-panel">
      <UmmMediaRow
        title="新书速递"
        :items="expressBooks"
        :records="records"
        type="book"
        grid
      />

      <div v-if="popularBooks.length > 0" class="umm-section">
        <h2 class="umm-section-hd">每月热门图书榜</h2>
        <div class="umm-ranking-list">
          <a
            v-for="book in popularBooks"
            :key="`${book.subjectId}-${recordFor(book).status}-${recordFor(book).rating}`"
            :href="book.href"
            target="_blank"
            rel="noopener noreferrer"
            class="umm-ranking-item"
          >
            <span class="umm-rank-number" :class="rankClass(book.rank)">
              {{ book.rank }}
            </span>
            <div class="umm-ranking-cover">
              <img :src="book.coverUrl" :alt="book.title" loading="lazy">
            </div>
            <div class="umm-ranking-info">
              <span class="umm-ranking-title">
                <UmmStatusBadge
                  :status="recordFor(book).status"
                  :rating="recordFor(book).rating"
                  variant="inline"
                  type="book"
                />
                {{ book.title }}
              </span>
              <span class="umm-ranking-meta">
                {{ book.author }}
                <template v-if="book.tags.length"> · {{ book.tags.join(' / ') }}</template>
                <template v-if="book.prevRank"> · {{ trendIcon(book.trend) }}{{ book.prevRank }}</template>
                <template v-else-if="book.trend === 'new'"> · 新上榜</template>
              </span>
            </div>
            <span v-if="book.rating" class="umm-ranking-rating">{{ book.rating }}</span>
          </a>
        </div>
      </div>

      <div v-if="activities.length > 0" class="umm-section">
        <h2 class="umm-section-hd">读书活动</h2>
        <div class="umm-activity-grid">
          <a
            v-for="(act, i) in activities"
            :key="i"
            :href="act.href"
            target="_blank"
            rel="noopener noreferrer"
            class="umm-activity-card"
          >
            <div
              v-if="act.coverUrl"
              class="umm-activity-bg"
              :style="{ backgroundImage: `url(${act.coverUrl})` }"
            ></div>
            <div class="umm-activity-overlay"></div>
            <div class="umm-activity-body">
              <span class="umm-activity-label">{{ act.label }}</span>
              <span class="umm-activity-title">{{ act.title }}</span>
              <span class="umm-activity-date">{{ act.date }}</span>
            </div>
          </a>
        </div>
      </div>
    </div>
  </UmmPageLayout>
</template>