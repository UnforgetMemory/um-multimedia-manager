<script setup lang="ts">
import type { DoubanSearchData } from './types'
import type { StoreRecord } from '@/types'
import { normalizeSearchQuery } from '@/utils/search-normalizer'
import { computed, ref, onUnmounted, defineComponent, h } from 'vue'
import { UmmImage } from '@/entrypoints/content/shared/components/UmmImage'
import { UmmStatusBadge } from '@/entrypoints/content/shared/components/UmmStatusBadge'

const props = defineProps<{
  searchData?: DoubanSearchData
  recordMap?: Map<string, StoreRecord>
}>()

const isMusic = location.href.includes('search.douban.com/music')
const type = isMusic ? 'music' : 'movie'
const cat = isMusic ? '1003' : '1002'
const placeholder = isMusic ? '搜索音乐、歌手、专辑' : '搜索电影、电视剧、影人'

const perPage = computed(() => props.searchData?.count || 15)
const totalPages = computed(() => props.searchData ? Math.ceil(props.searchData.total / perPage.value) : 0)
const currentPage = computed(() => props.searchData ? Math.floor((props.searchData.start || 0) / perPage.value) + 1 : 1)

const searchText = ref(props.searchData?.text || '')
const isSearching = ref(false)
const jumpToPage = ref<number | null>(null)
let isNormalizing = false

const UmmImageWrapper = defineComponent({
  props: ['src', 'alt', 'class', 'aspectRatio', 'eager', 'href'],
  setup(props) {
    return () => h(UmmImage, props)
  }
})

const UmmStatusBadgeWrapper = defineComponent({
  props: ['status', 'rating', 'variant'],
  setup(props) {
    return () => h(UmmStatusBadge, props)
  }
})
let searchTimeout: ReturnType<typeof setTimeout> | null = null

const pageWindow = computed(() => {
  const tp = totalPages.value
  const cp = currentPage.value
  const maxShow = 9
  if (tp <= maxShow) return Array.from({ length: tp }, (_, i) => i + 1)
  let start = Math.max(1, cp - 4)
  let end = start + maxShow - 1
  if (end > tp) {
    end = tp
    start = Math.max(1, end - maxShow + 1)
  }
  return Array.from({ length: end - start + 1 }, (_, i) => start + i)
})

function searchUrl(text: string, page?: number): string {
  const q = encodeURIComponent(normalizeSearchQuery(text))
  const start = page ? (page - 1) * perPage.value : 0
  return `https://search.douban.com/${type}/subject_search?search_text=${q}&cat=${cat}${start > 0 ? `&start=${start}` : ''}`
}

function pageUrl(page: number): string {
  return searchUrl(props.searchData?.text || '', page)
}

function navigate(url: string): void {
  location.href = url
}

function badgeFor(item: { id: number }): { status: 'done' | 'none'; rating: number } {
  const rec = props.recordMap?.get(String(item.id))
  if (rec?.status === 2) return { status: 'done', rating: rec.rating || 0 }
  return { status: 'none', rating: 0 }
}

function starString(starCount: number): string {
  return '★'.repeat(Math.floor(starCount)) + '☆'.repeat(5 - Math.floor(starCount))
}

// Debounced real-time normalization (matches UmmDynamicIsland behavior)
function handleInput(): void {
  if (isNormalizing) return
  isNormalizing = true
  const raw = searchText.value
  const normalized = normalizeSearchQuery(raw)
  if (normalized !== raw) {
    searchText.value = normalized
  }
  setTimeout(() => { isNormalizing = false }, 0)
}

function handleBlur(): void {
  searchText.value = normalizeSearchQuery(searchText.value)
}

function handleSearch(e: Event): void {
  e.preventDefault()
  if (isSearching.value) return
  const normalized = normalizeSearchQuery(searchText.value)
  if (!normalized) return
  isSearching.value = true
  location.href = searchUrl(searchText.value)
  searchTimeout = setTimeout(() => { isSearching.value = false }, 800)
}

function handlePageJump(): void {
  const p = Math.round(Number(jumpToPage.value))
  if (!Number.isFinite(p)) {
    jumpToPage.value = null
    return
  }
  const clamped = Math.max(1, Math.min(p, totalPages.value))
  jumpToPage.value = null
  if (clamped === currentPage.value) return
  navigate(pageUrl(clamped))
}

function clampJumpInput(): void {
  if (jumpToPage.value === null || jumpToPage.value === undefined) return
  const p = Math.round(Number(jumpToPage.value))
  if (!Number.isFinite(p)) { jumpToPage.value = null; return }
  jumpToPage.value = Math.max(1, Math.min(p, totalPages.value))
}

