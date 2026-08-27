import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { useStorage, useMediaQuery } from '@vueuse/core'
import { settingsItems } from '@/features/settings/items'

export type ThemeMode = 'light' | 'dark' | 'auto'

/**
 * Theme store's own persistent key.
 *
 * Dual-key relationship with settings (do NOT unify in this wave):
 * - `umm:appearance` — written here via useStorage and re-read on
 *   chrome.storage.onChanged for cross-context sync (content scripts / popup).
 * - `theme` (STORAGE_KEYS.THEME) — mirrored by syncThemeToSettings() into the
 *   background settings cache; src/features/settings/cache.ts startListening()
 *   shims `umm:appearance` changes into `cache.theme` so both stay consistent.
 */
const STORAGE_KEY = 'umm:appearance'

export const useThemeStore = defineStore('theme', () => {
  const theme = ref<ThemeMode>('auto')
  const isDark = useMediaQuery('(prefers-color-scheme: dark)')
  const storage = useStorage<{ theme: ThemeMode }>(
    STORAGE_KEY,
    { theme: 'auto' },
  )

  function applyTheme(mode: ThemeMode) {
    const dark = mode === 'dark' || (mode === 'auto' && isDark.value)
    const root = document.documentElement
    // Exclusive dual-class: explicit .light must override the OS-dark
    // @media fallback in index.html (html:not(.dark) color-scheme hack),
    // otherwise UA widgets render dark over the light UI.
    root.classList.toggle('dark', dark)
    root.classList.toggle('light', !dark)
  }

  function applyAll() {
    applyTheme(theme.value)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.documentElement.classList.add('theme-ready')
      })
    })
  }

  /** Sync theme value to background settingsCache via the typed THEME item */
  function syncThemeToSettings(themeValue: ThemeMode): void {
    settingsItems().theme.setValue(themeValue).catch(() => {
      // Silent — content scripts and themeStore already have the value via 'umm:appearance'
    })
  }

  // Init from storage
  if (storage.value) {
    theme.value = storage.value.theme
    syncThemeToSettings(theme.value)
  }
  applyAll()

  // Persist on change
  watch([theme], () => {
    storage.value = { theme: theme.value }
    applyAll()
    chrome.storage.local.set({ [STORAGE_KEY]: storage.value })
    syncThemeToSettings(theme.value)
  })

  // React to chrome.storage changes (cross-context sync)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return
    const saved = changes[STORAGE_KEY]?.newValue as typeof storage.value | undefined
    if (saved) {
      theme.value = saved.theme
    }
  })

  return { theme, applyTheme }
})