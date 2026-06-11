<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed, provide } from 'vue'
import { useRouter, useRoute, RouterView } from 'vue-router'
import { MISC_KEYS } from '@/config'
import type { StoreRecord } from '@/types'
import { safeSendMessage } from '@/utils/context'
import { useConfirmDialog } from './useConfirmDialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import {
  Moon, Sun, Settings, Database, RefreshCw,
  Star, Link, XCircle
} from 'lucide-vue-next'

interface DisplayRecord extends StoreRecord {
  type: string
  provider: string
  providerId: string
}

const appVersion = chrome.runtime.getManifest().version

const router = useRouter()
const route = useRoute()

type Page = 'records' | 'platforms' | 'ratings' | 'linked' | 'settings'

const currentPage = computed<Page>(() => {
  const name = route.name as string
  if (name && ['records', 'platforms', 'ratings', 'linked', 'settings'].includes(name)) {
    return name as Page
  }
  return 'records'
})

const pages = [
  { id: 'records', label: '概览', icon: Database },
  { id: 'platforms', label: '平台分布', icon: Settings },
  { id: 'ratings', label: '评分', icon: Star },
  { id: 'linked', label: '关联', icon: Link },
  { id: 'settings', label: '设置', icon: Settings },
] as const

// ==================== 共享状态 ====================
const loading = ref(false)
const loadError = ref<string | null>(null)
const records = ref<DisplayRecord[]>([])
const stats = ref({
  total: 0,
  movie: 0,
  tv: 0,
  music: 0,
})

let loadTimeout: ReturnType<typeof setTimeout> | null = null

async function loadData() {
  if (loading.value) return

  if (loadTimeout) clearTimeout(loadTimeout)

  loading.value = true
  loadError.value = null

  loadTimeout = setTimeout(() => {
    if (loading.value) {
      loading.value = false
    }
  }, 10000)

  try {
    const response = await safeSendMessage(
      { type: 'GET_ALL_RECORDS' },
      {
        timeout: 10000,
        retries: 2,
        fallback: () => {
          loading.value = false
          loadError.value = '数据加载失败，请重试'
          records.value = []
          updateStats()
        }
      }
    )

    if (!response?.success) {
      throw new Error(response?.error || '获取数据失败')
    }

    records.value = response.records
    loadError.value = null
    updateStats()
  } catch (error) {
    records.value = []
    updateStats()
    loadError.value = '数据加载失败，请重试'
  } finally {
    if (loadTimeout) {
      clearTimeout(loadTimeout)
      loadTimeout = null
    }
    loading.value = false
  }
}

function updateStats() {
  let movie = 0
  let tv = 0
  let music = 0

  for (const record of records.value) {
    switch (record.type) {
      case 'movie': movie++; break
      case 'tv': tv++; break
      case 'music': music++; break
    }
  }

  stats.value = {
    total: records.value.length,
    movie,
    tv,
    music,
  }
}

let refreshTimer: ReturnType<typeof setTimeout> | null = null
function handleRefresh() {
  if (refreshTimer) {
    clearTimeout(refreshTimer)
  }

  refreshTimer = setTimeout(() => {
    loadData()
    refreshTimer = null
  }, 300)
}

// ==================== 主题配置 ====================
const currentTheme = ref<'light' | 'dark' | 'auto'>('auto')

