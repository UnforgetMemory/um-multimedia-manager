<script setup lang="ts">
import type { GameExploreData, GameExploreItem } from './types'
import type { StoreRecord } from '@/types'
import { computed, ref, onMounted } from 'vue'
import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import { UmmStatusBadgeWrapper } from '@/content/douban/components/UmmStatusBadgeWrapper'

const props = defineProps<{
  exploreData?: GameExploreData
  recordMap?: Map<string, StoreRecord>
}>()

const data = computed(() => props.exploreData)

const allItems = ref<GameExploreItem[]>([])
const moreCursor = ref(0)
const totalCount = ref(0)
const loading = ref(false)
const hasMore = ref(false)

onMounted(() => {
  allItems.value = data.value?.items ?? []
  moreCursor.value = 2
  totalCount.value = 0
  const initialLen = data.value?.items?.length ?? 0
  if (initialLen > 0) totalCount.value = initialLen
  hasMore.value = initialLen > 0
})

const keyword = computed(() => data.value?.searcher?.keyword ?? '')
const filters = computed(() => data.value?.filters ?? [])

function getRecordStatus(id: number): number {
  return props.recordMap?.get(String(id))?.status ?? 0
}

function getRecordRating(id: number): number {
  return props.recordMap?.get(String(id))?.rating ?? 0
}

