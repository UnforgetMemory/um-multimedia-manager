<script setup lang="ts">
import { ref, watch, onMounted, nextTick } from 'vue'
import { Store } from '@/features/database'
import { useI18n } from 'vue-i18n'
import type { AppSettings } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/composables/useToast'

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

onMounted(async () => {
  const settings = await Store.getSettings()
  neodbToken.value = settings.neodbToken || ''
  autoSyncNeoDB.value = settings.autoSyncNeoDB ?? false
  debugEnabled.value = settings.debugEnabled ?? false
  logLevel.value = settings.logLevel ?? 'info'
  await nextTick()
  autoSyncInitialized = true
  debugInitialized = true
})

async function saveNeoDBToken() {
  try { await Store.updateSettings({ neodbToken: neodbToken.value.trim() }); toast.success(t('toast.saved')) } catch (e) { toast.error(t('toast.saveFailed'), String(e)) }
}

watch(autoSyncNeoDB, async (v) => {
  if (!autoSyncInitialized) return
  try { await Store.updateSettings({ autoSyncNeoDB: v }); toast.info(v ? t('toast.autoSyncEnabled') : t('toast.autoSyncDisabled')) } catch (e) { toast.error(t('toast.saveFailed'), String(e)) }
})

watch([debugEnabled, logLevel], async ([e, l]) => {
  if (!debugInitialized) return
  try { await Store.updateSettings({ debugEnabled: e, logLevel: l }); toast.info(e ? t('toast.logEnabled', { level: l }) : t('toast.logDisabled')) } catch (err) { toast.error(t('toast.saveFailed'), String(err)) }
})
</script>

<template>
  <div class="space-y-[var(--section-gap)]">
    <div class="space-y-4">
      <h3 class="font-h2 text-primary-content">{{ t('settings.neodbConfig') }}</h3>
      <div>
        <Label>{{ t('settings.apiToken') }}</Label>
        <Input v-model="neodbToken" type="password" :placeholder="t('settings.apiToken')" class="mt-2" />
        <p class="font-caption text-secondary-content mt-2">{{ t('settings.autoSyncNeoDBDesc') }}</p>
      </div>
      <Button @click="saveNeoDBToken" class="w-full">{{ t('settings.saveToken') }}</Button>
      <div v-if="neodbToken.trim()" class="flex items-center justify-between rounded-lg border p-3">
        <div class="space-y-0.5"><Label class="font-medium">{{ t('settings.autoSyncNeoDB') }}</Label><p class="font-caption text-secondary-content">{{ t('settings.autoSyncNeoDBDesc') }}</p></div>
        <button type="button" role="switch" :aria-checked="autoSyncNeoDB" :class="['peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50', autoSyncNeoDB ? 'bg-primary' : 'bg-input']" @click="autoSyncNeoDB = !autoSyncNeoDB">
          <span :class="['pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform', autoSyncNeoDB ? 'translate-x-5' : 'translate-x-0']" />
        </button>
      </div>
    </div>

    <Separator />

    <div class="space-y-4">
      <h3 class="font-h2 text-primary-content">{{ t('settings.debugLog') }}</h3>
      <div class="flex items-center justify-between rounded-lg border p-3">
        <div class="space-y-0.5"><Label class="font-medium">{{ t('settings.enableLog') }}</Label><p class="font-caption text-secondary-content">{{ t('settings.enableLogDesc') }}</p></div>
        <button type="button" role="switch" :aria-checked="debugEnabled" :class="['peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50', debugEnabled ? 'bg-primary' : 'bg-input']" @click="debugEnabled = !debugEnabled">
          <span :class="['pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform', debugEnabled ? 'translate-x-5' : 'translate-x-0']" />
        </button>
      </div>
      <div v-if="debugEnabled" class="space-y-2">
        <Label class="font-medium">{{ t('settings.logLevel') }}</Label>
        <Select v-model="logLevel">
          <SelectTrigger class="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="opt in LOG_LEVEL_OPTIONS" :key="opt.value" :value="opt.value">
              {{ opt.label }} — {{ t(opt.descKey) }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  </div>
</template>
