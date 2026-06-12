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
}

export function useTheme() {
  onMounted(() => {
    try {
      chrome.storage.local.get([STORAGE_KEY], (result: any) => {
        const saved = result[STORAGE_KEY] as AppearanceState | undefined
        if (saved) {
          theme.value = saved.theme || 'auto'
          fontSize.value = saved.fontSize || 'default'
          density.value = saved.density || 'default'
        }
        applyAll()
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
    try {
      chrome.storage.local.set({
        [STORAGE_KEY]: {
          theme: theme.value,
          fontSize: fontSize.value,
          density: density.value,
        },
      })
    } catch { /* silent */ }
  })

  return { theme, fontSize, density }
}
