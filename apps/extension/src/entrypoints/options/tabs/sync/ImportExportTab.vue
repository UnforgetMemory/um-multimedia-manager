<script setup lang="ts">
import { ref } from 'vue'
import { safeSendMessage } from '@/utils/context'
import { useI18n } from 'vue-i18n'
import { Download, Upload } from 'lucide-vue-next'
import { useConfirmStore } from '@/stores/confirm'
import { useToast } from '@/composables/useToast'
import SectionContainer from '@/shared/ui/section-container/SectionContainer.vue'
import SectionHeader from '@/shared/ui/section-header/SectionHeader.vue'
import LoadingButton from '@/shared/ui/loading-button/LoadingButton.vue'

const { t } = useI18n()
const toast = useToast()
const { show } = useConfirmStore()
const isExporting = ref(false)
const isImporting = ref(false)

async function exportData() {
  isExporting.value = true
  try {
    const response = await safeSendMessage({ type: 'EXPORT_DATA' }, { timeout: 30000 })
    if (!response?.success) throw new Error(response?.error || t('toast.exportFailed'))
    const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `umm-backup-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
    toast.success(t('toast.exportSuccess'))
  } catch (e) { toast.error(t('toast.exportFailed'), String(e)) } finally { isExporting.value = false }
}

function triggerImport() {
  const input = document.createElement('input'); input.type = 'file'; input.accept = '.json'
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        const raw = (event.target?.result as string) || ''
        const clean = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw
        let payload: any
        try {
          payload = JSON.parse(clean)
        } catch (parseErr) {
          const preview = raw.slice(0, 80).replace(/[\x00-\x1f]/g, ch => `\\x${ch.charCodeAt(0).toString(16).padStart(2, '0')}`)
          console.error('[Import] JSON parse failed. Raw[:80]:', preview, 'length:', raw.length)
          toast.error(t('toast.importFailed'), `${String(parseErr)}\n\nFile starts with: "${preview}"`)
          return
        }
        let recordCount = 0
        if (payload.stores) { for (const sn in payload.stores) recordCount += Object.keys(payload.stores[sn]).length }
        show({
          title: t('confirm.importData'),
          description: t('confirm.importRecords', { count: recordCount.toLocaleString() }),
          warning: t('common.overrideWarning'),
          details: `${t('common.fileName')}: ${file.name}`,
          icon: Upload,
          confirmText: t('common.startImport'),
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
              const res = await safeSendMessage<{ success: boolean; error?: string }>({ type: 'IMPORT_DATA', payload: importPayload }, { timeout: 30000 })
              if (res?.success) {
                toast.success(t('toast.importSuccess'))
              } else {
                console.error('[Import] background handler returned error:', JSON.stringify(res))
                throw new Error(res?.error || 'Import returned no response')
              }
            } catch (e) {
              const errMsg = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
              console.error('[Import] action error:', errMsg)
              toast.error(t('toast.importFailed'), errMsg)
            } finally { isImporting.value = false }
          },
        })
      } catch (e) { toast.error(t('toast.importFailed'), String(e)) }
    }
    reader.readAsText(file)
  }
  input.click()
}
</script>

<template>
  <SectionContainer>
    <SectionHeader :title="t('tab.importExport')" />
    <div class="umm:grid umm:grid-cols-2 umm:gap-3">
      <LoadingButton
        :icon="Download"
        :label="t('common.exportData')"
        :loading="isExporting"
        :loading-label="t('common.exporting')"
        variant="outline"
        :disabled="isExporting || isImporting"
        @click="exportData"
      />
      <LoadingButton
        :icon="Upload"
        :label="t('common.importData')"
        :loading="isImporting"
        :loading-label="t('common.importing')"
        variant="outline"
        :disabled="isExporting || isImporting"
        @click="triggerImport"
      />
    </div>
  </SectionContainer>
</template>
