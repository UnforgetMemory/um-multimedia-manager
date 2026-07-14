/**
 * Data Message Handlers
 *
 * Handles GET_SETTINGS, UPDATE_SETTINGS, EXPORT_DATA, IMPORT_DATA,
 * GET_STATISTICS, GET_ALL_RECORDS, GET_MIGRATION_STATUS messages.
 * Extracted from background.ts for modularity.
 */

import type { AppSettings, ExportData, Statistics } from '@/types'
import { mediaDB, RECORD_STORES, STORE_NAMES } from '@/features/database/models'
import { validateExportVersion, getMigrationInfo, MigrationError } from '@/features/migration/models'
import { settingsCache } from '@/features/settings/cache'
import { infoLog, warnLog } from '@/utils/logger'
import { STORAGE_KEYS } from '@/config'

/** Settings fields to include in export (all AppSettings keys except sensitive credentials) */
const EXPORT_SETTINGS_KEYS: Array<keyof AppSettings> = [
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

type SendResponse = (response?: any) => void

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
  } catch (err) {
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

  // Import each store — put() auto-stamps schemaVersion + recordVersion
  let totalImported = 0
  for (const [storeName, records] of Object.entries(payload.stores)) {
    if (!RECORD_STORES.includes(storeName) && storeName !== STORE_NAMES.JAV_IDS) continue
    for (const [key, record] of Object.entries(records)) {
      // Normalize: ensure required fields exist (imported JSON may omit them)
      if (record.linkedIds === undefined) record.linkedIds = {}
      if (record.url === undefined) record.url = ''
      if (record.status === undefined) record.status = 0
      if (record.rating === undefined) record.rating = 0
      if (record.updatedAt === undefined) record.updatedAt = new Date().toISOString()
      await mediaDB.put(storeName, key, record)
      totalImported++
    }
  }

  // Import settings if present (whitelist allowed keys only)
  if (payload.settings) {
    const allowedKeys = new Set<string>(Object.values(STORAGE_KEYS))
    const filtered: Record<string, any> = {}
    for (const [key, value] of Object.entries(payload.settings)) {
      if (allowedKeys.has(key)) {
        filtered[key] = value
      }
    }
    if (Object.keys(filtered).length > 0) {
      await chrome.storage.local.set(filtered)
    }
  }

  infoLog(`📥 Imported ${totalImported} records across ${Object.keys(payload.stores).length} stores`)
  sendResponse({ success: true })
}

/** GET_STATISTICS — aggregate counts across all stores */
export async function handleGetStatistics(sendResponse: SendResponse) {
  const stats: Statistics = {
    total: 0, movie: 0, tv: 0, music: 0, book: 0,
    douban: 0, imdb: 0, neodb: 0, tmdb: 0,
    bilibili: 0,
  }

  const storePlatformMap: Record<string, string> = {
    [STORE_NAMES.DOUBAN]: 'douban',
    [STORE_NAMES.IMDB]: 'imdb',
    [STORE_NAMES.NEODB]: 'neodb',
    [STORE_NAMES.TMDB]: 'tmdb',
    [STORE_NAMES.BILIBILI]: 'bilibili',
  }

  for (const storeName of RECORD_STORES) {
    const entries = await mediaDB.getAll(storeName)
    const platform = storePlatformMap[storeName] || 'unknown'

    stats.total += entries.length
    if (platform && platform in stats) {
      (stats as any)[platform] += entries.length
    }

    for (const entry of entries) {
      const type = entry.key.split('::')[0]
      if (type && type in stats) {
        (stats as any)[type]++
      }
    }
  }

  sendResponse({ success: true, stats })
}

/** GET_ALL_RECORDS — flatten all stores for popup display */
export async function handleGetAllRecords(sendResponse: SendResponse) {
  const allRecords: any[] = []
  const storePlatformMap: Record<string, string> = {
    [STORE_NAMES.DOUBAN]: 'douban',
    [STORE_NAMES.IMDB]: 'imdb',
    [STORE_NAMES.NEODB]: 'neodb',
    [STORE_NAMES.TMDB]: 'tmdb',
    [STORE_NAMES.BILIBILI]: 'bilibili',
  }

  for (const storeName of RECORD_STORES) {
    const entries = await mediaDB.getAll(storeName)
    for (const entry of entries) {
      const [type, ...idParts] = entry.key.split('::')
      const providerId = idParts.join('::')
      // Normalize Bilibili record types: all Bilibili records are videos,
      // regardless of actual key prefix (legacy records may have bvid/movie prefixes)
      const normalizedType = storeName === STORE_NAMES.BILIBILI ? 'video' : type
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
