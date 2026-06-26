<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { Store } from '@/features/database'
import { STORAGE_KEYS } from '@/config'
import { useI18n } from 'vue-i18n'
import type { AppSettings } from '@/types'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { Switch } from '@/shared/ui/switch'
import { Separator } from '@/shared/ui/separator'
import { useToast } from '@/composables/useToast'
import SectionContainer from '@/shared/ui/section-container/SectionContainer.vue'
import SectionHeader from '@/shared/ui/section-header/SectionHeader.vue'
import FormField from '@/shared/ui/form-field/FormField.vue'

const { t } = useI18n()
const toast = useToast()

const neodbToken = ref('')
const autoSyncNeoDB = ref(false)
const debugEnabled = ref(false)
const logLevel = ref<AppSettings['logLevel']>('info')
const LOG_LEVEL_OPTIONS = [
  { value: 'debug', label: 'Debug', descKey: 'settings.logDebugDesc' as const },
  { value: 'info', label: 'Info', descKey: 'settings.logInfoDesc' as const },
  { value: 'warn', label: 'Warn', descKey: 'settings.logWarnDesc' as const },
  { value: 'error', label: 'Error', descKey: 'settings.logErrorDesc' as const },
] as const

let autoSyncInitialized = false
let debugInitialized = false
let syncingFromStorage = false
let settingsChangedUnsub: (() => void) | null = null

onMounted(async () => {
  const settings = await Store.getSettings()
  neodbToken.value = settings.neodbToken || ''
  autoSyncNeoDB.value = settings.autoSyncNeoDB ?? false
  debugEnabled.value = settings.debugEnabled ?? false
  logLevel.value = settings.logLevel ?? 'info'
  await nextTick()
  autoSyncInitialized = true
  debugInitialized = true

  // Sync settings across tabs
  const onChange = async (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== 'local') return
    const relevant = [STORAGE_KEYS.NEODB_TOKEN, STORAGE_KEYS.AUTO_SYNC_NEO_DB, STORAGE_KEYS.DEBUG_ENABLED, STORAGE_KEYS.LOG_LEVEL]
    if (!relevant.some(k => k in changes)) return
    syncingFromStorage = true
    if (STORAGE_KEYS.NEODB_TOKEN in changes) {
      const v = changes[STORAGE_KEYS.NEODB_TOKEN].newValue
      neodbToken.value = (typeof v === 'string' ? v : '')
    }
    if (STORAGE_KEYS.AUTO_SYNC_NEO_DB in changes) {
      const v = changes[STORAGE_KEYS.AUTO_SYNC_NEO_DB].newValue
      autoSyncNeoDB.value = (typeof v === 'boolean' ? v : false)
    }
    if (STORAGE_KEYS.DEBUG_ENABLED in changes) {
      const v = changes[STORAGE_KEYS.DEBUG_ENABLED].newValue
      debugEnabled.value = (typeof v === 'boolean' ? v : false)
    }
    if (STORAGE_KEYS.LOG_LEVEL in changes) {
      const v = changes[STORAGE_KEYS.LOG_LEVEL].newValue
      logLevel.value = (v === 'debug' || v === 'info' || v === 'warn' || v === 'error' ? v : 'info')
    }
    await nextTick()
    syncingFromStorage = false
  }
  chrome.storage.onChanged.addListener(onChange)
  settingsChangedUnsub = () => { chrome.storage.onChanged.removeListener(onChange) }
})

onUnmounted(() => {
  settingsChangedUnsub?.()
})

async function saveNeoDBToken() {
  try { await Store.updateSettings({ neodbToken: neodbToken.value.trim() }); toast.success(t('toast.saved')) } catch (e) { toast.error(t('toast.saveFailed'), String(e)) }
}

watch(autoSyncNeoDB, async (v) => {
  if (!autoSyncInitialized || syncingFromStorage) return
  try { await Store.updateSettings({ autoSyncNeoDB: v }); toast.info(v ? t('toast.autoSyncEnabled') : t('toast.autoSyncDisabled')) } catch (e) { toast.error(t('toast.saveFailed'), String(e)) }
})

watch([debugEnabled, logLevel], async ([e, l]) => {
  if (!debugInitialized || syncingFromStorage) return
  try { await Store.updateSettings({ debugEnabled: e, logLevel: l }); toast.info(e ? t('toast.logEnabled', { level: l }) : t('toast.logDisabled')) } catch (err) { toast.error(t('toast.saveFailed'), String(err)) }
})
</script>

<template>
  <SectionContainer>
    <div class="umm:flex umm:flex-col umm:gap-4">
      <SectionHeader :title="t('settings.neodbConfig')" />
      <FormField :label="t('settings.apiToken')" :description="t('settings.autoSyncNeoDBDesc')">
        <Input v-model="neodbToken" type="password" :placeholder="t('settings.apiToken')" />
      </FormField>
      <Button @click="saveNeoDBToken" class="umm:w-full">{{ t('settings.saveToken') }}</Button>
      <div v-if="neodbToken.trim()" class="umm:flex umm:items-center umm:justify-between umm:rounded-lg umm:border umm:p-3">
        <FormField :label="t('settings.autoSyncNeoDB')" :description="t('settings.autoSyncNeoDBDesc')" />
        <Switch :checked="autoSyncNeoDB" @update:checked="(v: boolean) => autoSyncNeoDB = v" />
      </div>
    </div>

    <Separator />

    <div class="umm:flex umm:flex-col umm:gap-4">
      <SectionHeader :title="t('settings.debugLog')" />
      <div class="umm:flex umm:items-center umm:justify-between umm:rounded-lg umm:border umm:p-3">
        <FormField :label="t('settings.enableLog')" :description="t('settings.enableLogDesc')" />
        <Switch :checked="debugEnabled" @update:checked="(v: boolean) => debugEnabled = v" />
      </div>
      <div v-if="debugEnabled" class="umm:flex umm:flex-col umm:gap-2">
        <FormField :label="t('settings.logLevel')">
          <Select v-model="logLevel">
            <SelectTrigger class="umm:w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="opt in LOG_LEVEL_OPTIONS" :key="opt.value" :value="opt.value">
                {{ opt.label }} — {{ t(opt.descKey) }}
              </SelectItem>
            </SelectContent>
          </Select>
        </FormField>
      </div>
    </div>
  </SectionContainer>
</template>
