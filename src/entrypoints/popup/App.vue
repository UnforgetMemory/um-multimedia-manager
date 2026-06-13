<script setup lang="ts">
import { provide, onMounted } from 'vue'
import { RouterView } from 'vue-router'

const APPEARANCE_KEY = 'umm:appearance'

function applyAppearance(appearance: string) {
  if (appearance === 'dark') {
    document.documentElement.classList.add('dark')
  } else if (appearance === 'light') {
    document.documentElement.classList.remove('dark')
  } else {
    // 'auto': follow system preference
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    document.documentElement.classList.toggle('dark', prefersDark)
  }
}

// Sync read from localStorage (instant, no flash)
function readThemeSync(): string | null {
  try {
    const raw = localStorage.getItem(APPEARANCE_KEY)
    if (raw) {
      const saved = JSON.parse(raw)
      return saved?.theme || null
    }
  } catch { /* ignore */ }
  return null
}

// Apply theme on mount — sync first, then async fallback
onMounted(() => {
  // 1. Instant: read from localStorage (sync)
  const syncTheme = readThemeSync()
  if (syncTheme) {
    applyAppearance(syncTheme)
  }

  // 2. Fallback: read from chrome.storage (async, in case localStorage is stale)
  try {
    chrome.storage.local.get([APPEARANCE_KEY], (result: any) => {
      const saved = result[APPEARANCE_KEY]
      if (saved?.theme) {
        applyAppearance(saved.theme)
      }
    })
  } catch { /* ignore */ }

  // 3. Listen for live changes from options page
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return
    if (changes[APPEARANCE_KEY]) {
      const saved = changes[APPEARANCE_KEY].newValue
      if (saved?.theme) {
        applyAppearance(saved.theme)
        // Update localStorage cache
        localStorage.setItem(APPEARANCE_KEY, JSON.stringify(saved))
      }
    }
  })
})

provide('loadData', async () => {})
</script>

<template>
  <RouterView />
</template>
