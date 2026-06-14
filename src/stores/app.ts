import { defineStore } from 'pinia'
import { ref } from 'vue'
import { safeSendMessage } from '@/utils/context'
import type { StoreRecord, AdultAvId } from '@/types'

export const useAppStore = defineStore('app', () => {
  const loading = ref(false)
  const error = ref<string | null>(null)
  const dataReady = ref(false)
  const records = ref<StoreRecord[]>([])
  const adultAvItems = ref<AdultAvId[]>([])
  const appVersion = ref('')

  appVersion.value = (() => {
    try { return chrome.runtime.getManifest().version } catch { return '3.0.0' }
  })()

  async function loadData() {
    if (loading.value) return
    loading.value = true
    error.value = null
    try {
      const [recordsRes, adultAvRes] = await Promise.all([
        safeSendMessage({ type: 'GET_ALL_RECORDS' }, { timeout: 10000, retries: 2 }),
        safeSendMessage({ type: 'ADULT_AV_GET_ALL' }, { timeout: 8000, retries: 1 }),
      ])
      if (!recordsRes?.success) throw new Error(recordsRes?.error || '获取数据失败')
      records.value = recordsRes.records
      adultAvItems.value = adultAvRes?.success ? (adultAvRes.items || []) : []
      dataReady.value = true
    } catch (e) {
      error.value = '数据加载失败，请重试'
      records.value = []
    } finally {
      loading.value = false
    }
  }

  return { loading, error, dataReady, records, adultAvItems, appVersion, loadData }
})