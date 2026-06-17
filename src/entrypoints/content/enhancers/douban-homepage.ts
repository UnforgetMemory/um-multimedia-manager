/**
 * 豆瓣首页增强器
 * 功能：在豆瓣电影首页显示收藏状态徽章，支持深色/浅色主题
 */

import { Store } from '@/features/database'
import type { StoreRecord } from '@/types'
import { Utils } from '@/utils'
import { debugLog } from '@/utils/logger'
import { createStatusChip, waitForElement } from '../utils/dom'

// ==================== 主题系统 ====================

const THEME_VARS = {
  light: {
    '--umm-bg-primary': '#ffffff',
    '--umm-bg-secondary': '#f8f9fa',
    '--umm-bg-tertiary': '#f0f0f0',
    '--umm-text-primary': '#1a1a1a',
    '--umm-text-secondary': '#555555',
    '--umm-text-tertiary': '#666666',
    '--umm-accent': '#4f6ef7',
    '--umm-accent-hover': '#435dd5',
    '--umm-border': '#e8e8e8',
    '--umm-border-input': '#d0d0d0',
    '--umm-success': '#4caf50',
    '--umm-success-bg': '#e8f5e9',
    '--umm-success-text': '#2e7d32',
    '--umm-danger': '#d32f2f',
    '--umm-danger-bg': '#fff5f5',
    '--umm-shadow': '0 4px 24px rgba(0, 0, 0, 0.18)',
  },
  dark: {
    '--umm-bg-primary': '#1e1e2e',
    '--umm-bg-secondary': '#2a2a3e',
    '--umm-bg-tertiary': '#3a3a4e',
    '--umm-text-primary': '#e0e0e0',
    '--umm-text-secondary': '#b0b0b0',
    '--umm-text-tertiary': '#909090',
    '--umm-accent': '#6e8aff',
    '--umm-accent-hover': '#8aa0ff',
    '--umm-border': '#3a3a4e',
    '--umm-border-input': '#4a4a5e',
    '--umm-success': '#6fcf73',
    '--umm-success-bg': '#1e3a2e',
    '--umm-success-text': '#6fcf73',
    '--umm-danger': '#e57373',
    '--umm-danger-bg': '#3a1e1e',
    '--umm-shadow': '0 4px 24px rgba(0, 0, 0, 0.4)',
  }
}

type Theme = 'light' | 'dark'

async function detectTheme(): Promise<Theme> {
  try {
    const result = await chrome.storage.local.get('umm-theme')
    const stored = result['umm-theme']
    if (stored === 'dark' || stored === 'light') {
      return stored
    }
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark'
    }
    return 'light'
  } catch {
    return 'light'
  }
}

function buildThemeCSS(theme: Theme): string {
  const vars = THEME_VARS[theme]
  let css = `[data-umm-theme="${theme}"] {\n`
  for (const [key, value] of Object.entries(vars)) {
    css += `  ${key}: ${value} !important;\n`
  }
  css += '}\n'
  return css
}

