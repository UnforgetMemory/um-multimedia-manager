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
import { Store } from '@/features/database'
import { scanDoubanPageStatus } from './douban-scanner'
import { getLocalRecord, syncToLocalStorage } from './douban-sync'
import { injectNeoDBPushButtons } from './douban-neodb'
import { initDoulistReplacement } from '../ui/doulist-replace'
import { setNeoDBInjector } from '../observers/rating'
import { infoLog } from '@/utils/logger'
import { getThemeFromStorage, resolveTheme } from '@/content/douban/shared/theme-sync'

export const THEME_ATTR = 'data-umm-theme'

function applyThemeToPage(mode: string): void {
  document.documentElement.setAttribute(THEME_ATTR, resolveTheme(mode))
}

async function syncDetailPageTheme(): Promise<void> {
  const apply = async () => {
    try {
      const theme = await getThemeFromStorage()
      applyThemeToPage(theme)
    } catch {
      applyThemeToPage('auto')
    }
  }

  await apply()

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void apply()
  })

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return
    if (changes['umm:appearance']) {
      infoLog('Theme changed in storage, applying to page')
      applyThemeToPage((changes['umm:appearance'].newValue as Record<string, unknown> | undefined)?.theme as string)
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

    if (pageState.status === 'done' || pageState.status === 'wish' || pageState.status === 'doing') {
      await syncToLocalStorage(identity, pageState.status, pageState.rating, localRecord)
    }

    setNeoDBInjector(async () => {
      const storeName = `${identity.provider}_records`
      const key = `${identity.type}::${identity.providerId}`
      const rec = await Store.dbGet(storeName, key)
      injectNeoDBPushButtons(identity, rec)
    })
    initDoulistReplacement(identity)
  } catch (error) {
    console.error('[UMM Douban] Detail page background tasks failed:', error)
  }
}