async function fetchMoreGames(): Promise<void> {
  if (loading.value || !hasMore.value) return
  loading.value = true
  try {
    const params = new URLSearchParams(location.search)
    params.set('more', String(moreCursor.value))
    const resp = await fetch(`/j/ilmen/game/search?${params.toString()}`, {
      credentials: 'include',
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const json = await resp.json() as {
      games: Array<Record<string, unknown>>
      total: number
      more: number
    }

    const newGames: GameExploreItem[] = (json.games || []).map((r) => ({
      id: parseInt(String(r['id'] || '0'), 10),
      title: String(r['title'] || ''),
      url: String(r['url'] || ''),
      rating: String(r['rating'] || ''),
      star: String(r['star'] || ''),
      cover: String(r['cover'] || ''),
      genres: (String(r['genres'] || '')).split(' / ').filter(Boolean),
      platforms: (String(r['platforms'] || '')).split(' / ').filter(Boolean),
      review: r['review']
        ? { content: String((r['review'] as Record<string, unknown>)['content'] || ''), author: String((r['review'] as Record<string, unknown>)['author'] || '') }
        : null,
      nRatings: parseInt(String(r['n_ratings'] || '0'), 10),
    }))

    allItems.value = [...allItems.value, ...newGames]
    moreCursor.value = json.more
    totalCount.value = json.total
    hasMore.value = json.more > 0
  } catch (err) {
    console.warn('[UMM] Failed to load more games:', err)
  } finally {
    loading.value = false
  }
}

/** Build filter URL: start from current URL params, toggle only the clicked option */
function buildFilterUrl(
  groupName: string,
  optionValue: string,
  isUnique: boolean,
): string {
  const params = new URLSearchParams(location.search)

  if (isUnique) {
    params.set(groupName, '')
  } else {
    const current = params.get(groupName) || ''
    const vals = current ? current.split(',').filter(Boolean) : []
    const idx = vals.indexOf(optionValue)
    if (idx >= 0) {
      vals.splice(idx, 1)
    } else {
      vals.push(optionValue)
    }
    params.set(groupName, vals.join(','))
  }

  return `/game/explore?${params.toString()}`
}

function navigate(url: string): void {
  location.href = url
}

function buildSortUrl(sortValue: string): string {
  const params = new URLSearchParams(location.search)
  params.set('sort', sortValue)
  return `/game/explore?${params.toString()}`
}

const currentSort = computed(() => {
  const params = new URLSearchParams(location.search)
  return params.get('sort') || 'rating'
})

/** Read initial search query directly from URL — more reliable than data extraction */
const initialQuery = computed(() => {
  const params = new URLSearchParams(location.search)
  return params.get('q') || ''
})
</script>

<template>
  <UmmPageLayout type="game" :new-tab="false" :initial-query="initialQuery">
    <div class="umm-game-explore-page">
      <div class="umm-game-explore-hd">
        <h1 class="umm-game-explore-title">发现感兴趣的游戏</h1>
        <span v-if="keyword" class="umm-game-explore-meta">
          "{{ keyword }}" · {{ totalCount }} 个结果
        </span>
      </div>

      <!-- Filter bar -->
      <div v-if="filters.length" class="umm-game-filter-bar">
        <div
          v-for="group in filters"
          :key="group.name"
          class="umm-game-filter-group"
        >
          <span class="umm-game-filter-label">{{ group.text }}</span>
          <div class="umm-game-filter-options">
            <button
              v-for="opt in group.options"
              :key="opt.value"
              class="umm-game-filter-chip"
              :class="{ 'umm-game-filter-chip--active': opt.checked }"
              @click="navigate(buildFilterUrl(group.name, opt.value, opt.unique))"
            >
              {{ opt.text }}
            </button>
          </div>
        </div>
      </div>

      <!-- Sort bar -->
      <div class="umm-game-sort-bar">
        <span class="umm-game-sort-label">排序：</span>
        <button
          class="umm-game-sort-btn"
          :class="{ 'umm-game-sort-btn--active': currentSort === 'rating' }"
          @click="navigate(buildSortUrl('rating'))"
        >评分</button>
        <button
          class="umm-game-sort-btn"
          :class="{ 'umm-game-sort-btn--active': currentSort === 'original_release_date' }"
          @click="navigate(buildSortUrl('original_release_date'))"
        >按时间排序</button>
      </div>

      <!-- Game list (single column) -->
      <div v-if="allItems.length > 0" class="umm-game-list">
        <a
          v-for="item in allItems"
          :key="item.id"
          :href="item.url"
          target="_blank"
          rel="noopener noreferrer"
          class="umm-game-list-item"
        >
          <div v-if="item.cover" class="umm-game-item-poster">
            <img :src="item.cover" :alt="item.title" loading="lazy" />
          </div>
          <div class="umm-game-item-body">
            <div class="umm-game-item-title-row">
              <span class="umm-game-item-title">{{ item.title }}</span>
              <UmmStatusBadgeWrapper
                :status="getRecordStatus(item.id)"
                :rating="getRecordRating(item.id)"
                variant="small"
                type="game"
              />
            </div>
            <div v-if="item.genres.length || item.platforms.length" class="umm-game-item-meta">
              <span v-for="g in item.genres" :key="g" class="umm-game-chip">{{ g }}</span>
              <span v-for="p in item.platforms" :key="p" class="umm-game-chip">{{ p }}</span>
            </div>
            <div class="umm-game-item-rating">
              <span v-if="item.rating" class="umm-game-item-rating-num">{{ item.rating }}</span>
              <span v-if="item.nRatings > 0" class="umm-game-item-rating-people">{{ item.nRatings }}人评价</span>
            </div>
            <div v-if="item.review" class="umm-game-item-review">
              “{{ item.review.content }}”
              <span v-if="item.review.author" class="umm-game-item-review-author">--{{ item.review.author }}</span>
            </div>
          </div>
        </a>
      </div>

      <!-- Load more -->
      <div v-if="allItems.length > 0" class="umm-game-load-more">
        <button
          v-if="hasMore"
          class="umm-game-load-btn"
          :class="{ 'umm-game-load-btn--loading': loading }"
          :disabled="loading"
          @click="fetchMoreGames"
        >
          <span v-if="loading">加载中…</span>
          <span v-else>加载更多（共 {{ totalCount }} 个结果）</span>
        </button>
        <span v-else class="umm-game-load-end">已加载全部 {{ totalCount }} 个结果</span>
      </div>

      <div v-else class="umm-game-explore-empty">
        <p>无法获取游戏列表数据。</p>
      </div>
    </div>
  </UmmPageLayout>
</template>