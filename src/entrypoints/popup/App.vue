<script setup lang="ts">
import { provide, onMounted } from 'vue'
import { RouterView } from 'vue-router'

// Theme initialization
// System dark mode is handled by CSS @media in index.html (no flash)
// Stored dark/light setting is applied here (async, minimal flash for manual dark)
onMounted(() => {
  try {
    chrome.storage.local.get(['settings'], (result: any) => {
      const appearance = result?.settings?.appearance || 'auto'
      if (appearance === 'dark') {
        document.documentElement.classList.add('dark')
      } else if (appearance === 'light') {
        document.documentElement.classList.remove('dark')
      }
      // 'auto' case handled by CSS @media in index.html
    })
  } catch {
    // fallback: follow system
  }
})

provide('loadData', async () => {})
</script>

<template>
  <RouterView />
</template>
