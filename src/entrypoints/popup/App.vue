<script setup lang="ts">
import { provide, onMounted } from 'vue'
import { RouterView } from 'vue-router'

const APPEARANCE_KEY = 'umm:appearance'

function applyAppearance(appearance: string) {
  if (appearance === 'dark') {
    document.documentElement.classList.add('dark')
  } else if (appearance === 'light') {
    document.documentElement.classList.remove('dark')
  }
  // 'auto' case handled by CSS @media in index.html
}

// Read stored theme on mount
onMounted(() => {
  try {
    chrome.storage.local.get([APPEARANCE_KEY], (result: any) => {
      const saved = result[APPEARANCE_KEY]
      if (saved?.theme) {
        applyAppearance(saved.theme)
      }
    })
  } catch { /* fallback: CSS @media handles auto */ }

  // Listen for theme changes from options page
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return
    if (changes[APPEARANCE_KEY]) {
      const saved = changes[APPEARANCE_KEY].newValue
      if (saved?.theme) {
        applyAppearance(saved.theme)
      }
    }
  })
})

provide('loadData', async () => {})
</script>

<template>
  <RouterView />
</template>
