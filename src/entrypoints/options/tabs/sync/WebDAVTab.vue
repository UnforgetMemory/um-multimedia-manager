<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Store } from '@/features/database'
import { STORAGE_KEYS } from '@/config'
import { safeSendMessage } from '@/utils/context'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { RefreshCw, Download, Upload } from 'lucide-vue-next'
import { useConfirmStore } from '@/stores/confirm'
import { useToast } from '@/composables/useToast'

const { t } = useI18n()
const toast = useToast()
const { show } = useConfirmStore()

const webdavConfig = ref({ url: '', username: '', password: '' })
const isConfigSaved = ref(false)
const loading = ref({ sync: false, download: false, upload: false })

const isAnyRunning = computed(() => Object.values(loading.value).some(v => v))

let webdavOnChangedUnsub: (() => void) | null = null

onMounted(async () => {
  const settings = await Store.getSettings()
  webdavConfig.value = { url: settings.webdavUrl || '', username: settings.webdavUsername || '', password: settings.webdavPassword || '' }
  isConfigSaved.value = !!(settings.webdavUrl && settings.webdavUsername && settings.webdavPassword)

  // Sync WebDAV config across tabs
  const onChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== 'local') return
    const relevant = [STORAGE_KEYS.WEBDAV_URL, STORAGE_KEYS.WEBDAV_USERNAME, STORAGE_KEYS.WEBDAV_PASSWORD]
    if (!relevant.some(k => k in changes)) return
    chrome.storage.local.get([STORAGE_KEYS.WEBDAV_URL, STORAGE_KEYS.WEBDAV_USERNAME, STORAGE_KEYS.WEBDAV_PASSWORD]).then(result => {
      webdavConfig.value = {
        url: (result[STORAGE_KEYS.WEBDAV_URL] as string) || '',
        username: (result[STORAGE_KEYS.WEBDAV_USERNAME] as string) || '',
        password: (result[STORAGE_KEYS.WEBDAV_PASSWORD] as string) || '',
      }
      isConfigSaved.value = !!(result[STORAGE_KEYS.WEBDAV_URL] && result[STORAGE_KEYS.WEBDAV_USERNAME] && result[STORAGE_KEYS.WEBDAV_PASSWORD])
    })
  }
  chrome.storage.onChanged.addListener(onChange)
  webdavOnChangedUnsub = () => { chrome.storage.onChanged.removeListener(onChange) }
})

onUnmounted(() => {
  webdavOnChangedUnsub?.()
})

async function saveConfig() {
  if (webdavConfig.value.url && !webdavConfig.value.url.startsWith('https://')) { toast.error(t('validation.httpsRequired')); return }
  try {
    await Store.updateSettings({ webdavUrl: webdavConfig.value.url, webdavUsername: webdavConfig.value.username, webdavPassword: webdavConfig.value.password })
    isConfigSaved.value = true
    toast.success(t('toast.configSaved'))
  } catch (e) { isConfigSaved.value = false; toast.error(t('toast.saveFailed'), String(e)) }
}

async function testConnection() {
  if (!webdavConfig.value.url) { toast.error(t('validation.webdavUrlRequired')); return }
  if (!webdavConfig.value.url.startsWith('https://')) { toast.error(t('validation.httpsRequired')); return }
  const result = await safeSendMessage({ type: 'WEBDAV_TEST', payload: webdavConfig.value }, { timeout: 10000 })
  if (result?.success) toast.success(t('toast.connectionSuccess')); else toast.error(t('toast.connectionFailed'), result?.message)
}

async function syncCloud() {
  if (!isConfigSaved.value) { toast.error(t('validation.saveConfigFirst')); return }
  show({
    title: t('sync.smartMerge'),
    description: t('sync.smartMergeDesc'),
    icon: RefreshCw,
    confirmText: t('sync.startSync'),
    action: async () => {
      loading.value.sync = true
      try {
        const r = await safeSendMessage({ type: 'WEBDAV_SYNC' }, { timeout: 30000 })
        if (r?.success) toast.success(t('toast.syncSuccess'), r.message)
        else toast.error(t('toast.syncFailed'), r?.message)
      } catch (e) { toast.error(t('toast.syncFailed'), String(e)) } finally { loading.value.sync = false }
    },
  })
}

