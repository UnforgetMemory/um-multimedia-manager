/**
 * Data Message Handlers
 *
 * Handles GET_SETTINGS, UPDATE_SETTINGS, EXPORT_DATA, IMPORT_DATA,
 * GET_STATISTICS, GET_ALL_RECORDS, GET_MIGRATION_STATUS messages.
 * Extracted from background.ts for modularity.
 */

import type { AppSettings, ExportData, Statistics, StoreRecord } from '@/types'
import { mediaDB, RECORD_STORES, STORE_NAMES, normalizeStoreRecordKey } from '@/features/database/models'
import {
  validateExportVersion,
  getMigrationInfo,
  MigrationError,
  normalizeStoreRecord,
} from '@/features/migration/models'
import { settingsCache } from '@/features/settings/cache'
import { infoLog, warnLog } from '@/utils/logger'
import { broadcast } from '@/utils/event-bus'
import type { SendResponse } from '@/utils/error-message'
import { getCacheManager, invalidateSchedulerStore } from './cache-invalidation'

/** Settings fields to include in export (all AppSettings keys except sensitive credentials) */
export const EXPORT_SETTINGS_KEYS: Array<keyof AppSettings> = [
  'autoSync',
  'autoSyncNeoDB',
  'syncInterval',
  'theme',
  'language',
  'notificationEnabled',
  'appearance',
  'accentColor',
  'grayColor',
  'debugEnabled',
  'logLevel',
  'neodbToken',
]

/**
 * Settings keys allowed on IMPORT.
 *
 * Security: this MUST mirror EXPORT_SETTINGS_KEYS and must NOT include
 * credential keys (webdavUrl/webdavUsername/webdavPassword). Previously the
 * import whitelist used every STORAGE_KEYS value, so a malicious backup could
 * rewrite the WebDAV target to an attacker-controlled server; the next sync
 * would then push the user's full library + real WebDAV password there.
 */
const IMPORT_SETTINGS_KEYS: ReadonlySet<string> = new Set(EXPORT_SETTINGS_KEYS)

/** Map store names to platform identifiers for stats/records aggregation */
const storePlatformMap: Record<string, string> = {
  [STORE_NAMES.DOUBAN]: 'douban',
  [STORE_NAMES.IMDB]: 'imdb',
  [STORE_NAMES.NEODB]: 'neodb',
  [STORE_NAMES.TMDB]: 'tmdb',
  [STORE_NAMES.BILIBILI]: 'bilibili',
  [STORE_NAMES.YOUTUBE]: 'youtube',
  [STORE_NAMES.BANGUMI]: 'bangumi',
}

/** GET_SETTINGS — return cached settings */
export async function handleGetSettings(sendResponse: SendResponse) {
  const settings = settingsCache.get()
  sendResponse({ success: true, settings })
}

/** UPDATE_SETTINGS — merge new settings into cache + storage */
export async function handleUpdateSettings(
  payload: Partial<AppSettings>,
  sendResponse: SendResponse
) {
  await settingsCache.updateAll(payload)
  const settings = settingsCache.get()
  sendResponse({ success: true, settings })
}

/** EXPORT_DATA — dump all stores + settings (excludes WebDAV credentials) */
export async function handleExportData(sendResponse: SendResponse) {
  const stores = await mediaDB.getAllStores()
  const appSettings = settingsCache.get()
  const settings: Record<string, unknown> = {}
  for (const key of EXPORT_SETTINGS_KEYS) {
    const value = appSettings[key]
    if (value !== undefined) settings[key] = value
  }

  const data: ExportData = {
    schema: 'umm-export',
    version: 2,
    exportedAt: new Date().toISOString(),
    stores,
    settings,
  }
  sendResponse({ success: true, data })
}

