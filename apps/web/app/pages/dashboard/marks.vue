<template>
  <div>
    <h1 class="text-2xl font-bold mb-4">我的标记</h1>
    <p class="text-gray-500 mb-4">从浏览器扩展同步后，你的标记记录将显示在这里。</p>
    <div v-if="marks.length > 0" class="space-y-2">
      <div v-for="m in marks" :key="m.id" class="p-3 bg-white dark:bg-gray-800 rounded shadow-sm text-sm flex justify-between">
        <span>条目: {{ m.mediaItemId.substring(0, 8) }}...</span>
        <span :class="m.status === 2 ? 'text-green-600' : 'text-blue-600'">{{ statusLabel(m.status) }}</span>
        <span v-if="m.rating">★ {{ m.rating }}</span>
      </div>
    </div>
    <div v-else class="text-center py-8 text-gray-400">暂无同步数据</div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'auth', layout: 'dashboard' })
const marks = ref<any[]>([])

async function loadMarks() {
  try {
    const data = await $fetch('/api/marks')
    marks.value = data.marks
  } catch { /* DB not available */ }
}
function statusLabel(status: number) {
  return status === 2 ? '已完成' : status === 1 ? '想看' : '在看'
}
loadMarks()
</script>