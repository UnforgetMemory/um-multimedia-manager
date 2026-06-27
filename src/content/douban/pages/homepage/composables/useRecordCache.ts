import { ref } from 'vue'
import { Store } from '@/features/database'
import type { StoreRecord } from '@/types'

/**
 * Reactive IndexedDB record cache for douban_records.
 *
 * Loads all records from the 'douban_records' store into a Map keyed by
 * subject ID (extracted from keys like 'douban::{id}'). The records ref
 * is reactive so components re-render when the cache is refreshed.
 */
export function useRecordCache() {
  const records = ref(new Map<string, StoreRecord>())
  const loading = ref(true)

  async function load() {
    loading.value = true
    try {
      const entries = await Store.dbGetAll('douban_records')
      const map = new Map<string, StoreRecord>()
      for (const { key, record } of entries) {
        const id = key.split('::')[1]
        if (id) {
          map.set(id, {
            status: record.status ?? 0,
            rating: record.rating ?? 0,
          } as StoreRecord)
        }
      }
      records.value = map
    } catch (error) {
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
