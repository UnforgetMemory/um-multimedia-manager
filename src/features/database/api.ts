/**
 * Database API — thin message-passing layer
 *
 * Sends DB_* messages to Background Service Worker which holds the
 * single IndexedDB connection. The Background SW handles all errors;
 * transient connection failures (SW waking up / killed mid-flight, MV3)
 * are retried here with short backoff, everything else propagates to the
 * caller.
 */

import type { Provider } from '@/config'
import type { MessageType, MessagePayloadMap, StoreRecord, AppSettings, PtIdCacheEntry } from '@/types'
import { sleep } from '@/utils'

/**
 * Connection-level failures worth retrying — all mean "the receiving end
 * was not there at send time", which is transient in MV3 (service worker
 * startup race / killed while asleep). Semantic DB errors (success:false
 * responses) are never retried, and neither is 'Extension context
 * invalidated' — that condition is permanent for the current context
 * (extension updated/disabled), so retrying would be futile.
 */
const CONNECTION_ERROR_MARKERS = [
  'Could not establish connection',
  'Receiving end does not exist',
  'The message port closed before a response was received',
]

function isTransientConnectionError(message: string): boolean {
  return CONNECTION_ERROR_MARKERS.some((marker) => message.includes(marker))
}

/**
 * Send a typed runtime message with timeout and transient-error retry.
 * `K` is the message type; `payload` is type-checked against MessagePayloadMap.
 * Retries are only taken for connection-level failures (which fail fast),
 * so the wall-clock budget stays near `timeout`.
 */
async function send<K extends MessageType>(
  type: K,
  payload: MessagePayloadMap[K],
  timeout = 8000,
  retries = 2,
): Promise<any> {
  let lastError: unknown = null

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await new Promise<any>((resolve, reject) => {
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      if (!isTransientConnectionError(message)) throw err
      lastError = err
      if (attempt < retries) {
        console.warn(`[DB API] '${type}' connection error (attempt ${attempt + 1}/${retries}), retrying:`, message)
        await sleep(250 * (attempt + 1))
      }
    }
  }

  // Defensive: unreachable in practice (every non-retried path throws inside
  // the loop), but never throw null.
  throw lastError ?? new Error('[DB API] send failed: no error captured')
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

export async function dbGetBulk(
  storeName: string,
  keys: string[]
): Promise<Array<{ key: string; record: StoreRecord }>> {
  const res = await send('DB_GET_BULK', { storeName, keys })
  return res?.entries || []
}

export async function dbGetWatchedIds(
  storeNames: string[],
): Promise<Record<string, string[]>> {
  // 20s content-side budget: the handler schedules ONE task per store and the
  // scheduler executes tasks serially (8s each) — an 8s budget would cut the
  // second store short when the first one stalls.
  const res = await send('DB_GET_WATCHED_IDS', { storeNames }, 20_000)
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

// ==================== Utility ====================

export async function healthCheck(): Promise<boolean> {
  try {
    await send('HEALTH_CHECK', undefined, 3000)
    return true
  } catch {
    return false
  }
}
