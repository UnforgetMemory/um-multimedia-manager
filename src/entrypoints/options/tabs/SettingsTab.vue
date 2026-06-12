<script setup lang="ts">
import { ref, watch, onMounted, nextTick } from 'vue'
import { Store } from '@/features/database'
import type { AppSettings } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

function showPageToast(type: 'success' | 'error' | 'info' | 'loading', title: string, message?: string) {
  try { chrome.runtime.sendMessage({ type: 'SHOW_TOAST', payload: { type, title, message } }, () => { void chrome.runtime.lastError }) } catch { /* silent */ }
}

const neodbToken = ref('')
const autoSyncNeoDB = ref(false)
const debugEnabled = ref(false)
const logLevel = ref<AppSettings['logLevel']>('info')
const LOG_LEVEL_OPTIONS = [
  { value: 'debug', label: 'Debug', description: '显示所有日志' },
  { value: 'info', label: 'Info', description: '信息及以上' },
  { value: 'warn', label: 'Warn', description: '警告及以上' },
  { value: 'error', label: 'Error', description: '仅错误' },
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
  try { await Store.updateSettings({ neodbToken: neodbToken.value.trim() }); await showPageToast('success', 'NeoDB Token 已保存') } catch (e) { await showPageToast('error', '保存失败', String(e)) }
}

watch(autoSyncNeoDB, async (v) => {
  if (!autoSyncInitialized) return
  try { await Store.updateSettings({ autoSyncNeoDB: v }); await showPageToast('info', v ? '已开启自动同步到 NeoDB' : '已关闭自动同步到 NeoDB') } catch (e) { await showPageToast('error', '保存失败', String(e)) }
})

watch([debugEnabled, logLevel], async ([e, l]) => {
  if (!debugInitialized) return
  try { await Store.updateSettings({ debugEnabled: e, logLevel: l }); await showPageToast('info', e ? `日志已开启: ${l}` : '日志已关闭') } catch (err) { await showPageToast('error', '保存失败', String(err)) }
})
</script>

<template>
  <div class="space-y-[var(--section-gap)]">
    <h2 class="font-h1 text-primary-content">设置</h2>

    <div class="space-y-4">
      <h3 class="font-h2 text-primary-content">NeoDB 配置</h3>
      <div><Label>API Token</Label><Input v-model="neodbToken" type="password" placeholder="请输入 NeoDB API Token" class="mt-2" /><p class="font-caption text-secondary-content mt-2">用于同步评分到 NeoDB</p></div>
      <Button @click="saveNeoDBToken" class="w-full">保存 Token</Button>
      <div v-if="neodbToken.trim()" class="flex items-center justify-between rounded-lg border p-3">
        <div class="space-y-0.5"><Label class="font-medium">自动同步到 NeoDB</Label><p class="font-caption text-secondary-content">豆瓣页面首次写入时自动推送</p></div>
        <button type="button" role="switch" :aria-checked="autoSyncNeoDB" :class="['peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50', autoSyncNeoDB ? 'bg-primary' : 'bg-input']" @click="autoSyncNeoDB = !autoSyncNeoDB">
          <span :class="['pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform', autoSyncNeoDB ? 'translate-x-5' : 'translate-x-0']" />
        </button>
      </div>
    </div>

    <Separator />

    <div class="space-y-4">
      <h3 class="font-h2 text-primary-content">调试日志</h3>
      <div class="flex items-center justify-between rounded-lg border p-3">
        <div class="space-y-0.5"><Label class="font-medium">启用日志</Label><p class="font-caption text-secondary-content">开启后在控制台输出调试信息</p></div>
        <button type="button" role="switch" :aria-checked="debugEnabled" :class="['peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50', debugEnabled ? 'bg-primary' : 'bg-input']" @click="debugEnabled = !debugEnabled">
          <span :class="['pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform', debugEnabled ? 'translate-x-5' : 'translate-x-0']" />
        </button>
      </div>
      <div v-if="debugEnabled" class="space-y-2">
        <Label class="font-medium">日志级别</Label>
        <Select v-model="logLevel">
          <SelectTrigger class="w-full"><SelectValue placeholder="选择日志级别" /></SelectTrigger>
          <SelectContent>
            <SelectItem v-for="opt in LOG_LEVEL_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }} — {{ opt.description }}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  </div>
</template>