async function downloadCloud() {
  if (!isConfigSaved.value) { toast.error(t('validation.saveConfigFirst')); return }
  show({
    title: t('sync.cloudOverwrite'),
    description: t('sync.cloudOverwriteDesc'),
    warning: t('sync.irreversible'),
    icon: Download,
    confirmText: t('sync.confirmOverwrite'),
    action: async () => {
      loading.value.download = true
      try {
        const r = await safeSendMessage({ type: 'WEBDAV_DOWNLOAD' }, { timeout: 30000 })
        if (r?.success) toast.success(t('sync.downloadSuccess'), r.message)
        else toast.error(t('sync.downloadFailed'), r?.message)
      } catch (e) { toast.error(t('sync.downloadFailed'), String(e)) } finally { loading.value.download = false }
    },
  })
}

async function uploadCloud() {
  if (!isConfigSaved.value) { toast.error(t('validation.saveConfigFirst')); return }
  show({
    title: t('sync.localOverwrite'),
    description: t('sync.localOverwriteDesc'),
    warning: t('sync.irreversible'),
    icon: Upload,
    confirmText: t('sync.confirmOverwrite'),
    action: async () => {
      loading.value.upload = true
      try {
        const r = await safeSendMessage({ type: 'WEBDAV_UPLOAD' }, { timeout: 30000 })
        if (r?.success) toast.success(t('sync.uploadSuccess'), r.message)
        else toast.error(t('sync.uploadFailed'), r?.message)
      } catch (e) { toast.error(t('sync.uploadFailed'), String(e)) } finally { loading.value.upload = false }
    },
  })
}
</script>

<template>
  <div class="space-y-[var(--section-gap)]">
    <div>
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-h2 text-primary-content">{{ t('settings.webdav') }}</h3>
        <Badge v-if="isConfigSaved" variant="default" class="bg-green-500">{{ t('toast.configSaved') }}</Badge>
        <Badge v-else variant="outline" class="text-orange-500 border-orange-500">{{ t('common.unsaved') }}</Badge>
      </div>
      <div class="space-y-4">
        <div><Label>{{ t('common.serverUrl') }}</Label><Input v-model="webdavConfig.url" placeholder="https://example.com/dav/" class="mt-2" /></div>
        <div><Label>{{ t('common.username') }}</Label><Input v-model="webdavConfig.username" class="mt-2" /></div>
        <div><Label>{{ t('common.password') }}</Label><Input v-model="webdavConfig.password" type="password" class="mt-2" /></div>
        <div class="flex gap-2">
          <Button @click="saveConfig" class="flex-1">{{ t('common.saveConfig') }}</Button>
          <Button @click="testConnection" variant="outline" class="flex-1">{{ t('common.testConnection') }}</Button>
        </div>
      </div>
    </div>

    <Separator />

    <div>
      <h3 class="font-h2 text-primary-content mb-4">{{ t('sync.smartMerge') }}</h3>
      <div class="space-y-2">
        <Button @click="downloadCloud" variant="outline" class="w-full" :disabled="!isConfigSaved || isAnyRunning">
          <RefreshCw v-if="loading.download" class="mr-2 h-4 w-4 animate-spin" /><Download v-else class="mr-2 h-4 w-4" />
          {{ loading.download ? t('common.downloading') : t('sync.cloudOverwrite') }}
        </Button>
        <Button @click="uploadCloud" variant="outline" class="w-full" :disabled="!isConfigSaved || isAnyRunning">
          <RefreshCw v-if="loading.upload" class="mr-2 h-4 w-4 animate-spin" /><Upload v-else class="mr-2 h-4 w-4" />
          {{ loading.upload ? t('common.uploading') : t('sync.localOverwrite') }}
        </Button>
        <Button @click="syncCloud" class="w-full" :disabled="!isConfigSaved || isAnyRunning">
          <RefreshCw :class="['mr-2 h-4 w-4', loading.sync && 'animate-spin']" />
          {{ loading.sync ? t('common.syncing') : t('sync.smartMerge') }}
        </Button>
      </div>
    </div>
  </div>
</template>
