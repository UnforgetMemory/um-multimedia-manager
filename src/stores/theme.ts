import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { useStorage, useMediaQuery } from '@vueuse/core'

export type ThemeMode = 'light' | 'dark' | 'auto'

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
    document.documentElement.classList.toggle('dark', dark)
  }

  function applyAll() {
    applyTheme(theme.value)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.documentElement.classList.add('theme-ready')
      })
    })
  }

  // Init from storage
  if (storage.value) {
    theme.value = storage.value.theme
  }
  applyAll()

  // Persist on change
  watch([theme], () => {
    storage.value = { theme: theme.value }
    applyAll()
    chrome.storage.local.set({ [STORAGE_KEY]: storage.value })
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