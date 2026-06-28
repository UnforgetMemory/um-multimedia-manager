<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Store } from '@/features/database'
import { STORAGE_KEYS } from '@/config'
import { safeSendMessage } from '@/utils/context'
import { useI18n } from 'vue-i18n'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Badge } from '@/shared/ui/badge'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { RefreshCw, Download, Upload } from 'lucide-vue-next'
import { useConfirmStore } from '@/stores/confirm'
import { useToast } from '@/composables/useToast'
import SectionContainer from '@/shared/ui/section-container/SectionContainer.vue'
import SectionHeader from '@/shared/ui/section-header/SectionHeader.vue'
import FormField from '@/shared/ui/form-field/FormField.vue'
import LoadingButton from '@/shared/ui/loading-button/LoadingButton.vue'

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
    webdavConfig.value = {
      url: (changes[STORAGE_KEYS.WEBDAV_URL]?.newValue as string) ?? webdavConfig.value.url,
      username: (changes[STORAGE_KEYS.WEBDAV_USERNAME]?.newValue as string) ?? webdavConfig.value.username,
      password: (changes[STORAGE_KEYS.WEBDAV_PASSWORD]?.newValue as string) ?? webdavConfig.value.password,
    }
    isConfigSaved.value = !!(webdavConfig.value.url && webdavConfig.value.username && webdavConfig.value.password)
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
  <SectionContainer>
    <Card>
      <CardHeader class="umm:pb-3">
        <div class="umm:flex umm:items-center umm:justify-between">
          <SectionHeader :title="t('settings.webdav')" />
          <Badge v-if="isConfigSaved" variant="default" class="umm:bg-state-success">{{ t('toast.configSaved') }}</Badge>
          <Badge v-else variant="outline" class="umm:text-orange-500 umm:border-orange-500">{{ t('common.unsaved') }}</Badge>
        </div>
      </CardHeader>
      <CardContent class="umm:flex umm:flex-col umm:gap-4">
        <FormField :label="t('common.serverUrl')">
          <Input v-model="webdavConfig.url" placeholder="https://example.com/dav/" />
        </FormField>
        <FormField :label="t('common.username')">
          <Input v-model="webdavConfig.username" />
        </FormField>
        <FormField :label="t('common.password')">
          <Input v-model="webdavConfig.password" type="password" />
        </FormField>
        <div class="umm:flex umm:gap-2">
          <Button @click="saveConfig" class="umm:flex-1">{{ t('common.saveConfig') }}</Button>
          <Button @click="testConnection" variant="outline" class="umm:flex-1">{{ t('common.testConnection') }}</Button>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader class="umm:pb-3">
        <SectionHeader :title="t('sync.smartMerge')" />
      </CardHeader>
      <CardContent class="umm:flex umm:flex-col umm:gap-2">
        <LoadingButton
          :icon="Download"
          :label="t('sync.cloudOverwrite')"
          :loading="loading.download"
          :loading-label="t('common.downloading')"
          variant="outline"
          class="umm:w-full"
          :disabled="!isConfigSaved || isAnyRunning"
          @click="downloadCloud"
        />
        <LoadingButton
          :icon="Upload"
          :label="t('sync.localOverwrite')"
          :loading="loading.upload"
          :loading-label="t('common.uploading')"
          variant="outline"
          class="umm:w-full"
          :disabled="!isConfigSaved || isAnyRunning"
          @click="uploadCloud"
        />
        <LoadingButton
          :icon="RefreshCw"
          :label="t('sync.smartMerge')"
          :loading="loading.sync"
          :loading-label="t('common.syncing')"
          class="umm:w-full"
          :disabled="!isConfigSaved || isAnyRunning"
          @click="syncCloud"
        />
      </CardContent>
    </Card>
  </SectionContainer>
</template>
