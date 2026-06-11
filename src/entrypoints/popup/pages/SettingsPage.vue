<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick, inject } from 'vue'
import { Store } from '@/features/database'
import type { AppSettings } from '@/types'
import { safeSendMessage } from '@/utils/context'
import { useConfirmDialog } from '../useConfirmDialog'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RefreshCw, Download, Upload } from 'lucide-vue-next'

const loadData = inject<() => Promise<void>>('loadData', async () => {})

const { showConfirmDialog } = useConfirmDialog()

function showPageToast(type: 'success' | 'error' | 'info' | 'loading', title: string, message?: string) {
  try {
    chrome.runtime.sendMessage(
      { type: 'SHOW_TOAST', payload: { type, title, message } },
      () => { void chrome.runtime.lastError }
    )
  } catch (error) {
    // 静默失败
  }
}

const webdavConfig = ref({
  url: '',
  username: '',
  password: '',
})

const neodbToken = ref('')
const autoSyncNeoDB = ref(false)
const isConfigSaved = ref(false)

const webdavLoading = ref({
  sync: false,
  download: false,
  upload: false,
  import: false,
})

const isAnyWebDAVOperationRunning = computed(() => {
  return Object.values(webdavLoading.value).some(loading => loading)
})

const debugEnabled = ref(false)
const logLevel = ref<AppSettings['logLevel']>('info')

const LOG_LEVEL_OPTIONS = [
  { value: 'debug', label: 'Debug', description: '显示所有日志' },
  { value: 'info', label: 'Info', description: '信息及以上' },
  { value: 'warn', label: 'Warn', description: '警告及以上' },
  { value: 'error', label: 'Error', description: '仅错误' },
] as const

async function loadSettings() {
  try {
    const settings = await Store.getSettings()

    neodbToken.value = settings.neodbToken || ''
    autoSyncNeoDB.value = settings.autoSyncNeoDB ?? false

    webdavConfig.value = {
      url: settings.webdavUrl || '',
      username: settings.webdavUsername || '',
      password: settings.webdavPassword || '',
    }

    isConfigSaved.value = !!(settings.webdavUrl && settings.webdavUsername && settings.webdavPassword)

    debugEnabled.value = settings.debugEnabled ?? false
    logLevel.value = settings.logLevel ?? 'info'

    await nextTick()
    autoSyncNeoDBInitialized = true
    debugInitialized = true
  } catch (error) {
    console.error('[Popup] Failed to load settings:', error)
  }
}

onMounted(() => {
  loadSettings()
})

async function saveWebDAVConfig() {
  if (webdavConfig.value.url && !webdavConfig.value.url.startsWith('https://')) {
    await showPageToast('error', 'URL 必须使用 HTTPS', '为保证安全，WebDAV URL 必须使用 HTTPS 协议')
    return
  }

  try {
    await Store.updateSettings({
      webdavUrl: webdavConfig.value.url,
      webdavUsername: webdavConfig.value.username,
      webdavPassword: webdavConfig.value.password,
    })

    const verifySettings = await Store.getSettings()

    if (!verifySettings.webdavUrl || !verifySettings.webdavUsername || !verifySettings.webdavPassword) {
      throw new Error('配置保存验证失败，请重试')
    }

    isConfigSaved.value = true

    await showPageToast('success', '配置已保存', 'WebDAV 云同步功能现已可用')
  } catch (error) {
    console.error('Failed to save WebDAV config:', error)
    isConfigSaved.value = false
    await showPageToast('error', '保存失败', String(error))
  }
}

async function testWebDAVConnection() {
  try {
    if (!webdavConfig.value.url) {
      await showPageToast('error', '请输入 WebDAV URL')
      return
    }

    if (!webdavConfig.value.url.startsWith('https://')) {
      await showPageToast('error', 'URL 必须使用 HTTPS', '为保证安全，WebDAV URL 必须使用 HTTPS 协议')
      return
    }

    const result = await safeSendMessage(
      {
        type: 'WEBDAV_TEST',
        payload: webdavConfig.value,
      },
      {
        timeout: 10000,
        fallback: () => {
          showPageToast('error', '扩展上下文已失效，请重新打开 Popup')
        }
      }
    )

    if (!result) return

    if (result.success) {
      await showPageToast('success', 'WebDAV 连接成功', '服务器响应正常')
    } else {
      await showPageToast('error', 'WebDAV 连接失败', result.message || '请检查 URL、用户名和密码是否正确')
    }
  } catch (error) {
    await showPageToast('error', '测试失败', String(error))
  }
}

