/**
 * Record cache — loads douban_records from IndexedDB into a Map.
 */

import { Store } from '@/features/database'
import type { StoreRecord } from '@/types'
import { debugLog } from '@/utils/logger'

let recordCache: Map<string, StoreRecord> | null = null

export async function loadRecordCache(): Promise<Map<string, StoreRecord>> {
  if (recordCache) return recordCache
  try {
    const entries = await Store.dbGetAll('douban_records')
    recordCache = new Map()
    for (const { key, record } of entries) {
      const id = key.split('::')[1]
      if (id) recordCache.set(id, record)
    }
    debugLog(`[UMM] Loaded ${recordCache.size} douban records into cache`)
    return recordCache
  } catch (error) {
    console.error('[UMM] Failed to load douban records:', error)
    return new Map()
  }
}

export function clearRecordCache(): void {
  recordCache = null
}
