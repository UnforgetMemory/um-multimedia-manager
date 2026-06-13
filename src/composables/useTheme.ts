import { ref, onMounted, onUnmounted, watch } from 'vue'

export type ThemeMode = 'light' | 'dark' | 'auto'
export type FontSize = 'compact' | 'default' | 'comfortable'
export type Density = 'compact' | 'default' | 'comfortable'

const STORAGE_KEY = 'umm:appearance'

interface AppearanceState {
  theme: ThemeMode
  fontSize: FontSize
  density: Density
}

const theme = ref<ThemeMode>('auto')
const fontSize = ref<FontSize>('default')
const density = ref<Density>('default')
let mediaQuery: MediaQueryList | null = null
let mediaHandler: ((e: MediaQueryListEvent) => void) | null = null

function applyTheme(mode: ThemeMode) {
  const isDark = mode === 'dark' || (mode === 'auto' && mediaQuery?.matches)
  document.documentElement.classList.toggle('dark', isDark)
}

function applyFontSize(size: FontSize) {
  document.documentElement.classList.remove('font-compact', 'font-default', 'font-comfortable')
  document.documentElement.classList.add(`font-${size}`)
}

function applyDensity(d: Density) {
  document.documentElement.classList.remove('density-compact', 'density-default', 'density-comfortable')
  document.documentElement.classList.add(`density-${d}`)
}

function applyAll() {
  applyTheme(theme.value)
  applyFontSize(fontSize.value)
  applyDensity(density.value)
  // Enable transitions AFTER first paint to avoid flash on initial load
  // Double rAF ensures the browser has completed the first paint
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.documentElement.classList.add('theme-ready')
    })
  })
}

export function useTheme() {
  onMounted(() => {
    // 1. Try sync read from localStorage first
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const saved = JSON.parse(raw) as AppearanceState
        if (saved) {
          theme.value = saved.theme || 'auto'
          fontSize.value = saved.fontSize || 'default'
          density.value = saved.density || 'default'
        }
      }
    } catch { /* ignore */ }

    // 2. Async read from chrome.storage (authoritative source)
    try {
      chrome.storage.local.get([STORAGE_KEY], (result: any) => {
        const saved = result[STORAGE_KEY] as AppearanceState | undefined
        if (saved) {
          theme.value = saved.theme || 'auto'
          fontSize.value = saved.fontSize || 'default'
          density.value = saved.density || 'default'
        }
        applyAll()
        // Sync localStorage cache
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          theme: theme.value,
          fontSize: fontSize.value,
          density: density.value,
        }))
      })
    } catch {
      applyAll()
    }

    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    mediaHandler = () => { if (theme.value === 'auto') applyTheme('auto') }
    mediaQuery.addEventListener('change', mediaHandler)

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return
      if (changes[STORAGE_KEY]) {
        const saved = changes[STORAGE_KEY].newValue as AppearanceState
        if (saved) {
          theme.value = saved.theme || 'auto'
          fontSize.value = saved.fontSize || 'default'
          density.value = saved.density || 'default'
          applyAll()
        }
      }
    })
  })

  onUnmounted(() => {
    if (mediaQuery && mediaHandler) {
      mediaQuery.removeEventListener('change', mediaHandler)
    }
  })

  watch([theme, fontSize, density], () => {
    applyAll()
    const state = {
      theme: theme.value,
      fontSize: fontSize.value,
      density: density.value,
    }
    try {
      // Write to both chrome.storage (cross-context) and localStorage (sync read)
      chrome.storage.local.set({ [STORAGE_KEY]: state })
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch { /* silent */ }
  })

  return { theme, fontSize, density }
}
