<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Store } from '@/features/database'
import { safeSendMessage } from '@/utils/context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { RefreshCw, Download, Upload } from 'lucide-vue-next'
import { useConfirmDialog } from '@/entrypoints/popup/useConfirmDialog'

function showPageToast(type: 'success' | 'error' | 'info' | 'loading', title: string, message?: string) {
  try { chrome.runtime.sendMessage({ type: 'SHOW_TOAST', payload: { type, title, message } }, () => { void chrome.runtime.lastError }) } catch { /* silent */ }
}

const { showConfirmDialog } = useConfirmDialog()

const webdavConfig = ref({ url: '', username: '', password: '' })
const isConfigSaved = ref(false)
const loading = ref({ sync: false, download: false, upload: false })

const isAnyRunning = computed(() => Object.values(loading.value).some(v => v))

onMounted(async () => {
  const settings = await Store.getSettings()
  webdavConfig.value = { url: settings.webdavUrl || '', username: settings.webdavUsername || '', password: settings.webdavPassword || '' }
  isConfigSaved.value = !!(settings.webdavUrl && settings.webdavUsername && settings.webdavPassword)
})

async function saveConfig() {
  if (webdavConfig.value.url && !webdavConfig.value.url.startsWith('https://')) { await showPageToast('error', 'URL 必须使用 HTTPS'); return }
  try {
    await Store.updateSettings({ webdavUrl: webdavConfig.value.url, webdavUsername: webdavConfig.value.username, webdavPassword: webdavConfig.value.password })
    isConfigSaved.value = true
    await showPageToast('success', '配置已保存')
  } catch (e) { isConfigSaved.value = false; await showPageToast('error', '保存失败', String(e)) }
}

async function testConnection() {
  if (!webdavConfig.value.url) { await showPageToast('error', '请输入 WebDAV URL'); return }
  if (!webdavConfig.value.url.startsWith('https://')) { await showPageToast('error', 'URL 必须使用 HTTPS'); return }
  const result = await safeSendMessage({ type: 'WEBDAV_TEST', payload: webdavConfig.value }, { timeout: 10000 })
  if (result?.success) await showPageToast('success', '连接成功') ; else await showPageToast('error', '连接失败', result?.message)
}

async function syncCloud() {
  if (!isConfigSaved.value) { await showPageToast('error', '请先保存配置'); return }
  showConfirmDialog({ title: '智能合并同步', description: '对比本地和云端数据，自动同步有变化的部分', icon: RefreshCw, confirmText: '开始同步', action: async () => {
    loading.value.sync = true
    try { const r = await safeSendMessage({ type: 'WEBDAV_SYNC' }, { timeout: 30000 }); if (r?.success) await showPageToast('success', '同步成功', r.message); else await showPageToast('error', '同步失败', r?.message) } catch (e) { await showPageToast('error', '同步失败', String(e)) } finally { loading.value.sync = false }
  }})
}

async function downloadCloud() {
  if (!isConfigSaved.value) { await showPageToast('error', '请先保存配置'); return }
  showConfirmDialog({ title: '云端覆盖本地', description: '用云端数据完全覆盖本地数据', warning: '此操作不可逆', icon: Download, confirmText: '确认覆盖', action: async () => {
    loading.value.download = true
    try { const r = await safeSendMessage({ type: 'WEBDAV_DOWNLOAD' }, { timeout: 30000 }); if (r?.success) await showPageToast('success', '下载成功', r.message); else await showPageToast('error', '下载失败', r?.message) } catch (e) { await showPageToast('error', '下载失败', String(e)) } finally { loading.value.download = false }
  }})
}

async function uploadCloud() {
  if (!isConfigSaved.value) { await showPageToast('error', '请先保存配置'); return }
  showConfirmDialog({ title: '本地覆盖云端', description: '用本地数据完全覆盖云端数据', warning: '此操作不可逆', icon: Upload, confirmText: '确认覆盖', action: async () => {
    loading.value.upload = true
    try { const r = await safeSendMessage({ type: 'WEBDAV_UPLOAD' }, { timeout: 30000 }); if (r?.success) await showPageToast('success', '上传成功', r.message); else await showPageToast('error', '上传失败', r?.message) } catch (e) { await showPageToast('error', '上传失败', String(e)) } finally { loading.value.upload = false }
  }})
}
</script>

<template>
  <div class="space-y-[var(--section-gap)]">
    <div>
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-h2 text-primary-content">WebDAV 配置</h3>
        <Badge v-if="isConfigSaved" variant="default" class="bg-green-500">已保存</Badge>
        <Badge v-else variant="outline" class="text-orange-500 border-orange-500">未保存</Badge>
      </div>
      <div class="space-y-4">
        <div><Label>服务器地址</Label><Input v-model="webdavConfig.url" placeholder="https://example.com/dav/" class="mt-2" /></div>
        <div><Label>用户名</Label><Input v-model="webdavConfig.username" class="mt-2" /></div>
        <div><Label>密码</Label><Input v-model="webdavConfig.password" type="password" class="mt-2" /></div>
        <div class="flex gap-2">
          <Button @click="saveConfig" class="flex-1">保存配置</Button>
          <Button @click="testConnection" variant="outline" class="flex-1">测试连接</Button>
        </div>
      </div>
    </div>

    <Separator />

    <div>
      <h3 class="font-h2 text-primary-content mb-4">智能同步</h3>
      <div class="space-y-2">
        <Button @click="downloadCloud" variant="outline" class="w-full" :disabled="!isConfigSaved || isAnyRunning">
          <RefreshCw v-if="loading.download" class="mr-2 h-4 w-4 animate-spin" /><Download v-else class="mr-2 h-4 w-4" />
          {{ loading.download ? '下载中...' : '云端覆盖本地' }}
        </Button>
        <Button @click="uploadCloud" variant="outline" class="w-full" :disabled="!isConfigSaved || isAnyRunning">
          <RefreshCw v-if="loading.upload" class="mr-2 h-4 w-4 animate-spin" /><Upload v-else class="mr-2 h-4 w-4" />
          {{ loading.upload ? '上传中...' : '本地覆盖云端' }}
        </Button>
        <Button @click="syncCloud" class="w-full" :disabled="!isConfigSaved || isAnyRunning">
          <RefreshCw :class="['mr-2 h-4 w-4', loading.sync && 'animate-spin']" />
          {{ loading.sync ? '同步中...' : '智能合并同步' }}
        </Button>
      </div>
    </div>
  </div>
</template>
