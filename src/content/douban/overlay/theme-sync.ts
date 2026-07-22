/**
 * Unified theme sync for Douban overlays.
 *
 * Consolidates logic previously split across overlay.ts (DOM shadow host
 * theme) and shared/theme-sync.ts (storage helpers): reading the preference
 * from chrome.storage.local, resolving it to a concrete 'dark'|'light', and
 * applying it onto a shadow DOM host element with html background sync.
 */

import { debounce } from '@/utils'

export const THEME_KEY = 'umm:appearance'

/**
 * Read the theme preference from chrome.storage.local.
 * Falls back to 'auto' on any error.
 */
export function getThemeFromStorage(): Promise<string> {
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
 * Resolve a theme mode string ('dark', 'light', or 'auto') into a concrete
 * 'dark' | 'light'.  'auto' reads the OS preference via prefers-color-scheme.
 */
export function resolveTheme(raw: string | undefined): 'dark' | 'light' {
  if (raw === 'dark') return 'dark'
  if (raw === 'light') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/**
 * Apply the stored theme to an overlay host element.
 * Reads chrome.storage.local, sets data-theme + class on host, and syncs
 * the html background color.
 */
export function applyOverlayTheme(host: HTMLElement): void {
  function setTheme(mode: string) {
    const theme = mode === 'dark' ? 'dark'
      : mode === 'light' ? 'light'
      : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    host.setAttribute('data-theme', theme)
    host.classList.remove('umm-theme--light', 'umm-theme--dark')
    host.classList.add(`umm-theme--${theme}`)
    // Sync to html element so light-DOM components (doulist dialog, search
    // badges, NeoDB buttons, etc.) can detect the current theme via the
    // data-umm-theme attribute or [data-umm-theme="dark"] CSS selectors.
    document.documentElement.setAttribute('data-umm-theme', theme)
    const bgColor = theme === 'dark' ? 'hsl(240 6% 10%)' : 'hsl(0 0% 100%)'
    let styleEl = document.getElementById('umm-html-theme') as HTMLStyleElement | null
    if (!styleEl) {
      styleEl = document.createElement('style')
      styleEl.id = 'umm-html-theme'
      document.documentElement.appendChild(styleEl)
    }
    styleEl.textContent = `html { background: ${bgColor} !important; }`
  }
  const fallback = () => setTheme('auto')
  try {
    chrome.storage.local.get([THEME_KEY], (result) => {
      if (chrome.runtime.lastError) { fallback(); return }
      const raw = result[THEME_KEY] as Record<string, unknown> | undefined
      setTheme((raw?.theme as string) ?? 'auto')
    })
  } catch { fallback() }
}

/**
 * Listen for theme changes and apply them to the overlay host.
 * Calls applyOverlayTheme immediately on subscribe.
 * Returns a cleanup function to remove the listener.
 */
export function startThemeSync(host: HTMLElement): () => void {
  applyOverlayTheme(host)
  const debouncedApply = debounce(() => applyOverlayTheme(host), 100)
  const handler = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && changes[THEME_KEY]) debouncedApply()
  }
  chrome.storage.onChanged.addListener(handler)
  return () => chrome.storage.onChanged.removeListener(handler)
}
