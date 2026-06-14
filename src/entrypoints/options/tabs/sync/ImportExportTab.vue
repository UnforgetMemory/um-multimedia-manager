<script setup lang="ts">
import { ref } from 'vue'
import { safeSendMessage } from '@/utils/context'
import { Button } from '@/components/ui/button'
import { Download, Upload, RefreshCw } from 'lucide-vue-next'
import { useConfirmStore } from '@/stores/confirm'
import { useToast } from '@/composables/useToast'

const toast = useToast()
const { show } = useConfirmStore()
const isExporting = ref(false)
const isImporting = ref(false)

async function exportData() {
  isExporting.value = true
  try {
    const response = await safeSendMessage({ type: 'EXPORT_DATA' }, { timeout: 30000 })
    if (!response?.success) throw new Error(response?.error || '导出失败')
    const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `umm-backup-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
    toast.success('导出成功！')
  } catch (e) { toast.error('导出失败', String(e)) } finally { isExporting.value = false }
}

function triggerImport() {
  const input = document.createElement('input'); input.type = 'file'; input.accept = '.json'
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        const payload = JSON.parse(event.target?.result as string)
        let recordCount = 0
        if (payload.stores) { for (const sn in payload.stores) recordCount += Object.keys(payload.stores[sn]).length }
        show({
          title: '导入数据',
          description: `即将导入 ${recordCount.toLocaleString()} 条记录`,
          warning: '相同 ID 的记录将被覆盖',
          details: `文件名: ${file.name}`,
          icon: Upload,
          confirmText: '开始导入',
          action: async () => {
            isImporting.value = true
            try {
              let importPayload = payload
              if (payload.datasets && !payload.stores) {
                const stores: Record<string, Record<string, any>> = {}
                for (const provider of ['douban', 'imdb', 'neodb', 'tmdb']) {
                  const sn = `${provider}_records`
                  if (payload.datasets[provider]) { stores[sn] = {}; for (const type of Object.keys(payload.datasets[provider])) { for (const r of payload.datasets[provider][type]) { stores[sn][`${type}::${r.providerId || r.id}`] = { url: r.url || '', status: r.status ?? 1, rating: r.rating ?? null, updatedAt: r.updatedAt || new Date().toISOString(), linkedIds: r.linkedIds || {} } } } }
                }
                importPayload = { stores }
              }
              await safeSendMessage({ type: 'IMPORT_DATA', payload: importPayload }, { timeout: 30000 })
              toast.success('导入成功')
            } catch (e) { toast.error('导入失败', String(e)) } finally { isImporting.value = false }
          },
        })
      } catch (e) { toast.error('文件解析失败', String(e)) }
    }
    reader.readAsText(file)
  }
  input.click()
}
</script>

<template>
  <div class="space-y-[var(--section-gap)]">
    <h3 class="font-h2 text-primary-content">导入/导出</h3>
    <div class="grid grid-cols-2 gap-3">
      <Button @click="exportData" variant="outline" :disabled="isExporting || isImporting">
        <Download class="mr-2 h-4 w-4" />{{ isExporting ? '导出中...' : '导出数据' }}
      </Button>
      <Button @click="triggerImport" variant="outline" :disabled="isExporting || isImporting">
        <RefreshCw v-if="isImporting" class="mr-2 h-4 w-4 animate-spin" /><Upload v-else class="mr-2 h-4 w-4" />
        {{ isImporting ? '导入中...' : '导入数据' }}
      </Button>
    </div>
  </div>
</template>