function applyTheme(theme: 'light' | 'dark' | 'auto') {
  if (theme === 'auto') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    if (prefersDark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  } else if (theme === 'dark') {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
  currentTheme.value = theme
}

const themeLabel = computed(() => {
  switch (currentTheme.value) {
    case 'light': return '亮色'
    case 'dark': return '暗色'
    case 'auto': return '跟随系统'
    default: return '未知'
  }
})

function toggleTheme() {
  if (currentTheme.value === 'light') {
    applyTheme('dark')
  } else if (currentTheme.value === 'dark') {
    applyTheme('auto')
  } else {
    applyTheme('light')
  }

  if (chrome.storage?.local) {
    chrome.storage.local.set({
      [MISC_KEYS.SETTINGS_NESTED]: {
        appearance: currentTheme.value
      }
    })
  }
}

// ==================== 导航 ====================
function navigateTo(page: Page) {
  router.push('/' + (page === 'records' ? '' : page))
}

// ==================== 确认对话框 ====================
const { state: confirmDialog, handleConfirmAction } = useConfirmDialog()

// ==================== provide 共享数据 ====================
provide('loading', loading)
provide('loadError', loadError)
provide('records', records)
provide('stats', stats)
provide('loadData', loadData)
provide('handleRefresh', handleRefresh)

// ==================== 生命周期 ====================
onMounted(() => {
  if (chrome.storage?.local) {
    chrome.storage.local.get([MISC_KEYS.SETTINGS_NESTED], (result: any) => {
      if (result[MISC_KEYS.SETTINGS_NESTED]?.appearance) {
        applyTheme(result.settings.appearance)
      } else {
        applyTheme('auto')
      }
    })
  } else {
    applyTheme('auto')
  }

  loadData()

  let isHandlingStorageChange = false

  const storageListener = (changes: any, namespace: string) => {
    if (isHandlingStorageChange) return

    if (namespace === 'local' && changes[MISC_KEYS.DATA_VERSION]) {
      isHandlingStorageChange = true
      loadData().finally(() => {
        isHandlingStorageChange = false
      })
    }
    if (namespace === 'local' && changes.umm_data_changed) {
      isHandlingStorageChange = true
      loadData().finally(() => {
        isHandlingStorageChange = false
      })
    }
  }

  if (chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener(storageListener)
  }

  onUnmounted(() => {
    if (chrome.storage?.onChanged) {
      chrome.storage.onChanged.removeListener(storageListener)
    }

    if (refreshTimer) {
      clearTimeout(refreshTimer)
      refreshTimer = null
    }

    if (loadTimeout) {
      clearTimeout(loadTimeout)
      loadTimeout = null
    }
  })
})
</script>

<template>
  <div class="flex flex-col bg-background text-foreground" style="width: 600px; height: 500px;">
    <header class="border-b border-border px-4 py-3">
      <div class="flex items-center justify-between">
        <h1 class="text-xl font-semibold tracking-tight">UMM 媒体管理器</h1>
        <Button
          variant="ghost"
          size="icon"
          @click="toggleTheme"
          :title="`当前主题: ${themeLabel}`"
        >
          <Sun v-if="currentTheme === 'light'" class="h-5 w-5" />
          <Moon v-else-if="currentTheme === 'dark'" class="h-5 w-5" />
          <RefreshCw v-else class="h-5 w-5" />
        </Button>
      </div>

      <nav class="mt-3 flex gap-2">
        <Button
          v-for="page in pages"
          :key="page.id"
          variant="outline"
          :class="{ 'bg-primary text-primary-foreground': currentPage === page.id }"
          @click="navigateTo(page.id)"
          class="flex-1"
        >
          <component :is="page.icon" class="mr-2 h-4 w-4" />
          {{ page.label }}
        </Button>
      </nav>
    </header>

    <main class="flex-1 overflow-y-auto p-4">
      <RouterView />
    </main>

    <footer class="border-t border-border px-4 py-2 text-xs font-medium text-muted-foreground">
      <div class="flex items-center justify-between">
        <span>v{{ appVersion }}</span>
        <span>{{ records.length }} 条记录</span>
      </div>
    </footer>

    <Dialog v-model:open="confirmDialog.open">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle class="flex items-center gap-2">
            <component :is="confirmDialog.icon" class="h-5 w-5" />
            {{ confirmDialog.title }}
          </DialogTitle>
          <DialogDescription>
            {{ confirmDialog.description }}
          </DialogDescription>
        </DialogHeader>

        <div class="py-4">
          <Alert v-if="confirmDialog.warning" variant="destructive">
            <XCircle class="h-4 w-4" />
            <AlertTitle>警告</AlertTitle>
            <AlertDescription>{{ confirmDialog.warning }}</AlertDescription>
          </Alert>

          <p v-if="confirmDialog.details" class="text-sm text-muted-foreground mt-3">
            {{ confirmDialog.details }}
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            @click="confirmDialog.open = false"
            :disabled="confirmDialog.loading"
          >
            取消
          </Button>
          <Button
            @click="handleConfirmAction"
            :disabled="confirmDialog.loading"
          >
            <RefreshCw v-if="confirmDialog.loading" class="mr-2 h-4 w-4 animate-spin" />
            {{ confirmDialog.confirmText || '确认' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<style scoped>
</style>
