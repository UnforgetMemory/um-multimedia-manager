<script setup lang="ts">
import { ref, onUnmounted } from 'vue'

const searchQuery = ref('')
const isSearching = ref(false)
let searchTimeout: ReturnType<typeof setTimeout> | null = null

interface NavItem {
  label: string
  href: string
  icon: string
  active?: boolean
}

const navItems: NavItem[] = [
  { label: '电影', href: 'https://movie.douban.com/', icon: 'M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z', active: true },
  { label: '音乐', href: 'https://music.douban.com/', icon: 'M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z' },
  { label: '我的', href: 'https://www.douban.com/mine', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
]

/**
 * Normalize search query for Douban search.
 *
 * Handles professional resource naming patterns:
 * - "The.Great.Escaper.2023.1080p.BluRay.AVC.DTS-HD.MA.5.1-DIY@Audies"
 *   → "The Great Escaper 2023"
 * - "记忆碎片[2000].Memento.1080p.BluRay.x264"
 *   → "记忆碎片 Memento 2000"
 *
 * Strategy: keep only title + year(s), strip everything after the LAST year.
 * If two years exist, use the second year as the cutoff point.
 */
function normalizeSearchQuery(raw: string): string {
  let s = raw
    .replace(/\./g, ' ')
    .replace(/[[\]()【】「」『』〈〉《》]/g, ' ')
    .replace(/[*#@!~`%^&+=|\\{}:;"'<>,?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // Find all 4-digit years (1900-2099)
  const yearMatches = [...s.matchAll(/\b(19\d{2}|20\d{2})\b/g)]

  if (yearMatches.length >= 2) {
    // Two years found: keep everything up to the SECOND year
    const secondYearEnd = yearMatches[1].index! + 4
    s = s.slice(0, secondYearEnd).trim()
  } else if (yearMatches.length === 1) {
    // One year found: keep everything up to that year
    const yearEnd = yearMatches[0].index! + 4
    s = s.slice(0, yearEnd).trim()
  }

  return s
}

/**
 * Debounced real-time normalization.
 * Updates the input value without triggering infinite re-normalization.
 */
let isNormalizing = false

function handleInput(): void {
  if (isNormalizing) return
  isNormalizing = true

  const raw = searchQuery.value
  const normalized = normalizeSearchQuery(raw)

  if (normalized !== raw) {
    searchQuery.value = normalized
  }

  // Reset flag after Vue's reactivity cycle
  setTimeout(() => { isNormalizing = false }, 0)
}

function openInNewTab(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer')
}

function handleNavClick(href: string): void {
  openInNewTab(href)
}

function handleSearch(e: Event): void {
  e.preventDefault()
  if (isSearching.value) return

  const normalized = normalizeSearchQuery(searchQuery.value)
  if (!normalized) return

  isSearching.value = true

  const searchUrl = `https://search.douban.com/movie/subject_search?search_text=${encodeURIComponent(normalized)}&cat=1002`
  openInNewTab(searchUrl)

  // Reset loading state after animation
  searchTimeout = setTimeout(() => {
    isSearching.value = false
  }, 800)
}

onUnmounted(() => {
  if (searchTimeout) clearTimeout(searchTimeout)
})
</script>

<template>
  <form class="umm-island" @submit.prevent="handleSearch">
    <nav class="umm-island-nav" aria-label="豆瓣导航">
      <button
        v-for="item in navItems"
        :key="item.label"
        type="button"
        class="umm-island-nav-link"
        :class="{ 'umm-island-nav-link--active': item.active }"
        :aria-label="item.label"
        @click="handleNavClick(item.href)"
      >
        <svg class="umm-island-nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path :d="item.icon"></path>
        </svg>
        <span class="umm-island-nav-label">{{ item.label }}</span>
      </button>
    </nav>
    <div class="umm-island-divider"></div>
    <div class="umm-island-search">
      <input
        :value="searchQuery"
        name="search_text"
        type="search"
        class="umm-island-input"
        placeholder="搜索电影、电视剧、影人"
        autocomplete="off"
        aria-label="搜索豆瓣电影"
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

<style scoped>
.umm-island {
  display: flex;
  align-items: center;
  gap: 0;
  max-width: 680px;
  margin: 0 auto var(--umm-space-lg, 16px);
  padding: 0 var(--umm-space-md, 12px);
  background: var(--umm-island-bg, rgba(255, 255, 255, 0.92));
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border-radius: 999px;
  border: 1px solid var(--umm-island-border, rgba(0, 0, 0, 0.06));
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04),
              0 4px 12px rgba(0, 0, 0, 0.03);
  height: clamp(42px, 5vw, 50px);
  transition: box-shadow 0.35s cubic-bezier(0.4, 0, 0.2, 1),
              transform 0.35s cubic-bezier(0.4, 0, 0.2, 1),
              border-color 0.35s ease;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  position: relative;
  z-index: 10000;
  cursor: default;
}

.umm-island:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06),
              0 8px 24px rgba(0, 0, 0, 0.06);
  border-color: var(--umm-island-border-hover, rgba(0, 0, 0, 0.1));
  transform: translateY(-1px);
}

