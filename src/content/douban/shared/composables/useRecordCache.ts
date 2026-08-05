import { ref } from 'vue'
import type { StoreRecord } from '@/types'
import { loadRecordEntries } from '../record-cache-core'

export function useRecordCache(prefix?: string, ids?: string[]) {
  const records = ref(new Map<string, StoreRecord>())
  const loading = ref(true)

  async function load() {
    loading.value = true
    try {
      records.value = await loadRecordEntries(prefix, ids)
    } catch (error: unknown) {
      console.error('[UMM] Failed to load douban records')
    } finally {
      loading.value = false
    }
  }

  function clear() {
    records.value = new Map()
  }

  return { records, loading, load, clear }
}
