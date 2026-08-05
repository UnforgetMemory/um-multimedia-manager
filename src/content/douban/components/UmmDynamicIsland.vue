<script setup lang="ts">
import { ref, nextTick, onUnmounted } from 'vue'
import { collapseInputSpaces, normalizeSearchQuery, normalizeSearchQueryLive } from '@/utils/search-normalizer'

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
const searchInputEl = ref<HTMLInputElement | null>(null)
const isSearching = ref(false)
let searchTimeout: ReturnType<typeof setTimeout> | null = null

/**
 * Debounced real-time normalization timer (see handleInput/applyLiveNormalization).
 */
let normalizeTimer: ReturnType<typeof setTimeout> | null = null
/** Cursor position captured at the last input event, restored after live normalization. */
let pendingCursor = -1
/**
 * True while an IME composition is active. Rewriting the input value or moving
 * the caret mid-composition aborts/desyncs the IME candidate session (a real
 * hazard on a Chinese-language product), so the debounced normalization is
 * suspended while composing and re-armed once composition ends.
 */
let composing: boolean = false

const catMap: Record<string, string> = { movie: '1002', music: '1003', book: '1001', game: '3114' }
const labelMap: Record<string, string> = { movie: '电影', music: '音乐', book: '图书', game: '游戏' }

function open(url: string): void {
  if (props.newTab) {
    window.open(url, '_blank', 'noopener,noreferrer')
  } else {
    location.href = url
  }
}

/**
 * Live-typing handler (fired on every keystroke):
 * 1. Collapse runs of 2+ spaces immediately so at most ONE trailing space
 *    survives while typing ("Mean Streets " stays put, "Mean Streets  "
 *    becomes "Mean Streets ") — instant, no debounce.
 * 2. Schedule the FULL debounced normalization (~400ms after typing stops).
 * L/R trimming is deliberately NOT done here — it happens on search trigger
 * (doSearch → normalizeSearchQuery) and in the live path via
 * normalizeSearchQueryLive, which preserves a single trailing space.
 */
function handleInput(): void {
  const collapsed = collapseInputSpaces(searchQuery.value)
  if (collapsed !== searchQuery.value) {
    searchQuery.value = collapsed
  }
  // Skip the debounced full normalization while an IME composition is active
  // (rewriting value mid-composition aborts the candidate session).
  if (composing) return
  // remember caret for cursor restoration after the debounced rewrite.
  // Note: read from the DOM BEFORE Vue flushes the instant collapse above, so
  // the index may reference the pre-collapse text; the clamp in restoreCursor
  // keeps end-of-input (the typing case) exact.
  pendingCursor = searchInputEl.value?.selectionStart ?? -1
  if (normalizeTimer) clearTimeout(normalizeTimer)
  normalizeTimer = setTimeout(applyLiveNormalization, 400)
}

/** Composition started — suspend the debounced normalization (see composing). */
function onCompositionStart(): void {
  composing = true
}

/** Composition ended — the final value deserves one debounced normalization. */
function onCompositionEnd(): void {
  composing = false
  pendingCursor = searchInputEl.value?.selectionStart ?? -1
  if (normalizeTimer) clearTimeout(normalizeTimer)
  normalizeTimer = setTimeout(applyLiveNormalization, 400)
}

/**
 * Debounced full normalization: dots/symbols/release-markers are collapsed
 * live ("Mean.Streets.1973.CC" → "Mean Streets 1973") while a single
 * trailing space survives. No-op on already-normalized input (idempotent),
 * so repeated runs do not churn the caret.
 */
async function applyLiveNormalization(): Promise<void> {
  normalizeTimer = null
  const raw = searchQuery.value
  const normalized = normalizeSearchQueryLive(raw)
  if (normalized !== raw) {
    searchQuery.value = normalized
    await nextTick() // let Vue flush the input value before restoring the caret
    restoreCursor()
  }
}

/** Restore the caret after a programmatic value rewrite (clamped for mid-edit). */
function restoreCursor(): void {
  const el = searchInputEl.value
  if (!el) return
  const pos = pendingCursor >= 0 ? Math.min(pendingCursor, el.value.length) : el.value.length
  el.setSelectionRange(pos, pos)
}

function doSearch(): void {
  // A submit while the previous search is still loading (800ms window) is a
  // no-op; note the pending debounce timer is left to fire harmlessly later
  // (no navigation happens on this path).
  if (isSearching.value) return
  // Flush any pending debounced normalization so the search uses the freshest
  // normalized value and the timer cannot fire mid-navigation.
  if (normalizeTimer) {
    clearTimeout(normalizeTimer)
    normalizeTimer = null
    const live = normalizeSearchQueryLive(searchQuery.value)
    if (live !== searchQuery.value) searchQuery.value = live
  }
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
  if (normalizeTimer) clearTimeout(normalizeTimer)
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
        ref="searchInputEl"
        :value="searchQuery"
        name="search_text"
        type="search"
        class="umm-island-input"
        :placeholder="type === 'game' ? '搜索游戏' : type === 'music' ? '搜索音乐、歌手、专辑' : type === 'book' ? '搜索图书、作者、出版社' : '搜索电影、电视剧、影人'"
        autocomplete="off"
        :aria-label="'搜索豆瓣' + labelMap[type]"
        @compositionstart="onCompositionStart()"
        @compositionend="onCompositionEnd()"
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
