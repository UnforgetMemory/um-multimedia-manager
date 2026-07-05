import { ref } from 'vue'
import { Store } from '@/features/database'
import type { StoreRecord } from '@/types'

export function useRecordCache(prefix?: string) {
  const records = ref(new Map<string, StoreRecord>())
  const loading = ref(true)

  async function load() {
    loading.value = true
    try {
      const entries = await Store.dbGetAll('douban_records')
      const map = new Map<string, StoreRecord>()
      if (prefix) {
        const p = `${prefix}::`
        for (const { key, record } of entries) {
          if (key.startsWith(p)) {
            map.set(key.slice(p.length), record)
          }
        }
      } else {
        for (const { key, record } of entries) {
          const id = key.split('::')[1]
          if (id) {
            map.set(id, {
              status: record.status ?? 0,
              rating: record.rating ?? 0,
            } as StoreRecord)
          }
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
