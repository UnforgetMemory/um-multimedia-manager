/**
 * Database API — thin message-passing layer
 *
 * Sends DB_* messages to Background Service Worker which holds the
 * single IndexedDB connection. No retry, no fallback — the Background
 * SW handles all errors and the caller should use safeSendMessage for
 * retry/timeout handling if needed.
 */

import type { StoreRecord, AppSettings, ExportData, Statistics } from '../types'

/**
 * Send a runtime message with timeout.
 * Thin wrapper — errors propagate to caller.
 */
async function send<T = any>(message: any, timeout = 8000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`[DB API] '${message.type}' timed out after ${timeout}ms`))
    }, timeout)

    chrome.runtime.sendMessage(message, (response) => {
      clearTimeout(timer)
      if (chrome.runtime.lastError) {
        reject(new Error(`[DB API] sendMessage failed: ${chrome.runtime.lastError.message}`))
      } else if (response?.success === false) {
        reject(new Error(`[DB API] ${response.error || 'Unknown error'}`))
      } else {
        resolve(response as T)
      }
    })
  })
}

// ==================== Core CRUD ====================

export async function dbGet(storeName: string, key: string): Promise<StoreRecord | null> {
  const res = await send<{ record?: StoreRecord | null }>(
    { type: 'DB_GET', payload: { storeName, key } }
  )
  return res?.record ?? null
}

export async function dbPut(storeName: string, key: string, record: StoreRecord): Promise<void> {
  await send(
    { type: 'DB_PUT', payload: { storeName, key, record } }
  )
}

export async function dbDelete(storeName: string, key: string): Promise<void> {
  await send(
    { type: 'DB_DELETE', payload: { storeName, key } }
  )
}

export async function dbGetAll(
  storeName: string
): Promise<Array<{ key: string; record: StoreRecord }>> {
  const res = await send<{ entries?: Array<{ key: string; record: StoreRecord }> }>(
    { type: 'DB_GET_ALL', payload: { storeName } }
  )
  return res?.entries || []
}

export async function dbQuery(
  storeName: string,
  indexName: string,
  value: any
): Promise<Array<{ key: string; record: StoreRecord }>> {
  const res = await send<{ entries?: Array<{ key: string; record: StoreRecord }> }>(
    { type: 'DB_QUERY', payload: { storeName, indexName, value } }
  )
  return res?.entries || []
}

export async function dbCount(storeName: string): Promise<number> {
  const res = await send<{ count?: number }>(
    { type: 'DB_COUNT', payload: { storeName } }
  )
  return res?.count ?? 0
}

// ==================== Sync ====================

export async function dbSyncPageRecord(
  platform: string,
  key: string,
  record: StoreRecord,
  linked?: Array<{ platform: string; key: string; url: string }>
): Promise<{ changed: boolean; syncedPlatforms: string[] }> {
  const res = await send<{ result?: { changed: boolean; syncedPlatforms: string[] } }>(
    { type: 'DB_SYNC_PAGE_RECORD', payload: { platform, key, record, linked } }
  )
  return res?.result || { changed: false, syncedPlatforms: [] }
}

// ==================== Settings ====================

export async function getSettings(): Promise<AppSettings> {
  const res = await send<{ settings?: AppSettings }>({ type: 'GET_SETTINGS' })
  return res?.settings || ({} as AppSettings)
}

export async function updateSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
  const res = await send<{ settings?: AppSettings }>(
    { type: 'UPDATE_SETTINGS', payload: partial }
  )
  return res?.settings || ({} as AppSettings)
}

// ==================== Export / Import ====================

export async function exportData(): Promise<ExportData> {
  const res = await send<{ data?: ExportData }>({ type: 'EXPORT_DATA' })
  return res?.data || ({} as ExportData)
}

export async function importData(data: ExportData): Promise<void> {
  await send({ type: 'IMPORT_DATA', payload: data })
}

// ==================== Statistics ====================

export async function getStatistics(): Promise<Statistics> {
  const res = await send<{ stats?: Statistics }>({ type: 'GET_STATISTICS' })
  return res?.stats || {
    total: 0, movie: 0, tv: 0, music: 0, book: 0,
    douban: 0, imdb: 0, neodb: 0, tmdb: 0,
  }
}

// ==================== Utility ====================

export async function healthCheck(): Promise<boolean> {
  try {
    await send<{}>({ type: 'HEALTH_CHECK' }, 3000)
    return true
  } catch {
    return false
  }
}