onUnmounted(() => {
  if (searchTimeout) clearTimeout(searchTimeout)
})
</script>

<template>
  <div class="umm-search-page">
    <form
      class="umm-search-bar"
      role="search"
      @submit="handleSearch"
    >
      <input
        name="search_text"
        type="search"
        class="umm-search-input"
        v-model="searchText"
        :placeholder="placeholder"
        :aria-label="'搜索豆瓣' + (isMusic ? '音乐' : '电影')"
        autocomplete="off"
        @input="handleInput"
        @blur="handleBlur"
      />
      <button
        type="submit"
        class="umm-search-btn"
        :class="{ 'umm-search-btn--loading': isSearching }"
        aria-label="搜索"
        :disabled="isSearching"
      >
        <svg v-if="!isSearching" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <svg v-else class="umm-spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <path d="M12 2a10 10 0 0 1 10 10" />
        </svg>
      </button>
    </form>

    <div class="umm-search-hd">
      <h1 class="umm-search-title">搜索结果</h1>
      <span v-if="searchData" class="umm-search-meta">
        "{{ searchData.text }}" · {{ searchData.total }} 个结果
      </span>
    </div>

    <div v-if="searchData?.items" class="umm-search-grid">
      <a
        v-for="item in searchData.items"
        :key="item.id"
        :href="item.url"
        target="_blank" rel="noopener noreferrer"
        class="umm-search-card"
      >
        <div class="umm-search-card-cover">
          <UmmImageWrapper :src="item.cover_url" :alt="item.title" aspect-ratio="2/3" />
          <span v-if="item.labels?.length" class="umm-search-label">{{ item.labels[0].text }}</span>
        </div>
        <div class="umm-search-card-body">
          <div class="umm-search-card-title-row">
            <span class="umm-search-card-title">{{ item.title }}</span>
            <UmmStatusBadgeWrapper
              :status="badgeFor(item).status === 'done' ? 2 : 0"
              :rating="badgeFor(item).rating"
              variant="small"
            />
          </div>
          <div v-if="item.rating.value > 0" class="umm-search-rating">
            <span class="umm-search-stars">{{ starString(item.rating.star_count) }}</span>
            <span class="umm-search-score">{{ item.rating.value.toFixed(1) }}</span>
            <span class="umm-search-count">({{ item.rating.count }})</span>
          </div>
          <div v-else class="umm-search-no-rating">暂无评分</div>
          <div class="umm-search-meta-line">{{ item.abstract }}</div>
          <div class="umm-search-meta-line umm-search-cast">{{ item.abstract_2 }}</div>
        </div>
      </a>
    </div>
    <div v-else class="umm-search-empty">
      <p>无法获取搜索结果数据。</p>
    </div>

    <div v-if="totalPages > 1" class="umm-paginator">
      <a
        v-if="currentPage > 1"
        :href="pageUrl(1)"
        @click.prevent="navigate(pageUrl(1))"
        class="umm-page-link"
      >首页</a>
      <a
        v-if="currentPage > 1"
        :href="pageUrl(currentPage - 1)"
        @click.prevent="navigate(pageUrl(currentPage - 1))"
        class="umm-page-link"
      >‹ 上一页</a>
      <template v-for="p in pageWindow" :key="p">
        <a
          v-if="p === currentPage"
          class="umm-page-link umm-page-link--active"
        >{{ p }}</a>
        <a
          v-else
          :href="pageUrl(p)"
          @click.prevent="navigate(pageUrl(p))"
          class="umm-page-link"
        >{{ p }}</a>
      </template>
      <a
        v-if="currentPage < totalPages"
        :href="pageUrl(currentPage + 1)"
        @click.prevent="navigate(pageUrl(currentPage + 1))"
        class="umm-page-link"
      >下一页 ›</a>
      <a
        v-if="currentPage < totalPages"
        :href="pageUrl(totalPages)"
        @click.prevent="navigate(pageUrl(totalPages))"
        class="umm-page-link"
      >末页</a>
      <span class="umm-page-jump">
        <input
          type="number"
          class="umm-page-input"
          :placeholder="currentPage.toString()"
          :min="1"
          :max="totalPages"
          :title="'1～' + totalPages"
          @keyup.enter="handlePageJump"
          @blur="clampJumpInput"
          v-model.number="jumpToPage"
        />
        <button class="umm-page-go" @click="handlePageJump">跳转</button>
      </span>
    </div>
  </div>
</template>