/** IMPORT_DATA — validate + replace all stores */
export async function handleImportData(
  payload: ExportData,
  sendResponse: SendResponse
) {
  if (!payload?.stores) {
    sendResponse({ success: false, error: 'Invalid import data' })
    return
  }

  // Validate export data version compatibility
  try {
    validateExportVersion(payload.version ?? 1)
  } catch (err: unknown) {
    if (err instanceof MigrationError) {
      warnLog(`Import rejected: ${err.message}`)
      sendResponse({
        success: false,
        error: err.message,
        errorCode: err.code,
        errorDetails: err.details,
      })
      return
    }
    throw err
  }

  // Clear all stores first
  await mediaDB.clearAll()

  // Import each store — batchPut() auto-stamps schemaVersion + recordVersion
  // (one readwrite transaction per store instead of one per record)
  let totalImported = 0
  // Track written stores+keys so the scheduler L1 cache can be invalidated and
  // consumers re-read immediately instead of serving stale cache in the TTL window
  const writtenStores = new Set<string>()
  const writtenKeys = new Map<string, string[]>()
  for (const [storeName, records] of Object.entries(payload.stores)) {
    if (!RECORD_STORES.includes(storeName) && storeName !== STORE_NAMES.JAV_IDS) continue
    const batch: Array<{ key: string; record: StoreRecord }> = []
    for (const [key, record] of Object.entries(records)) {
      // Normalize: apply full iterative schema migration (0→1→2) instead of
      // manual field defaults — imported JSON may be from older export
      // versions missing fields (e.g. comment for v1-schema records)
      let migrated: StoreRecord
      try {
        migrated = normalizeStoreRecord(record).record
      } catch (err: unknown) {
        if (err instanceof MigrationError) {
          warnLog(`Skipping record ${key} in ${storeName}: ${err.message}`)
          continue
        }
        throw err
      }
      // Bilibili/youtube: rewrite legacy 'video::X' / bare 'X' keys to the
      // canonical 'movie::X' form (decision-3), mirroring the v13 DB
      // migration — a pre-v13 backup would otherwise land under 'video::'
      // keys that movie::-reading code never finds. Duplicate canonical
      // keys within one batch: last write wins (batchPut puts sequentially).
      const normalizedKey = normalizeStoreRecordKey(storeName, key)
      batch.push({ key: normalizedKey, record: migrated })
      totalImported++
    }
    if (batch.length > 0) {
      await mediaDB.batchPut(storeName, batch)
      writtenStores.add(storeName)
      const keys = writtenKeys.get(storeName) ?? (writtenKeys.set(storeName, []).get(storeName)!)
      keys.push(...batch.map((b) => b.key))
    }
  }

  // Import settings if present (whitelist allowed keys only — excludes credentials)
  if (payload.settings) {
    const filtered: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(payload.settings)) {
      if (IMPORT_SETTINGS_KEYS.has(key)) {
        filtered[key] = value
      }
    }
    if (Object.keys(filtered).length > 0) {
      await chrome.storage.local.set(filtered)
    }
  }

  // Invalidate scheduler L1 cache for every written store, then broadcast so
  // consumers (popup, douban overlays, PT dimmer) pick up the data immediately
  const cm = getCacheManager()
  if (cm) for (const s of writtenStores) invalidateSchedulerStore(cm, s, writtenKeys.get(s))
  for (const s of writtenStores) broadcast('record:updated', { storeName: s, key: '*', bulk: true })

  infoLog(`📥 Imported ${totalImported} records across ${Object.keys(payload.stores).length} stores`)
  broadcast('sync:completed', { storeCount: Object.keys(payload.stores).length, totalImported })
  sendResponse({ success: true })
}

/** GET_STATISTICS — aggregate counts across all stores */
export async function handleGetStatistics(sendResponse: SendResponse) {
  const stats: Statistics = {
    total: 0, movie: 0, tv: 0, music: 0, book: 0,
    douban: 0, imdb: 0, neodb: 0, tmdb: 0,
    bilibili: 0,
    youtube: 0,
    bangumi: 0,
  }

  for (const storeName of RECORD_STORES) {
    const entries = await mediaDB.getAll(storeName)
    const platform = storePlatformMap[storeName] || 'unknown'

    stats.total += entries.length
    if (platform && platform in stats) {
      (stats as unknown as Record<string, number>)[platform] += entries.length
    }

    for (const entry of entries) {
      const type = entry.key.split('::')[0]
      if (type && type in stats) {
        (stats as unknown as Record<string, number>)[type]++
      }
    }
  }

  sendResponse({ success: true, stats })
}

/** GET_ALL_RECORDS — flatten all stores for popup display */
export async function handleGetAllRecords(sendResponse: SendResponse) {
  const allRecords: any[] = []

  for (const storeName of RECORD_STORES) {
    const entries = await mediaDB.getAll(storeName)
    for (const entry of entries) {
      const [type, ...idParts] = entry.key.split('::')
      const providerId = idParts.join('::')
      // Normalize Bilibili/YouTube record types: all are videos,
      // regardless of actual key prefix (legacy records may have bvid/movie prefixes)
      const normalizedType = storeName === STORE_NAMES.BILIBILI || storeName === STORE_NAMES.YOUTUBE ? 'video' : type
      allRecords.push({
        ...entry.record,
        type: normalizedType,
        provider: storePlatformMap[storeName] || 'unknown',
        providerId,
      })
    }
  }

  sendResponse({ success: true, records: allRecords })
}

/** GET_MIGRATION_STATUS — return current migration info */
export function handleGetMigrationStatus(sendResponse: SendResponse) {
  sendResponse({ success: true, migration: getMigrationInfo() })
}
