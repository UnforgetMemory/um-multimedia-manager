<script setup lang="ts">
import { ref, provide, onMounted } from 'vue'

const loading = ref(false)
const records = ref<any[]>([])

provide('loading', loading)
provide('records', records)
provide('loadData', async () => {})
provide('handleRefresh', () => {})

onMounted(() => {
  console.log('[UMM Popup] App mounted')
})
</script>

<template>
  <div style="padding: 20px; font-family: sans-serif;">
    <h1 style="font-size: 24px; font-weight: bold; margin-bottom: 16px;">UMM</h1>
    <p style="color: #666; margin-bottom: 24px;">v3.0.0</p>
    <p>Records: {{ records.length }}</p>
    <button
      @click="() => window.open((chrome as any).runtime?.getURL?.('options.html') || '#', '_blank')"
      style="width: 100%; padding: 12px; background: #03dac6; color: #000; border: none; border-radius: 8px; font-size: 16px; font-weight: bold; cursor: pointer; margin-top: 16px;"
    >
      管理面板
    </button>
  </div>
</template>
