import { useState, useEffect, useCallback } from 'react'
import { Store } from '@/features/database'
import type { StoreRecord } from '@/types'

/**
 * React hook to load douban_records from IndexedDB into a Map.
 * Replaces the Vue useRecordCache composable.
 */
export function useRecordCache() {
  const [records, setRecords] = useState(new Map<string, StoreRecord>())
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
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
      setRecords(map)
    } catch (error) {
      console.error('[UMM] Failed to load douban records:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const clear = useCallback(() => {
    setRecords(new Map())
  }, [])

  return { records, loading, load, clear }
}