async function saveNeoDBToken() {
  try {
    const token = neodbToken.value.trim()
    await Store.updateSettings({ neodbToken: token })
    await showPageToast('success', 'NeoDB Token 已保存', '评分同步功能现已激活')
  } catch (error) {
    console.error('Failed to save NeoDB token:', error)
    await showPageToast('error', '保存失败', String(error))
  }
}

let autoSyncNeoDBSaving = false
let autoSyncNeoDBInitialized = false
watch(autoSyncNeoDB, async (newVal) => {
  if (!autoSyncNeoDBInitialized) {
    autoSyncNeoDBInitialized = true
    return
  }
  if (autoSyncNeoDBSaving) return
  autoSyncNeoDBSaving = true
  try {
    await Store.updateSettings({ autoSyncNeoDB: newVal })
    if (newVal) {
      await showPageToast('success', '已开启自动同步到 NeoDB', '豆瓣页面首次检测到已看/听时将自动推送评分')
    } else {
      await showPageToast('info', '已关闭自动同步到 NeoDB')
    }
  } catch (error) {
    console.error('Failed to save autoSyncNeoDB:', error)
    await showPageToast('error', '保存失败', String(error))
  } finally {
    autoSyncNeoDBSaving = false
  }
})

let debugSaving = false
let debugInitialized = false
watch([debugEnabled, logLevel], async ([newEnabled, newLevel]) => {
  if (!debugInitialized) {
    debugInitialized = true
    return
  }
  if (debugSaving) return
  debugSaving = true
  try {
    await Store.updateSettings({
      debugEnabled: newEnabled,
      logLevel: newLevel,
    })
    if (newEnabled) {
      await showPageToast('success', '日志已开启', `日志级别: ${newLevel}`)
    } else {
      await showPageToast('info', '日志已关闭')
    }
  } catch (error) {
    console.error('Failed to save debug settings:', error)
    await showPageToast('error', '保存失败', String(error))
  } finally {
    debugSaving = false
  }
})