function buildDarkModeOverrides(): string {
  return `
[data-umm-theme="dark"] {
  background-color: var(--umm-bg-primary) !important;
  color: var(--umm-text-primary) !important;
}

[data-umm-theme="dark"] #wrapper,
[data-umm-theme="dark"] .article,
[data-umm-theme="dark"] .aside,
[data-umm-theme="dark"] #content {
  background-color: var(--umm-bg-primary) !important;
}

[data-umm-theme="dark"] .screening-bd,
[data-umm-theme="dark"] .recent-hot-item,
[data-umm-theme="dark"] #billboard,
[data-umm-theme="dark"] #reviews,
[data-umm-theme="dark"] .review,
[data-umm-theme="dark"] .gallery-frame {
  background-color: var(--umm-bg-secondary) !important;
  border-color: var(--umm-border) !important;
}

[data-umm-theme="dark"] input,
[data-umm-theme="dark"] button,
[data-umm-theme="dark"] .inp input {
  background-color: var(--umm-bg-tertiary) !important;
  border-color: var(--umm-border) !important;
  color: var(--umm-text-primary) !important;
}

[data-umm-theme="dark"] a {
  color: var(--umm-accent) !important;
}

[data-umm-theme="dark"] h1,
[data-umm-theme="dark"] h2,
[data-umm-theme="dark"] h3,
[data-umm-theme="dark"] h4 {
  color: var(--umm-text-primary) !important;
}

[data-umm-theme="dark"] .rating-star,
[data-umm-theme="dark"] .subject-rate,
[data-umm-theme="dark"] .allstar,
[data-umm-theme="dark"] .rating_nums {
  color: var(--umm-accent) !important;
}

[data-umm-theme="dark"] .nav,
[data-umm-theme="dark"] .global-nav,
[data-umm-theme="dark"] #db-nav-movie {
  background-color: var(--umm-bg-secondary) !important;
  border-color: var(--umm-border) !important;
}

[data-umm-theme="dark"] .nav a,
[data-umm-theme="dark"] .global-nav a {
  color: var(--umm-text-secondary) !important;
}

[data-umm-theme="dark"] .nav a:hover,
[data-umm-theme="dark"] .global-nav a:hover {
  color: var(--umm-text-primary) !important;
}

[data-umm-theme="dark"] .review-bd,
[data-umm-theme="dark"] .review-meta,
[data-umm-theme="dark"] .review-content {
  color: var(--umm-text-secondary) !important;
}

[data-umm-theme="dark"] table,
[data-umm-theme="dark"] td,
[data-umm-theme="dark"] th {
  border-color: var(--umm-border) !important;
}

[data-umm-theme="dark"] .billboard-bd td.title a {
  color: var(--umm-accent) !important;
}

[data-umm-theme="dark"] .contact,
[data-umm-theme="dark"] #contact-and-cooperation,
[data-umm-theme="dark"] .rating_answer {
  background-color: var(--umm-bg-secondary) !important;
}

[data-umm-theme="dark"] #footer {
  background-color: var(--umm-bg-secondary) !important;
  border-color: var(--umm-border) !important;
}

[data-umm-theme="dark"] #footer a {
  color: var(--umm-text-tertiary) !important;
}
`
}

// ==================== 样式注入 ====================

function injectHomepageStyles(theme: Theme): void {
  if (document.getElementById('umm-homepage-styles')) {
    return
  }

  const style = document.createElement('style')
  style.id = 'umm-homepage-styles'

  let css = buildThemeCSS(theme)
  css += buildDarkModeOverrides()

  // 首页徽章样式调整
  css += `
.screening-bd .umm-status-chip,
.recent-hot .umm-status-chip,
#billboard .umm-status-chip,
#reviews .umm-status-chip {
  margin-top: 4px;
  margin-bottom: 4px;
  font-size: 11px;
  padding: 4px 8px;
  border-radius: 6px;
}

.subject-card {
  position: relative;
}

.subject-card .umm-status-chip {
  position: absolute;
  top: 4px;
  right: 4px;
  z-index: 10;
  margin: 0;
  font-size: 10px;
  padding: 2px 6px;
}

#billboard .umm-status-chip {
  display: inline-block;
  margin-left: 8px;
  vertical-align: middle;
}

.review .umm-status-chip {
  display: inline-block;
  margin-left: 8px;
  vertical-align: middle;
  font-size: 11px;
}
`

  style.textContent = css
  document.head.appendChild(style)
  debugLog('[UMM] Homepage styles injected')
}

// ==================== 数据缓存 ====================

let recordCache: Map<string, StoreRecord> | null = null

async function loadRecordCache(): Promise<Map<string, StoreRecord>> {
  if (recordCache) {
    return recordCache
  }

  try {
    const entries = await Store.dbGetAll('douban_records')
    recordCache = new Map()
    for (const { key, record } of entries) {
      // key format: "movie::36916000"
      const id = key.split('::')[1]
      if (id) {
        recordCache.set(id, record)
      }
    }
    debugLog(`[UMM] Loaded ${recordCache.size} douban records into cache`)
    return recordCache
  } catch (error) {
    console.error('[UMM] Failed to load douban records:', error)
    return new Map()
  }
}

// ==================== ID 提取 ====================

function extractSubjectId(element: Element): string | null {
  const link = element.querySelector('a[href*="/subject/"]')
  if (!link) return null

  const href = (link as HTMLAnchorElement).href || link.getAttribute('href')
  if (!href) return null

  const match = href.match(/\/subject\/(\d+)/)
  return match ? match[1] : null
}

// ==================== 增强逻辑 ====================