.umm-island:focus-within {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06),
              0 8px 24px rgba(0, 0, 0, 0.08);
  border-color: var(--umm-island-border-focus, rgba(59, 130, 246, 0.3));
  transform: translateY(-1px);
}

/* Navigation links */
.umm-island-nav {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px 0;
  flex-shrink: 0;
}

.umm-island-nav-link {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 10px;
  border-radius: 999px;
  text-decoration: none;
  color: var(--umm-island-text-secondary, #666);
  font-size: clamp(12px, 1.8vw, 14px);
  font-weight: 500;
  transition: all 0.2s ease;
  white-space: nowrap;
  cursor: pointer;
  background: transparent;
  border: none;
  font-family: inherit;
}

.umm-island-nav-link:hover {
  background: var(--umm-island-hover-bg, rgba(0, 0, 0, 0.05));
  color: var(--umm-island-text-primary, #333);
}

.umm-island-nav-link--active {
  background: var(--umm-island-active-bg, rgba(0, 0, 0, 0.06));
  color: var(--umm-island-text-primary, #1a1a1a);
  font-weight: 600;
}

.umm-island-nav-svg {
  width: clamp(14px, 2vw, 16px);
  height: clamp(14px, 2vw, 16px);
  flex-shrink: 0;
}

.umm-island-nav-label {
  line-height: 1;
}

/* Divider */
.umm-island-divider {
  width: 1px;
  height: 18px;
  background: var(--umm-island-divider, rgba(0, 0, 0, 0.08));
  margin: 0 8px;
  flex-shrink: 0;
}

/* Search area */
.umm-island-search {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  gap: 4px;
}

.umm-island-input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  font-size: clamp(13px, 2vw, 15px);
  color: var(--umm-island-text-primary, #1a1a1a);
  outline: none;
  padding: 6px 8px;
  font-family: inherit;
}

.umm-island-input::placeholder {
  color: var(--umm-island-text-muted, #aaa);
}

.umm-island-submit {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--umm-island-text-secondary, #666);
  cursor: pointer;
  border-radius: 50%;
  transition: all 0.25s ease;
  flex-shrink: 0;
}

.umm-island-submit:hover:not(:disabled) {
  background: var(--umm-island-hover-bg, rgba(0, 0, 0, 0.05));
  color: var(--umm-island-text-primary, #333);
}

.umm-island-submit:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.umm-island-submit--loading {
  animation: umm-pulse 0.8s ease-in-out infinite;
}

.umm-island-spinner {
  animation: umm-spin 0.75s linear infinite;
}

@keyframes umm-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes umm-pulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}

/* Responsive: mobile — hide labels, show icons only */
@media (max-width: 480px) {
  .umm-island {
    max-width: 100%;
    margin: 0 12px var(--umm-space-md, 12px);
    border-radius: 16px;
    padding: 0 10px;
  }

  .umm-island-nav-label {
    display: none;
  }

  .umm-island-nav-link {
    padding: 6px 8px;
  }

  .umm-island-divider {
    margin: 0 4px;
  }

  .umm-island-input {
    font-size: 14px;
  }
}

/* Responsive: very small screens — full bleed */
@media (max-width: 374px) {
  .umm-island {
    margin: 0 6px 8px;
    border-radius: 12px;
    height: 38px;
  }
}

/* Responsive: large screens — wider island */
@media (min-width: 1280px) {
  .umm-island {
    max-width: 720px;
  }
}

/* Responsive: 4K — even wider */
@media (min-width: 2560px) {
  .umm-island {
    max-width: 800px;
    height: 54px;
  }

  .umm-island-nav-link {
    font-size: 16px;
    padding: 8px 14px;
  }

  .umm-island-input {
    font-size: 17px;
  }
}
</style>
