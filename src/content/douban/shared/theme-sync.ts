/**
 * Unified theme sync for Douban pages.
 *
 * Consolidates TWO theme-sync implementations:
 * - overlay.ts:applyOverlayTheme() / startThemeSync()
 *   → reads chrome.storage → applies data-theme to shadow DOM host
 * - handlers/douban.ts:syncDetailPageTheme() / resolveThemeFromStorage()
 *   → reads chrome.storage → applies data-umm-theme to <html>
 *
 * Both do the same chrome.storage.local.get([THEME_KEY]) dance.
 * This module provides a single getThemeFromStorage() + helpers.
 */

const THEME_KEY = 'umm:appearance'

/**
 * Read the theme preference from chrome.storage.local.
 * Falls back to 'auto' on any error.
 */
export async function getThemeFromStorage(): Promise<string> {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get([THEME_KEY], (result) => {
        if (chrome.runtime.lastError) {
          resolve('auto')
          return
        }
        resolve((result[THEME_KEY] as Record<string, unknown> | undefined)?.theme as string ?? 'auto')
      })
    } catch {
      resolve('auto')
    }
  })
}

/**
 * Resolve a theme mode string ('dark', 'light', or 'auto') into a concrete 'dark' | 'light'.
 */
export function resolveTheme(raw: string | undefined): 'dark' | 'light' {
  if (raw === 'dark') return 'dark'
  if (raw === 'light') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export { THEME_KEY }
