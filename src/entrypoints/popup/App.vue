<script setup lang="ts">
import { provide, onMounted } from 'vue'
import { RouterView } from 'vue-router'

// Theme initialization — runs immediately, no async delay
onMounted(() => {
  try {
    chrome.storage.local.get(['settings'], (result: any) => {
      const appearance = result?.settings?.appearance || 'auto'
      if (appearance === 'dark') {
        document.documentElement.classList.add('dark')
      } else if (appearance === 'light') {
        document.documentElement.classList.remove('dark')
      } else {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        document.documentElement.classList.toggle('dark', prefersDark)
      }
    })
  } catch {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    document.documentElement.classList.toggle('dark', prefersDark)
  }
})

provide('loadData', async () => {})
</script>

<template>
  <RouterView />
</template>
