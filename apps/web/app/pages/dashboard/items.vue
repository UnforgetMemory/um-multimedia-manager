<template>
  <div>
    <h1 class="text-2xl font-bold mb-4">媒体条目</h1>
    <div class="mb-4 flex gap-2">
      <input v-model="q" placeholder="搜索标题..." class="flex-1 px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-700" @input="debouncedSearch" />
      <select v-model="platform" class="px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-700" @change="search">
        <option value="">全部平台</option>
        <option value="douban">豆瓣</option>
        <option value="imdb">IMDb</option>
        <option value="neodb">NeoDB</option>
        <option value="tmdb">TMDB</option>
      </select>
    </div>
    <div class="grid gap-4">
      <div v-for="item in items" :key="item.id" class="p-4 bg-white dark:bg-gray-800 rounded shadow-sm border dark:border-gray-700">
        <div class="flex items-start gap-3">
          <img v-if="item.coverUrl" :src="item.coverUrl" alt="" class="w-12 h-16 object-cover rounded" />
          <div class="flex-1">
            <h3 class="font-semibold">{{ item.title }}</h3>
            <p class="text-sm text-gray-500">{{ item.platform }} · {{ item.mediaType }}</p>
            <span v-if="item.status" class="inline-block mt-1 text-xs px-2 py-0.5 rounded"
              :class="statusClass(item.status)">
              {{ statusLabel(item.status) }}
            </span>
            <span v-if="item.rating" class="ml-2 text-sm text-yellow-600">★ {{ item.rating }}</span>
          </div>
        </div>
      </div>
      <div v-if="items.length === 0" class="text-center py-8 text-gray-400">
        暂无数据
      </div>
    </div>
    <div v-if="pagination.totalPages > 1" class="mt-4 flex justify-center gap-2">
      <button v-for="p in pagination.totalPages" :key="p" @click="goPage(p)"
        :class="p === pagination.page ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700'"
        class="px-3 py-1 rounded text-sm">
        {{ p }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'auth', layout: 'dashboard' })

const q = ref('')
const platform = ref('')
const items = ref<any[]>([])
const pagination = ref({ page: 1, limit: 20, total: 0, totalPages: 0 })

let debounceTimer: ReturnType<typeof setTimeout>
function debouncedSearch() {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(search, 300)
}

async function search() {
  const params: Record<string, string> = {}
  if (q.value) params.q = q.value
  if (platform.value) params.platform = platform.value
  params.page = String(pagination.value.page)
  params.limit = String(pagination.value.limit)

  try {
    const data = await $fetch('/api/items', { query: params })
    items.value = data.items
    pagination.value = data.pagination
  } catch { /* DB not available */ }
}

function goPage(page: number) { pagination.value.page = page; search() }
function statusClass(status: number) {
  return status === 2 ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
    : status === 1 ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
    : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
}
function statusLabel(status: number) {
  return status === 2 ? '已完成' : status === 1 ? '想看' : '在看'
}

search()
</script>