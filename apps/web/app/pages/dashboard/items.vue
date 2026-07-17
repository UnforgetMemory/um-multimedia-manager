<template>
  <div>
    <UmmPageHeader title="媒体条目" description="管理所有平台的媒体记录" />

    <!-- Filters -->
    <div class="mb-5 flex flex-col sm:flex-row gap-3">
      <UInput
        v-model="q"
        placeholder="搜索标题..."
        icon="i-lucide-search"
        class="flex-1"
        @input="debouncedSearch"
      />
      <USelect
        v-model="platform"
        :items="platformOptions"
        placeholder="全部平台"
        class="w-full sm:w-40"
        @change="search"
      />
    </div>

    <!-- Loading -->
    <div v-if="loading" class="space-y-3">
      <USkeleton v-for="n in 5" :key="n" class="h-20" />
    </div>

    <!-- Items List -->
    <div v-else-if="items.length > 0" class="space-y-3">
      <UCard
        v-for="item in items"
        :key="item.id"
      >
        <template #default>
          <div class="flex items-start gap-4">
            <img
              v-if="item.coverUrl"
              :src="item.coverUrl"
              alt=""
              class="w-12 h-16 rounded object-cover flex-shrink-0"
            />
            <div v-else class="w-12 h-16 rounded bg-neutral-100 dark:bg-neutral-800 flex-shrink-0 flex items-center justify-center">
              <UIcon name="i-lucide-image" class="w-5 h-5 text-neutral-400" />
            </div>
            <div class="flex-1 min-w-0">
              <h3 class="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">{{ item.title }}</h3>
              <p class="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{{ platformLabel(item.platform) }} · {{ mediaTypeLabel(item.mediaType) }}</p>
              <div class="mt-1.5 flex items-center gap-2">
                <UBadge
                  v-if="item.status"
                  :color="statusColor(item.status)"
                  variant="subtle"
                >
                  {{ statusLabel(item.status) }}
                </UBadge>
                <span v-if="item.rating" class="text-xs text-amber-500">★ {{ item.rating }}</span>
              </div>
            </div>
          </div>
        </template>
      </UCard>
    </div>

    <!-- Empty State -->
    <UCard v-else>
      <template #default>
        <div class="py-12 text-center">
          <p class="text-sm text-neutral-600 dark:text-neutral-400">{{ q || platform ? '未找到匹配条目' : '暂无数据' }}</p>
          <p class="mt-1 text-xs text-neutral-500 dark:text-neutral-500">使用浏览器扩展同步数据后即可查看。</p>
        </div>
      </template>
    </UCard>

    <!-- Pagination -->
    <div v-if="pagination.totalPages > 1" class="mt-5 flex items-center justify-center gap-2">
      <UButton
        v-for="p in pagination.totalPages"
        :key="p"
        :color="p === pagination.page ? 'primary' : 'neutral'"
        :variant="p === pagination.page ? 'solid' : 'outline'"
        size="xs"
        @click="goPage(p)"
      >
        {{ p }}
      </UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'auth', layout: 'dashboard' })

interface MediaItem {
  id: string; platform: string; mediaType: string
  title: string; coverUrl: string | null
  status: number | null; rating: number | null
}
interface ItemsResponse {
  items: MediaItem[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
}

const q = ref('')
const platform = ref('')
const items = ref<MediaItem[]>([])
const loading = ref(false)
const pagination = ref({ page: 1, limit: 20, total: 0, totalPages: 0 })

const platformOptions = [
  { label: '全部平台', value: '' },
  { label: '豆瓣', value: 'douban' },
  { label: 'IMDb', value: 'imdb' },
  { label: 'NeoDB', value: 'neodb' },
  { label: 'TMDB', value: 'tmdb' },
]

let debounceTimer: ReturnType<typeof setTimeout>
function debouncedSearch() {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(search, 300)
}

async function search() {
  loading.value = true
  const params: Record<string, string> = {}
  if (q.value) params.q = q.value
  if (platform.value) params.platform = platform.value
  params.page = String(pagination.value.page)
  params.limit = String(pagination.value.limit)

  try {
    const data = await $fetch<ItemsResponse>('/api/items', { query: params })
    items.value = data.items
    pagination.value = data.pagination
  } catch { /* DB not available */ }
  finally { loading.value = false }
}

function goPage(page: number) { pagination.value.page = page; search() }

function platformLabel(p: string) {
  const labels: Record<string, string> = { douban: '豆瓣', imdb: 'IMDb', neodb: 'NeoDB', tmdb: 'TMDB' }
  return labels[p] || p
}
function mediaTypeLabel(t: string) {
  const labels: Record<string, string> = { movie: '电影', tv: '剧集', music: '音乐', book: '书籍', game: '游戏' }
  return labels[t] || t
}
function statusColor(s: number): 'success' | 'info' | 'warning' {
  return s === 2 ? 'success' : s === 1 ? 'info' : 'warning'
}
function statusLabel(s: number) {
  return s === 2 ? '已完成' : s === 1 ? '想看' : '在看'
}

search()
</script>
