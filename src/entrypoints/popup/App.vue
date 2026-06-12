<script setup lang="ts">
import { ref, provide, onMounted } from 'vue'
import { RouterView } from 'vue-router'
import { safeSendMessage } from '@/utils/context'

const loading = ref(false)
const records = ref<any[]>([])

async function loadData() {
  if (loading.value) return
  loading.value = true
  try {
    const response = await safeSendMessage({ type: 'GET_ALL_RECORDS' }, { timeout: 10000, retries: 2 })
    if (response?.success) records.value = response.records
  } catch { records.value = [] } finally { loading.value = false }
}

function handleRefresh() { loadData() }

// Theme initialization
onMounted(() => {
  try {
    chrome.storage.local.get(['settings'], (result: any) => {
      const appearance = result?.settings?.appearance || 'auto'
      if (appearance === 'dark') {
        document.documentElement.classList.add('dark')
      } else if (appearance === 'light') {
        document.documentElement.classList.remove('dark')
      } else {
        // auto: follow system
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        document.documentElement.classList.toggle('dark', prefersDark)
      }
    })
  } catch {
    // Fallback: follow system preference
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    document.documentElement.classList.toggle('dark', prefersDark)
  }
})

provide('loading', loading)
provide('records', records)
provide('loadData', loadData)
provide('handleRefresh', handleRefresh)
</script>

<template>
  <RouterView />
</template>
