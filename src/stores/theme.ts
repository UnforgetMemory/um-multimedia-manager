import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { useStorage, useMediaQuery } from '@vueuse/core'

export type ThemeMode = 'light' | 'dark' | 'auto'
export type FontSize = 'compact' | 'default' | 'comfortable'
export type Density = 'compact' | 'default' | 'comfortable'

const STORAGE_KEY = 'umm:appearance'

export const useThemeStore = defineStore('theme', () => {
  const theme = ref<ThemeMode>('auto')
  const fontSize = ref<FontSize>('default')
  const density = ref<Density>('default')
  const isDark = useMediaQuery('(prefers-color-scheme: dark)')
  const storage = useStorage<{ theme: ThemeMode; fontSize: FontSize; density: Density }>(
    STORAGE_KEY,
    { theme: 'auto', fontSize: 'default', density: 'default' },
  )

  function applyTheme(mode: ThemeMode) {
    const dark = mode === 'dark' || (mode === 'auto' && isDark.value)
    document.documentElement.classList.toggle('dark', dark)
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
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.documentElement.classList.add('theme-ready')
      })
    })
  }

  // Init from storage
  if (storage.value) {
    theme.value = storage.value.theme
    fontSize.value = storage.value.fontSize
    density.value = storage.value.density
  }
  applyAll()

  // Persist on change
  watch([theme, fontSize, density], () => {
    storage.value = { theme: theme.value, fontSize: fontSize.value, density: density.value }
    applyAll()
    chrome.storage.local.set({ [STORAGE_KEY]: storage.value })
  })

  // React to chrome.storage changes (cross-context sync)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return
    const saved = changes[STORAGE_KEY]?.newValue as typeof storage.value | undefined
    if (saved) {
      theme.value = saved.theme
      fontSize.value = saved.fontSize
      density.value = saved.density
    }
  })

  return { theme, fontSize, density, applyTheme, applyFontSize, applyDensity }
})