<script setup lang="ts">
import { ref, provide } from 'vue'
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

provide('loading', loading)
provide('records', records)
provide('loadData', loadData)
provide('handleRefresh', handleRefresh)
</script>

<template>
  <RouterView />
</template>
