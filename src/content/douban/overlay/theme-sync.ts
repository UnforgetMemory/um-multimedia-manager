/**
 * Unified theme sync for Douban overlays + page-level attribute sync.
 *
 * Two cooperating entry points, one resolution rule:
 *   - applyOverlayTheme / startThemeSync — overlay shadow HOST (data-theme +
 *     umm-theme--dark class) for the overlay lifecycle.
 *   - startThemeAttrSync — ALWAYS-ON html[data-umm-theme] for light-DOM rules
 *     (global.ts) + the html background mirror. Overlay-independent, so the
 *     attribute never goes stale after overlay dismissal.
 */

import { debounce } from '@/utils'
import { COLOR_SURFACE_DARK, COLOR_SURFACE_LIGHT } from '@/entrypoints/content/styles/tokens'

export const THEME_KEY = 'umm:appearance'

/** mode ('dark'|'light'|'auto') → concrete theme; auto follows the OS. */
function resolveTheme(mode: string): 'dark' | 'light' {
  if (mode === 'dark' || mode === 'light') return mode
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** html background mirrors the overlay surface (no seams on overscroll). */
function applyHtmlBackground(theme: 'dark' | 'light'): void {
  const bgColor = theme === 'dark' ? COLOR_SURFACE_DARK : COLOR_SURFACE_LIGHT
  let styleEl = document.getElementById('umm-html-theme') as HTMLStyleElement | null
  if (!styleEl) {
    styleEl = document.createElement('style')
    styleEl.id = 'umm-html-theme'
    document.documentElement.appendChild(styleEl)
  }
  styleEl.textContent = `html { background: ${bgColor} !important; }`
}

/**
 * Apply the stored theme to an overlay host element.
 * Reads chrome.storage.local, sets data-theme + class on host, and syncs
 * the html background color.
 */
export function applyOverlayTheme(host: HTMLElement): void {
  function setTheme(mode: string) {
    const theme = resolveTheme(mode)
    host.setAttribute('data-theme', theme)
    host.classList.remove('umm-theme--light', 'umm-theme--dark')
    host.classList.add(`umm-theme--${theme}`)
    // html[data-umm-theme] + background are owned by startThemeAttrSync —
    // writing them here too is redundant but harmless during overlap.
    document.documentElement.setAttribute('data-umm-theme', theme)
    applyHtmlBackground(theme)
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

/**
 * ALWAYS-ON data-umm-theme sync for the PAGE (light DOM).
 *
 * applyOverlayTheme runs only inside the overlay lifecycle, so pages without
 * an overlay — and states after overlay dismissal — never received (or went
 * stale on) the attribute that every `[data-umm-theme="dark"]` rule in
 * global.ts depends on. This standalone sync keeps the attribute (and the
 * html background) live for the whole document lifetime: storage changes
 * AND OS scheme flips (auto).
 */
export function startThemeAttrSync(): () => void {
  let mode = 'auto'
  const apply = () => {
    const theme = resolveTheme(mode)
    document.documentElement.setAttribute('data-umm-theme', theme)
    applyHtmlBackground(theme)
  }
  apply() // synchronous first paint — refine after storage resolves
  try {
    chrome.storage.local.get([THEME_KEY], (result) => {
      if (chrome.runtime.lastError) { apply(); return }
      mode = (result?.[THEME_KEY] as Record<string, unknown> | undefined)?.theme as string ?? 'auto'
      apply()
    })
  } catch { apply() }
  const storageHandler = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && changes[THEME_KEY]) {
      mode = (changes[THEME_KEY].newValue as Record<string, unknown> | undefined)?.theme as string ?? 'auto'
      apply()
    }
  }
  chrome.storage.onChanged.addListener(storageHandler)
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const mqHandler = () => { if (mode === 'auto') apply() }
  mq.addEventListener?.('change', mqHandler)
  return () => {
    chrome.storage.onChanged.removeListener(storageHandler)
    mq.removeEventListener?.('change', mqHandler)
  }
}
