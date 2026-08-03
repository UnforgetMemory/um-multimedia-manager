/**
 * Database API — thin message-passing layer
 *
 * Sends DB_* messages to Background Service Worker which holds the
 * single IndexedDB connection. No retry, no fallback — the Background
 * SW handles all errors and the caller should use safeSendMessage for
 * retry/timeout handling if needed.
 */

import type { Provider } from '@/config'
import type { MessageType, MessagePayloadMap, StoreRecord, AppSettings, ExportData, Statistics, PtIdCacheEntry, MigrationStatus } from '@/types'

/**
 * Send a typed runtime message with timeout.
 * `K` is the message type; `payload` is type-checked against MessagePayloadMap.
 * Thin wrapper — errors propagate to caller.
 */
async function send<K extends MessageType>(
  type: K,
  payload: MessagePayloadMap[K],
  timeout = 8000,
): Promise<any> {
  return new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`[DB API] '${type}' timed out after ${timeout}ms`))
    }, timeout)

    chrome.runtime.sendMessage({ type, payload }, (response) => {
      clearTimeout(timer)
      if (chrome.runtime.lastError) {
        reject(new Error(`[DB API] sendMessage failed: ${chrome.runtime.lastError.message}`))
      } else if (response?.success === false) {
        reject(new Error(`[DB API] ${response.error || 'Unknown error'}`))
      } else {
        resolve(response)
      }
    })
  })
}

// ==================== Core CRUD ====================

export async function dbGet(storeName: string, key: string): Promise<StoreRecord | null> {
  const res = await send('DB_GET', { storeName, key })
  return res?.record ?? null
}

export async function dbPut(storeName: string, key: string, record: StoreRecord): Promise<void> {
  await send('DB_PUT', { storeName, key, record })
}

export async function dbDelete(storeName: string, key: string): Promise<void> {
  await send('DB_DELETE', { storeName, key })
}

export async function dbGetAll(
  storeName: string
): Promise<Array<{ key: string; record: StoreRecord }>> {
  const res = await send('DB_GET_ALL', { storeName })
  return res?.entries || []
}

export async function dbQuery(
  storeName: string,
  indexName: string,
  value: IDBValidKey
): Promise<Array<{ key: string; record: StoreRecord }>> {
  const res = await send('DB_QUERY', { storeName, indexName, value })
  return res?.entries || []
}

export async function dbCount(storeName: string): Promise<number> {
  const res = await send('DB_COUNT', { storeName })
  return res?.count ?? 0
}

/**
 * Batch query: get watched IDs (status == 2) from multiple stores in a single message.
 * Returns { storeName: string[] } map.
 */
export async function dbGetWatchedIds(
  storeNames: string[]
): Promise<Record<string, string[]>> {
  const res = await send('DB_GET_WATCHED_IDS', { storeNames })
  return res?.results || {}
}

// ==================== PT ID Cache ====================

export async function ptIdCacheGet(ptUrl: string): Promise<PtIdCacheEntry | null> {
  const res = await send('PT_ID_CACHE_GET', { ptUrl })
  return res?.entry ?? null
}

export async function ptIdCachePut(entry: PtIdCacheEntry): Promise<void> {
  await send('PT_ID_CACHE_PUT', { entry })
}

export async function ptIdCacheGetBulk(
  ptUrls: string[]
): Promise<Record<string, PtIdCacheEntry>> {
  const res = await send('PT_ID_CACHE_GET_BULK', { ptUrls })
  return res?.entries || {}
}

// ==================== Sync ====================

export async function dbSyncPageRecord(
  platform: Provider,
  key: string,
  record: StoreRecord,
  linked?: Array<{ platform: Provider; key: string; url: string }>
): Promise<{ changed: boolean; syncedPlatforms: string[] }> {
  const res = await send('DB_SYNC_PAGE_RECORD', { platform, key, record, linked })
  return res?.result || { changed: false, syncedPlatforms: [] }
}

// ==================== Settings ====================

export async function getSettings(): Promise<AppSettings> {
  const res = await send('GET_SETTINGS', undefined)
  return res?.settings || ({} as AppSettings)
}

export async function updateSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
  const res = await send('UPDATE_SETTINGS', partial)
  return res?.settings || ({} as AppSettings)
}

// ==================== Export / Import ====================

export async function exportData(): Promise<ExportData> {
  const res = await send('EXPORT_DATA', undefined)
  return res?.data || ({} as ExportData)
}

export async function importData(data: ExportData): Promise<void> {
  await send('IMPORT_DATA', data)
}

// ==================== Statistics ====================

export async function getStatistics(): Promise<Statistics> {
  const res = await send('GET_STATISTICS', undefined)
  return res?.stats || {
    total: 0, movie: 0, tv: 0, music: 0, book: 0,
    douban: 0, imdb: 0, neodb: 0, tmdb: 0, bilibili: 0, youtube: 0,
  }
}

// ==================== Utility ====================

export async function healthCheck(): Promise<boolean> {
  try {
    await send('HEALTH_CHECK', undefined, 3000)
    return true
  } catch {
    return false
  }
}

// ==================== Migration ====================

export async function getMigrationStatus(): Promise<MigrationStatus> {
  const res = await send('GET_MIGRATION_STATUS', undefined)
  return res?.migration || {
    currentRecordVersion: 0,
    currentCacheVersion: 0,
    currentExportVersion: 0,
    minSupportedRecordVersion: 0,
    minSupportedExportVersion: 0,
    recordMigrationSteps: 0,
    cacheMigrationSteps: 0,
  }
}
