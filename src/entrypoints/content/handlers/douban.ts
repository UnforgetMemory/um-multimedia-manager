/**
 * Douban detail page handler (overlay mode)
 *
 * Background tasks only — the Vue overlay app handles all UI rendering.
 * Responsibilities:
 * - Theme sync: read UMM theme setting and apply to page <html>
 * - Data sync: scan page status, sync to IndexedDB if page shows "done"
 * - NeoDB: set up injector for re-injection on SPA navigation
 * - Doulist: initialize themed doulist modal replacement
 */

import type { UrlIdentity } from '@/types'
import { scanDoubanPageStatus } from './douban-scanner'
import { getLocalRecord, syncToLocalStorage } from './douban-sync'
import { injectNeoDBPushButtons } from './douban-neodb'
import { initDoulistReplacement } from '../ui/doulist-replace'
import { setNeoDBInjector } from '../observers/rating'

const THEME_KEY = 'umm:appearance'
export const THEME_ATTR = 'data-umm-theme'

// ============================================================
// Theme sync — read UMM theme setting and apply to page
// ============================================================

let _themeListenerAttached = false

function resolveThemeFromStorage(raw: Record<string, unknown> | undefined): 'dark' | 'light' {
  const mode = (raw?.theme as string) ?? 'auto'
  if (mode === 'dark') return 'dark'
  if (mode === 'light') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyThemeToPage(theme: 'dark' | 'light'): void {
  document.documentElement.setAttribute(THEME_ATTR, theme)
}

function syncDetailPageTheme(): void {
  const apply = (raw: Record<string, unknown> | undefined): void => {
    applyThemeToPage(resolveThemeFromStorage(raw))
  }

  try {
    chrome.storage.local.get([THEME_KEY], (result) => {
      if (chrome.runtime.lastError) {
        applyThemeToPage(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        return
      }
      apply(result[THEME_KEY] as Record<string, unknown> | undefined)
    })
  } catch {
    applyThemeToPage(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  }

  if (_themeListenerAttached) return
  _themeListenerAttached = true

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[THEME_KEY]) {
      applyThemeToPage(resolveThemeFromStorage(changes[THEME_KEY].newValue as Record<string, unknown> | undefined))
    }
  })

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      try {
        chrome.storage.local.get([THEME_KEY], (result) => {
          if (!chrome.runtime.lastError) {
            applyThemeToPage(resolveThemeFromStorage(result[THEME_KEY] as Record<string, unknown> | undefined))
          }
        })
      } catch { /* silent fallback */ }
    }
  })
}

// ============================================================
// Main handler
// ============================================================

export async function handleDoubanDetailPage(identity: UrlIdentity): Promise<void> {
  console.log('[UMM] handleDoubanDetailPage — overlay mode, background tasks only')

  try {
    syncDetailPageTheme()

    const localRecord = await getLocalRecord(identity)
    const pageState = scanDoubanPageStatus(identity)

    if (pageState.status === 'done') {
      await syncToLocalStorage(identity, pageState.rating, localRecord)
    }

    setNeoDBInjector(() => { injectNeoDBPushButtons(identity, null) })
    initDoulistReplacement(identity)
  } catch (error) {
    console.error('[UMM Douban] Detail page background tasks failed:', error)
  }
}