async function exportData() {
  try {
    await showPageToast('info', '正在准备导出数据...')

    const response = await safeSendMessage(
      { type: 'EXPORT_DATA' },
      {
        timeout: 30000,
        fallback: () => {
          showPageToast('error', '扩展上下文已失效，请重新打开 Popup')
        }
      }
    )

    if (!response?.success) {
      throw new Error(response?.error || '导出失败')
    }

    await showPageToast('info', '正在生成文件...')

    const jsonString = JSON.stringify(response.data, null, 2)
    const blob = new Blob([jsonString], { type: 'application/json' })
    const url = URL.createObjectURL(blob)

    const a = document.createElement('a')
    a.href = url
    a.download = `umm-backup-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    await showPageToast('success', '导出成功！')
  } catch (error) {
    console.error('[Popup] Export failed:', error)
    await showPageToast('error', '导出失败', String(error))
  }
}

function triggerImport() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        const payload = JSON.parse(event.target?.result as string)

        let recordCount = 0
        if (payload.stores) {
          for (const storeName in payload.stores) {
            recordCount += Object.keys(payload.stores[storeName]).length
          }
        } else if (payload.datasets) {
          for (const provider in payload.datasets) {
            for (const type in payload.datasets[provider]) {
              recordCount += payload.datasets[provider][type].length
            }
          }
        }

        showConfirmDialog({
          title: '导入数据',
          description: `即将导入 ${recordCount.toLocaleString()} 条记录。`,
          warning: '导入的数据将与现有数据合并，相同 ID 的记录将被覆盖。',
          details: `文件名: ${file.name}`,
          icon: Upload,
          confirmText: '开始导入',
          action: () => executeImport(file, payload),
        })
      } catch (error) {
        await showPageToast('error', '文件解析失败', String(error))
      }
    }
    reader.onerror = () => {
      showPageToast('error', '文件读取失败', '请检查文件格式是否正确')
    }
    reader.readAsText(file)
  }
  input.click()
}

async function executeImport(file: File, payload: any) {
  webdavLoading.value.import = true

  try {
    await showPageToast('info', `正在读取文件: ${file.name}...`)
    await showPageToast('info', '正在解析数据...')

    let importPayload = payload
    if (payload.datasets && !payload.stores) {
      const stores: Record<string, Record<string, any>> = {}
      for (const provider of ['douban', 'imdb', 'neodb', 'tmdb']) {
        const storeName = `${provider}_records`
        if (payload.datasets[provider]) {
          stores[storeName] = {}
          for (const type of Object.keys(payload.datasets[provider])) {
            for (const record of payload.datasets[provider][type]) {
              const key = `${type}::${record.providerId || record.id}`
              stores[storeName][key] = {
                url: record.url || '',
                status: record.status ?? 1,
                rating: record.rating ?? null,
                updatedAt: record.updatedAt || record.updatedAt || new Date().toISOString(),
                linkedIds: record.linkedIds || {},
              }
            }
          }
        }
      }
      importPayload = { stores }
    }

    let recordCount = 0
    for (const storeName in importPayload.stores || {}) {
      recordCount += Object.keys(importPayload.stores[storeName]).length
    }
    await showPageToast('info', `正在导入 ${recordCount.toLocaleString()} 条记录...`)

    await safeSendMessage(
      {
        type: 'IMPORT_DATA',
        payload: importPayload,
      },
      {
        timeout: 30000,
        fallback: () => {
          showPageToast('error', '扩展上下文已失效，请重新打开 Popup')
        }
      }
    )

    await showPageToast('success', '导入成功', `共导入 ${recordCount.toLocaleString()} 条记录`)
    loadData()
  } catch (error) {
    await showPageToast('error', '导入失败', String(error))
  } finally {
    webdavLoading.value.import = false
  }
}

async function syncWithCloud() {
  if (!isConfigSaved.value) {
    await showPageToast('error', '配置未保存', '请先在设置中保存 WebDAV 配置')
    return
  }

  showConfirmDialog({
    title: '智能合并同步',
    description: '将对比本地和云端数据，自动同步有变化的部分。',
    details: '此操作会比较各数据集的哈希值，仅传输有变化的数据。',
    icon: RefreshCw,
    confirmText: '开始同步',
    action: executeSyncWithCloud,
  })
}

async function executeSyncWithCloud() {
  webdavLoading.value.sync = true

  try {
    await showPageToast('info', '正在连接 WebDAV 服务器...')

    const result = await safeSendMessage(
      { type: 'WEBDAV_SYNC' },
      {
        timeout: 30000,
        fallback: () => {
          showPageToast('error', '扩展上下文已失效', '请重新打开 Popup')
        }
      }
    )

    if (!result) return

    if (result.success) {
      const directionMap: Record<string, string> = {
        upload: '上传',
        download: '下载',
        merge: '合并'
      }
      const direction = directionMap[result.direction] || '同步'
      await showPageToast('success', '同步成功', result.message || `已${direction}数据`)
      loadData()
    } else {
      await showPageToast('error', '同步失败', result.message)
    }
  } catch (error) {
    await showPageToast('error', '同步失败', String(error))
  } finally {
    webdavLoading.value.sync = false
  }
}

async function downloadFromCloud() {
  if (!isConfigSaved.value) {
    await showPageToast('error', '配置未保存', '请先在设置中保存 WebDAV 配置')
    return
  }

  showConfirmDialog({
    title: '云端覆盖本地',
    description: '将用云端数据完全覆盖本地数据。',
    warning: '此操作不可逆！本地的所有修改将丢失。',
    details: '建议先导出本地数据作为备份。',
    icon: Download,
    confirmText: '确认覆盖',
    action: executeDownloadFromCloud,
  })
}

async function executeDownloadFromCloud() {
  webdavLoading.value.download = true

  try {
    await showPageToast('info', '正在从云端下载数据...')

    const result = await safeSendMessage(
      { type: 'WEBDAV_DOWNLOAD' },
      { timeout: 30000 }
    )

    if (!result) return

    if (result.success) {
      await showPageToast('success', '下载成功', result.message)
      loadData()
    } else {
      await showPageToast('error', '下载失败', result.message)
    }
  } catch (error) {
    await showPageToast('error', '下载失败', String(error))
  } finally {
    webdavLoading.value.download = false
  }
}

async function uploadToCloud() {
  if (!isConfigSaved.value) {
    await showPageToast('error', '配置未保存', '请先在设置中保存 WebDAV 配置')
    return
  }

  showConfirmDialog({
    title: '本地覆盖云端',
    description: '将用本地数据完全覆盖云端数据。',
    warning: '此操作不可逆！云端的所有修改将丢失。',
    details: '请确认这是您想要的操作。',
    icon: Upload,
    confirmText: '确认覆盖',
    action: executeUploadToCloud,
  })
}

async function executeUploadToCloud() {
  webdavLoading.value.upload = true

  try {
    await showPageToast('info', '正在上传数据到云端...')

    const result = await safeSendMessage(
      { type: 'WEBDAV_UPLOAD' },
      { timeout: 30000 }
    )

    if (!result) return

    if (result.success) {
      await showPageToast('success', '上传成功', result.message)
      loadData()
    } else {
      await showPageToast('error', '上传失败', result.message)
    }
  } catch (error) {
    await showPageToast('error', '上传失败', String(error))
  } finally {
    webdavLoading.value.upload = false
  }
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>设置与同步</CardTitle>
      <CardDescription>配置 WebDAV 和数据管理</CardDescription>
    </CardHeader>
    <CardContent>
      <div class="space-y-6">
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-semibold">WebDAV 配置</h3>
            <Badge v-if="isConfigSaved" variant="default" class="bg-green-500">
              已保存
            </Badge>
            <Badge v-else variant="outline" class="text-orange-500 border-orange-500">
              未保存
            </Badge>
          </div>

          <div>
            <Label for="webdav-url" class="font-medium">服务器地址</Label>
            <Input
              id="webdav-url"
              v-model="webdavConfig.url"
              placeholder="https://example.com/dav/"
              class="mt-2"
            />
          </div>

          <div>
            <Label for="webdav-username" class="font-medium">用户名</Label>
            <Input
              id="webdav-username"
              v-model="webdavConfig.username"
              class="mt-2"
            />
          </div>

          <div>
            <Label for="webdav-password" class="font-medium">密码</Label>
            <Input
              id="webdav-password"
              v-model="webdavConfig.password"
              type="password"
              class="mt-2"
            />
          </div>

          <div class="flex gap-2">
            <Button @click="saveWebDAVConfig" class="flex-1 font-medium">
              保存配置
            </Button>
            <Button @click="testWebDAVConnection" variant="outline" class="flex-1 font-medium">
              测试连接
            </Button>
          </div>
        </div>

        <Separator />

        <div class="space-y-4">
          <h3 class="text-sm font-semibold">数据管理</h3>

          <div class="grid grid-cols-2 gap-3">
            <Button
              @click="exportData"
              variant="outline"
              :disabled="isAnyWebDAVOperationRunning"
            >
              <Download class="mr-2 h-4 w-4" />
              导出数据
            </Button>
            <Button
              @click="triggerImport"
              variant="outline"
              :disabled="isAnyWebDAVOperationRunning"
            >
              <RefreshCw v-if="webdavLoading.import" class="mr-2 h-4 w-4 animate-spin" />
              <Upload v-else class="mr-2 h-4 w-4" />
              {{ webdavLoading.import ? '导入中...' : '导入数据' }}
            </Button>
          </div>

          <div class="space-y-2">
            <Button
              @click="downloadFromCloud"
              variant="outline"
              class="w-full"
              :disabled="!isConfigSaved || isAnyWebDAVOperationRunning"
            >
              <RefreshCw v-if="webdavLoading.download" class="mr-2 h-4 w-4 animate-spin" />
              <Download v-else class="mr-2 h-4 w-4" />
              {{ webdavLoading.download ? '下载中...' : '云端覆盖本地' }}
            </Button>
            <Button
              @click="uploadToCloud"
              variant="outline"
              class="w-full"
              :disabled="!isConfigSaved || isAnyWebDAVOperationRunning"
            >
              <RefreshCw v-if="webdavLoading.upload" class="mr-2 h-4 w-4 animate-spin" />
              <Upload v-else class="mr-2 h-4 w-4" />
              {{ webdavLoading.upload ? '上传中...' : '本地覆盖云端' }}
            </Button>
            <Button
              @click="syncWithCloud"
              class="w-full"
              :disabled="!isConfigSaved || isAnyWebDAVOperationRunning"
            >
              <RefreshCw v-if="webdavLoading.sync" class="mr-2 h-4 w-4 animate-spin" />
              <RefreshCw v-else class="mr-2 h-4 w-4" />
              {{ webdavLoading.sync ? '同步中...' : '智能合并同步' }}
            </Button>
          </div>
        </div>

        <Separator />

        <div class="space-y-4">
          <h3 class="text-sm font-semibold">NeoDB 配置</h3>

          <div>
            <Label for="neodb-token" class="font-medium">API Token</Label>
            <Input
              id="neodb-token"
              v-model="neodbToken"
              type="password"
              placeholder="请输入您的 NeoDB API Token"
              class="mt-2"
            />
            <p class="text-xs text-muted-foreground mt-2">
              用于同步评分到 NeoDB，可在 NeoDB 个人中心获取
            </p>
          </div>

          <Button @click="saveNeoDBToken" class="w-full font-medium">
            保存 Token
          </Button>

          <div v-if="neodbToken.trim()" class="flex items-center justify-between rounded-lg border p-3">
            <div class="space-y-0.5">
              <Label class="font-medium">自动同步到 NeoDB</Label>
              <p class="text-xs text-muted-foreground">
                豆瓣页面首次写入时自动推送评分
              </p>
            </div>
            <button
              type="button"
              role="switch"
              :aria-checked="autoSyncNeoDB"
              :class="[
                'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50',
                autoSyncNeoDB ? 'bg-primary' : 'bg-input'
              ]"
              @click="autoSyncNeoDB = !autoSyncNeoDB"
            >
              <span
                :class="[
                  'pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform',
                  autoSyncNeoDB ? 'translate-x-5' : 'translate-x-0'
                ]"
              />
            </button>
          </div>
        </div>

        <Separator />

        <div class="space-y-4">
          <h3 class="text-sm font-semibold">调试日志</h3>

          <div class="flex items-center justify-between rounded-lg border p-3">
            <div class="space-y-0.5">
              <Label class="font-medium">启用日志</Label>
              <p class="text-xs text-muted-foreground">
                开启后将在控制台输出调试信息
              </p>
            </div>
            <button
              type="button"
              role="switch"
              :aria-checked="debugEnabled"
              :class="[
                'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50',
                debugEnabled ? 'bg-primary' : 'bg-input'
              ]"
              @click="debugEnabled = !debugEnabled"
            >
              <span
                :class="[
                  'pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform',
                  debugEnabled ? 'translate-x-5' : 'translate-x-0'
                ]"
              />
            </button>
          </div>

          <div v-if="debugEnabled" class="space-y-2">
            <Label class="font-medium">日志级别</Label>
            <Select v-model="logLevel">
              <SelectTrigger class="w-full">
                <SelectValue placeholder="选择日志级别" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="opt in LOG_LEVEL_OPTIONS"
                  :key="opt.value"
                  :value="opt.value"
                >
                  {{ opt.label }} — {{ opt.description }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
