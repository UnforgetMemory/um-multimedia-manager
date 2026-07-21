import { create } from 'zustand'
import { STORAGE_KEYS } from '@/config'

export type ThemeMode = 'light' | 'dark' | 'auto'

const STORAGE_KEY = 'umm:appearance'

interface ThemeState {
  theme: ThemeMode
  applyTheme: (mode: ThemeMode) => void
}

function getInitialTheme(): ThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      return parsed.theme || 'auto'
    }
  } catch {}
  return 'auto'
}

function applyThemeToDom(mode: ThemeMode): boolean {
  const isDark = mode === 'dark' || (mode === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', isDark)
  return isDark
}

function syncThemeToSettings(themeValue: ThemeMode): void {
  chrome.storage.local.set({ [STORAGE_KEYS.THEME]: themeValue }).catch(() => {})
}

export const useThemeStore = create<ThemeState>((set, get) => {
  const initialTheme = getInitialTheme()
  applyThemeToDom(initialTheme)
  syncThemeToSettings(initialTheme)

  // Setup matchMedia listener for auto mode
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  const handleChange = () => {
    if (get().theme === 'auto') {
      applyThemeToDom('auto')
    }
  }
  mediaQuery.addEventListener('change', handleChange)

  // Listen for cross-context storage changes
  const handleStorageChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== 'local') return
    const saved = changes[STORAGE_KEY]?.newValue as { theme: ThemeMode } | undefined
    if (saved) {
      get().applyTheme(saved.theme)
    }
  }
  chrome.storage.onChanged.addListener(handleStorageChange)

  return {
    theme: initialTheme,
    applyTheme: (mode: ThemeMode) => {
      set({ theme: mode })
      applyThemeToDom(mode)
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: mode }))
      chrome.storage.local.set({ [STORAGE_KEY]: { theme: mode } }).catch(() => {})
      syncThemeToSettings(mode)
    },
  }
})
