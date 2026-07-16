<script setup lang="ts">
import type { DoubanSearchData, SearchItem } from './types'
import type { StoreRecord } from '@/types'
import { computed, ref } from 'vue'
import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import UmmSearchCard from './components/UmmSearchCard.vue'
import UmmSearchFilter, { type FilterType } from './components/UmmSearchFilter.vue'

const props = defineProps<{
  searchData?: DoubanSearchData
  recordMap?: Map<string, StoreRecord>
  type: 'movie' | 'music' | 'book'
}>()

const cat = props.type === 'book' ? '1001' : props.type === 'music' ? '1003' : '1002'

const perPage = computed(() => props.searchData?.count || 15)
const totalPages = computed(() => props.searchData ? Math.ceil(props.searchData.total / perPage.value) : 0)
const currentPage = computed(() => props.searchData ? Math.floor((props.searchData.start || 0) / perPage.value) + 1 : 1)

const jumpToPage = ref<number | null>(null)
const filterType = ref<FilterType>('all')

/** TV detection: check if item has a "剧集" label from Douban's own metadata */
function isTvItem(item: SearchItem): boolean {
  return item.labels?.some(l => l.text === '剧集') ?? false
}

const filteredItems = computed(() => {
  if (!props.searchData?.items || filterType.value === 'all') return props.searchData?.items ?? []
  const wantTv = filterType.value === 'tv'
  return props.searchData.items.filter(i => isTvItem(i) === wantTv)
})

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

function pageUrl(page: number): string {
  const q = encodeURIComponent(props.searchData?.text || '')
  const start = page ? (page - 1) * perPage.value : 0
  return `https://search.douban.com/${props.type}/subject_search?search_text=${q}&cat=${cat}${start > 0 ? `&start=${start}` : ''}`
}

function navigate(url: string): void {
  location.href = url
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
</script>

<template>
  <UmmPageLayout :newTab="false" :type="type" :initialQuery="searchData?.text || ''">
    <div class="umm-search-page">

    <UmmSearchFilter
      v-if="searchData && type === 'movie'"
      v-model="filterType"
      :total="searchData.total"
      :filtered="filteredItems.length"
      :query="searchData.text"
    />

    <div v-else-if="searchData" class="umm-search-hd">
      <div class="umm-search-hd-left">
        <h1 class="umm-search-title">{{ type === 'music' ? '音乐搜索' : type === 'book' ? '图书搜索' : '搜索结果' }}</h1>
      </div>
      <span class="umm-search-hd-meta">
        "{{ searchData.text }}" · {{ searchData.total }} 个结果
      </span>
    </div>

    <div v-if="filteredItems.length > 0" class="umm-search-grid">
      <UmmSearchCard
        v-for="item in filteredItems"
        :key="item.id"
        :item="item"
        :records="recordMap || new Map()"
        :type="type"
      />
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
  </UmmPageLayout>
</template>