function enhanceMovieCard(card: Element, recordMap: Map<string, StoreRecord>): void {
  if ((card as HTMLElement).dataset.ummEnhanced) return
  ;(card as HTMLElement).dataset.ummEnhanced = 'true'

  const subjectId = extractSubjectId(card)
  if (!subjectId) return

  const record = recordMap.get(subjectId)
  const status = record?.status ?? 0
  const rating = record?.rating ?? 0
  const note = record?.comment

  const badge = createStatusChip('movie', status, rating, note)

  const title = card.querySelector('.title-text, .title a, .pl2 a, h3 a, .subject-card-item-title-text')
  if (title) {
    title.insertAdjacentElement('afterend', badge)
  } else {
    card.appendChild(badge)
  }
}

function enhanceScreening(recordMap: Map<string, StoreRecord>): void {
  const items = document.querySelectorAll('#screening .ui-slide-item')
  items.forEach(item => enhanceMovieCard(item, recordMap))
}

function enhanceHotMovies(recordMap: Map<string, StoreRecord>): void {
  const items = document.querySelectorAll('.recent-hot .subject-card')
  items.forEach(item => enhanceMovieCard(item, recordMap))
}

function enhanceBillboard(recordMap: Map<string, StoreRecord>): void {
  const rows = document.querySelectorAll('#billboard table tr')
  rows.forEach(row => enhanceMovieCard(row, recordMap))
}

function enhanceReviews(recordMap: Map<string, StoreRecord>): void {
  const reviews = document.querySelectorAll('#reviews .review')
  reviews.forEach(review => {
    if ((review as HTMLElement).dataset.ummEnhanced) return
    ;(review as HTMLElement).dataset.ummEnhanced = 'true'

    const movieLink = review.querySelector('.review-hd a')
    if (!movieLink) return

    const href = (movieLink as HTMLAnchorElement).href || movieLink.getAttribute('href')
    if (!href) return

    const match = href.match(/\/subject\/(\d+)/)
    if (!match) return

    const subjectId = match[1]
    const record = recordMap.get(subjectId)
    if (!record) return

    const title = review.querySelector('.review-bd h3 a')
    if (title) {
      const badge = createStatusChip('movie', record.status, record.rating, record.comment)
      title.insertAdjacentElement('afterend', badge)
    }
  })
}

async function enhanceAllCards(): Promise<void> {
  const recordMap = await loadRecordCache()

  enhanceScreening(recordMap)
  enhanceHotMovies(recordMap)
  enhanceBillboard(recordMap)
  enhanceReviews(recordMap)
}

// ==================== 主入口 ====================

export async function startHomepageEnhancer(): Promise<(() => void) | null> {
  try {
    const theme = await detectTheme()
    injectHomepageStyles(theme)
    document.documentElement.dataset.ummTheme = theme

    await waitForElement('#screening', 5000).catch(() => null)

    await enhanceAllCards()

    const throttledEnhance = Utils.throttle(() => {
      enhanceAllCards()
    }, 260)

    const observer = new MutationObserver((mutations) => {
      const hasAddedNodes = mutations.some(m => m.addedNodes.length > 0)
      if (hasAddedNodes) {
        throttledEnhance()
      }
    })

    const containers = [
      document.querySelector('#screening'),
      document.querySelector('.recent-hot'),
      document.querySelector('#billboard'),
      document.querySelector('#reviews')
    ].filter(Boolean)

    containers.forEach(container => {
      if (container) {
        observer.observe(container, {
          childList: true,
          subtree: true
        })
      }
    })

    const themeMedia = window.matchMedia('(prefers-color-scheme: dark)')
    const handleThemeChange = async () => {
      const newTheme = await detectTheme()
      document.documentElement.dataset.ummTheme = newTheme
      const styleEl = document.getElementById('umm-homepage-styles')
      if (styleEl) {
        styleEl.remove()
        injectHomepageStyles(newTheme)
      }
    }
    themeMedia.addEventListener('change', handleThemeChange)

    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes['umm-theme']) {
        handleThemeChange()
      }
    }
    chrome.storage.onChanged.addListener(handleStorageChange)

    return () => {
      observer.disconnect()
      themeMedia.removeEventListener('change', handleThemeChange)
      chrome.storage.onChanged.removeListener(handleStorageChange)
      document.getElementById('umm-homepage-styles')?.remove()
      delete document.documentElement.dataset.ummTheme
      document.querySelectorAll('[data-umm-enhanced]').forEach(el => {
        delete (el as HTMLElement).dataset.ummEnhanced
      })
      document.querySelectorAll('.umm-status-chip').forEach(el => el.remove())
      recordCache = null
    }
  } catch (error) {
    console.error('[UMM] Failed to start homepage enhancer:', error)
    return null
  }
}
