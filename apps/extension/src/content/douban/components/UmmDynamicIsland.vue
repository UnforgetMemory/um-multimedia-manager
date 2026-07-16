<script setup lang="ts">
import { ref, onUnmounted } from 'vue'
import { normalizeSearchQuery } from '@/utils/search-normalizer'

/**
 * Unified search & navigation bar for all Douban pages.
 * Replaces per-page inline search implementations.
 *
 * @prop newTab - Open links in new tab (default true). Search page uses false.
 * @prop type   - Search category 'movie' | 'music' (default 'movie').
 * @prop initialQuery - Pre-fill search input text.
 */

const props = withDefaults(defineProps<{
  /** Open links in new tab (default: true). Search page uses false */
  newTab?: boolean
  /** Search category type */
  type?: 'movie' | 'music' | 'book' | 'game'
  /** Pre-fill search input */
  initialQuery?: string
}>(), {
  newTab: true,
  type: 'movie',
  initialQuery: '',
})

const searchQuery = ref(props.initialQuery)
const isSearching = ref(false)
let searchTimeout: ReturnType<typeof setTimeout> | null = null

const catMap: Record<string, string> = { movie: '1002', music: '1003', book: '1001', game: '3114' }
const labelMap: Record<string, string> = { movie: '电影', music: '音乐', book: '图书', game: '游戏' }

function open(url: string): void {
  if (props.newTab) {
    window.open(url, '_blank', 'noopener,noreferrer')
  } else {
    location.href = url
  }
}

/** Debounced real-time normalization */
let isNormalizing = false
function handleInput(): void {
  if (isNormalizing) return
  isNormalizing = true
  const raw = searchQuery.value
  const normalized = normalizeSearchQuery(raw)
  if (normalized !== raw) {
    searchQuery.value = normalized
  }
  setTimeout(() => { isNormalizing = false }, 0)
}

function doSearch(): void {
  if (isSearching.value) return
  const normalized = normalizeSearchQuery(searchQuery.value)

  // Game search: always navigates, even with empty query (shows all games)
  if (props.type === 'game') {
    isSearching.value = true
    const params = new URLSearchParams(location.search)
    params.set('q', normalized)
    location.href = `https://www.douban.com/game/explore?${params.toString()}`
    searchTimeout = setTimeout(() => { isSearching.value = false }, 800)
    return
  }

  if (!normalized) return
  isSearching.value = true
  const cat = catMap[props.type]
  let url = `https://search.douban.com/${props.type}/subject_search?search_text=${encodeURIComponent(normalized)}&cat=${cat}`
  open(url)
  searchTimeout = setTimeout(() => { isSearching.value = false }, 800)
}

function handleSearch(e: Event): void {
  e.preventDefault()
  doSearch()
}

onUnmounted(() => {
  if (searchTimeout) clearTimeout(searchTimeout)
})
</script>

<template>
  <form class="umm-island" @submit.prevent="handleSearch">
    <nav class="umm-island-nav" aria-label="豆瓣导航">
      <button
        type="button"
        class="umm-island-nav-link"
        :class="{ 'umm-island-nav-link--active': type === 'movie' }"
        aria-label="电影"
        @click="open('https://movie.douban.com/')"
      >
        <svg class="umm-island-nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z"></path>
        </svg>
        <span class="umm-island-nav-label">电影</span>
      </button>
      <button
        type="button"
        class="umm-island-nav-link"
        :class="{ 'umm-island-nav-link--active': type === 'music' }"
        aria-label="音乐"
        @click="open('https://music.douban.com/')"
      >
        <svg class="umm-island-nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z"></path>
        </svg>
        <span class="umm-island-nav-label">音乐</span>
      </button>
      <button
        type="button"
        class="umm-island-nav-link"
        :class="{ 'umm-island-nav-link--active': type === 'book' }"
        aria-label="图书"
        @click="open('https://book.douban.com/')"
      >
        <svg class="umm-island-nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
          <path d="M8 7h8M8 11h6"></path>
        </svg>
        <span class="umm-island-nav-label">图书</span>
      </button>
      <button
        type="button"
        class="umm-island-nav-link"
        :class="{ 'umm-island-nav-link--active': type === 'game' }"
        aria-label="游戏"
        @click="open('https://www.douban.com/game/explore')"
      >
        <svg class="umm-island-nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M6 12h4m-2-2v4m4-2a2 2 0 1 0 4 0 2 2 0 0 0-4 0Z"></path>
          <rect x="2" y="6" width="20" height="12" rx="2"></rect>
        </svg>
        <span class="umm-island-nav-label">游戏</span>
      </button>
      <div class="umm-island-divider"></div>
      <button
        type="button"
        class="umm-island-nav-link"
        aria-label="我的"
        @click="open('https://www.douban.com/mine')"
      >
        <svg class="umm-island-nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
        </svg>
        <span class="umm-island-nav-label">我的</span>
      </button>
    </nav>
    <div class="umm-island-divider"></div>
    <div class="umm-island-search">
      <input
        :value="searchQuery"
        name="search_text"
        type="search"
        class="umm-island-input"
        :placeholder="type === 'game' ? '搜索游戏' : type === 'music' ? '搜索音乐、歌手、专辑' : type === 'book' ? '搜索图书、作者、出版社' : '搜索电影、电视剧、影人'"
        autocomplete="off"
        :aria-label="'搜索豆瓣' + labelMap[type]"
        @input="searchQuery = ($event.target as HTMLInputElement).value; handleInput()"
      />
      <button
        type="submit"
        class="umm-island-submit"
        :class="{ 'umm-island-submit--loading': isSearching }"
        aria-label="搜索"
        :disabled="isSearching"
      >
        <svg v-if="!isSearching" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <svg v-else class="umm-island-spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <path d="M12 2a10 10 0 0 1 10 10" />
        </svg>
      </button>
    </div>
  </form>
</template>
