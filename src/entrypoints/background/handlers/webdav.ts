/**
 * WebDAV Sync Message Handlers
 *
 * Handles WEBDAV_TEST, WEBDAV_UPLOAD, WEBDAV_DOWNLOAD, WEBDAV_SYNC messages.
 * Extracted from background.ts for modularity.
 */

import type { RecordStoreName, RemoteMeta, DatasetMeta, MessagePayloadMap, StoreRecord, AppSettings } from '@/types'
import { mediaDB, RECORD_STORES, BACKUP_STORES, STORE_NAMES, normalizeStoreRecordKey } from '@/features/database/models'
import { normalizeStoreRecord } from '@/features/migration/models'
import * as WebDAV from '@/features/webdav/api'
import { packageDataset, unpackageDataset } from '@/utils/zip-utils'
import { calculateStoreHash } from '@/utils/hash-utils'
import { errorLog } from '@/utils/logger'
import { broadcast } from '@/utils/event-bus'
import { getCacheManager, invalidateSchedulerStore } from './cache-invalidation'
import { EXPORT_SETTINGS_KEYS, IMPORT_SETTINGS_KEYS } from './data'
import { settingsCache } from '@/features/settings/cache'
import { STORAGE_KEYS } from '@/config'
import { errorMessage, type SendResponse } from '@/utils/error-message'

/** Read WebDAV settings from chrome.storage.local */
async function getWebDAVSettings() {
  const result = (await chrome.storage.local.get(null)) as {
    [STORAGE_KEYS.WEBDAV_URL]?: string
    [STORAGE_KEYS.WEBDAV_USERNAME]?: string
    [STORAGE_KEYS.WEBDAV_PASSWORD]?: string
  }
  return {
    webdavUrl: result[STORAGE_KEYS.WEBDAV_URL] || '',
    webdavUsername: result[STORAGE_KEYS.WEBDAV_USERNAME] || '',
    webdavPassword: result[STORAGE_KEYS.WEBDAV_PASSWORD] || '',
  }
}

/**
 * ADR-016: settings are backed up as a virtual `__settings__` dataset inside
 * `RemoteMeta.datasets` (scheme A — no RemoteMeta version bump). Settings are
 * scalar key/value pairs, not StoreRecord rows, so they travel as a JSON blob
 * rather than a packaged ZIP.
 */
export const SETTINGS_DATASET_KEY = '__settings__'

/**
 * Collect the non-sensitive settings (ADR-016 decision 1: reuses
 * EXPORT_SETTINGS_KEYS, 12 items including neodbToken, excludes WebDAV
 * credentials) into a plain JSON object.
 */
export function collectBackupSettings(): Record<string, unknown> {
  const appSettings = settingsCache.get()
  const settingsPayload: Record<string, unknown> = {}
  for (const key of EXPORT_SETTINGS_KEYS) {
    const value = appSettings[key]
    if (value !== undefined) settingsPayload[key] = value
  }
  return settingsPayload
}

/**
 * SHA-256 hash of the settings JSON (stable UTF-8 → SHA-256). Settings are
 * scalar values, not StoreRecord rows, so calculateStoreHash (which dereferences
 * record.status/rating/linkedIds/url) does not apply; a direct content hash is
 * the type-safe equivalent of the ADR-016 example that used `as any` to fake a
 * StoreRecord (banned by project convention).
 */
export async function calculateSettingsHash(settings: Record<string, unknown>): Promise<string> {
  const keys = Object.keys(settings).toSorted((a, b) => a.localeCompare(b))
  const sorted: Record<string, unknown> = {}
  for (const k of keys) sorted[k] = settings[k]
  const encoder = new TextEncoder()
  const data = encoder.encode(JSON.stringify(sorted))
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

/*
 * Restored bilibili/youtube keys are normalized to canonical movie:: form at write time
 * (normalizeStoreRecordKey, models.ts) — legacy 'video::X' / bare 'X' keys from a pre-v13
 * backup land as 'movie::X', mirroring the v13 DB migration. See decision-3.
 */

/**
 * Invalidate the scheduler L1 cache and broadcast record:updated for every
 * store written by a bulk WebDAV download/merge path, so merged/downloaded
 * records are visible immediately instead of after the 5-10s cache TTL.
 */
function flushStoreCacheInvalidations(
  writtenStores: Set<string>,
  writtenKeys: Map<string, string[]>
): void {
  const cm = getCacheManager()
  if (cm) {
    for (const s of writtenStores) invalidateSchedulerStore(cm, s, writtenKeys.get(s))
  }
  for (const s of writtenStores) {
    broadcast('record:updated', { storeName: s, key: '*', bulk: true })
  }
}

/** Build local meta for all record stores */
async function buildLocalMeta(): Promise<RemoteMeta> {
  const datasets: DatasetMeta[] = []
  for (const storeName of RECORD_STORES) {
    const entries = await mediaDB.getAll(storeName)
    const hash = await calculateStoreHash(entries)
    let latestTs = ''
    for (const e of entries) {
      if (e.record.updatedAt > latestTs) latestTs = e.record.updatedAt
    }
    datasets.push({
      key: storeName,
      hash,
      updatedAt: latestTs || new Date().toISOString(),
      recordCount: entries.length,
      dataVersion: 1,
    })
  }
  // Include jav_ids store in sync metadata
  const javEntries = await mediaDB.getAll(STORE_NAMES.JAV_IDS)
  if (javEntries.length > 0) {
    const javHash = await calculateStoreHash(javEntries)
    let latestTs = ''
    for (const e of javEntries) {
      if (e.record.updatedAt > latestTs) latestTs = e.record.updatedAt
    }
    datasets.push({
      key: STORE_NAMES.JAV_IDS,
      hash: javHash,
      updatedAt: latestTs || new Date().toISOString(),
      recordCount: javEntries.length,
      dataVersion: 1,
    })
  }
  // ADR-016: include __settings__ virtual dataset meta so sync sees it locally.
  // Settings themselves are only restored via upload/download (sync skips them),
  // but the meta entry keeps the local/remote dataset sets symmetric.
  const localSettings = collectBackupSettings()
  const settingsHash = await calculateSettingsHash(localSettings)
  datasets.push({
    key: SETTINGS_DATASET_KEY,
    hash: settingsHash,
    updatedAt: new Date().toISOString(),
    recordCount: Object.keys(localSettings).length,
    dataVersion: 1,
  })
  return {
    schema: 'umm-meta',
    version: 1,
    generatedAt: new Date().toISOString(),
    datasets,
  }
}

/**
 * WEBDAV_TEST payload — canonical fields from MessagePayloadMap plus
 * legacy aliases ({ url, username, password }) still sent by older callers.
 */
type WebDAVTestPayload = MessagePayloadMap['WEBDAV_TEST'] & {
  url?: string
  username?: string
  password?: string
}

/** WEBDAV_TEST — check connection */
export async function handleWebDAVTest(
  payload: WebDAVTestPayload,
  sendResponse: SendResponse
) {
  try {
    let webdavUrl: string
    let webdavUsername: string
    let webdavPassword: string

    if (payload) {
      webdavUrl = payload.webdavUrl ?? payload.url ?? ''
      webdavUsername = payload.webdavUsername ?? payload.username ?? ''
      webdavPassword = payload.webdavPassword ?? payload.password ?? ''
    } else {
      const settings = await getWebDAVSettings()
      webdavUrl = settings.webdavUrl
      webdavUsername = settings.webdavUsername
      webdavPassword = settings.webdavPassword
    }

    const result = await WebDAV.testConnection(webdavUrl, webdavUsername, webdavPassword)
    sendResponse({ success: true, ...result })
  } catch (err: unknown) {
    sendResponse({ success: false, message: errorMessage(err) })
  }
}

/** WEBDAV_UPLOAD — local → WebDAV */
export async function handleWebDAVUpload(sendResponse: SendResponse) {
  try {
    const { webdavUrl, webdavUsername, webdavPassword } = await getWebDAVSettings()
    if (!webdavUrl) {
      sendResponse({ success: false, error: 'WebDAV URL not configured' })
      return
    }

    await WebDAV.createDirectory(webdavUrl, webdavUsername, webdavPassword)

    let totalUploaded = 0
    const datasetMetas: DatasetMeta[] = []

    // Backup all record stores plus jav_ids so adult viewing history is included too.
    for (const storeName of BACKUP_STORES) {
      const entries = await mediaDB.getAll(storeName)
      if (entries.length === 0) {
        datasetMetas.push({
          key: storeName,
          hash: 'empty',
          updatedAt: new Date().toISOString(),
          recordCount: 0,
          dataVersion: 1,
        })
        continue
      }

      const { blob, meta } = await packageDataset(storeName, entries)
      await WebDAV.uploadDataset(webdavUrl, webdavUsername, webdavPassword, storeName, blob)
      datasetMetas.push(meta)
      totalUploaded += entries.length
    }

    // ADR-016 decision 1: upload non-sensitive settings (12 keys, excludes
    // WebDAV credentials) as a virtual __settings__ dataset. Settings are
    // scalar values, not StoreRecord rows, so they travel as a plain JSON blob
    // (application/json) instead of a packaged ZIP. This is the single source
    // of truth for the upload side; buildLocalMeta mirrors the meta entry.
    const settingsPayload = collectBackupSettings()
    const settingsBlob = new Blob([JSON.stringify(settingsPayload, null, 2)], { type: 'application/json' })
    await WebDAV.uploadDataset(webdavUrl, webdavUsername, webdavPassword, SETTINGS_DATASET_KEY, settingsBlob)
    const settingsHash = await calculateSettingsHash(settingsPayload)
    datasetMetas.push({
      key: SETTINGS_DATASET_KEY,
      hash: settingsHash,
      updatedAt: new Date().toISOString(),
      recordCount: Object.keys(settingsPayload).length,
      dataVersion: 1,
    })

    const remoteMeta: RemoteMeta = {
      schema: 'umm-meta',
      version: 1,
      generatedAt: new Date().toISOString(),
      datasets: datasetMetas,
    }
    await WebDAV.uploadMeta(webdavUrl, webdavUsername, webdavPassword, remoteMeta)

    sendResponse({
      success: true,
      totalUploaded,
      timestamp: remoteMeta.generatedAt,
      direction: 'upload',
      message: `已上传 ${totalUploaded} 条记录`,
    })
  } catch (err: unknown) {
    errorLog('WebDAV upload failed:', err)
    sendResponse({ success: false, error: errorMessage(err), message: (err as Error)?.message || '上传失败' })
  }
}

/** WEBDAV_DOWNLOAD — WebDAV → local */
export async function handleWebDAVDownload(sendResponse: SendResponse) {
  try {
    const { webdavUrl, webdavUsername, webdavPassword } = await getWebDAVSettings()
    if (!webdavUrl) {
      sendResponse({ success: false, error: 'WebDAV URL not configured' })
      return
    }

    const remoteMeta = await WebDAV.fetchRemoteMeta(webdavUrl, webdavUsername, webdavPassword)
    if (!remoteMeta) {
      sendResponse({ success: false, error: 'No remote data found', message: '云端没有数据' })
      return
    }

    let totalDownloaded = 0
    const writtenStores = new Set<string>()
    const writtenKeys = new Map<string, string[]>()
    for (const ds of remoteMeta.datasets) {
      // ADR-016 decision 4/5: the __settings__ virtual dataset carries scalar
      // settings (not StoreRecord rows) as a JSON blob. Route it to a dedicated
      // restore path BEFORE the BACKUP_STORES allowlist check — __settings__ is
      // not an IndexedDB store name, so the allowlist would otherwise reject it.
      // The restore reuses IMPORT_SETTINGS_KEYS (data.ts) so a malicious WebDAV
      // server cannot inject credential keys (webdavUrl/Username/Password) —
      // the security model mirrors handleImportData exactly.
      if (ds.key === SETTINGS_DATASET_KEY) {
        if (ds.recordCount === 0) continue
        try {
          const blob = await WebDAV.downloadDataset(webdavUrl, webdavUsername, webdavPassword, SETTINGS_DATASET_KEY)
          const text = await blob.text()
          let rawSettings: Record<string, unknown>
          try {
            rawSettings = JSON.parse(text) as Record<string, unknown>
          } catch (parseErr: unknown) {
            errorLog(`WebDAV download: ${SETTINGS_DATASET_KEY} dataset is not valid JSON, skipping: ${errorMessage(parseErr)}`)
            continue
          }
          // Reuse IMPORT_SETTINGS_KEYS whitelist (mirrors EXPORT_SETTINGS_KEYS,
          // excludes WebDAV credentials) — same security model as handleImportData.
          // Iterate EXPORT_SETTINGS_KEYS for keyof-AppSettings typing; the .has()
          // check keeps the runtime gate on IMPORT_SETTINGS_KEYS so a future
          // divergence (if IMPORT_SETTINGS_KEYS is ever narrowed) is honored.
          const filtered: Record<string, unknown> = {}
          for (const key of EXPORT_SETTINGS_KEYS) {
            if (IMPORT_SETTINGS_KEYS.has(key) && key in rawSettings) {
              filtered[key] = rawSettings[key]
            }
          }
          if (Object.keys(filtered).length > 0) {
            await settingsCache.updateAll(filtered as Partial<AppSettings>)
          }
        } catch (dsErr: unknown) {
          errorLog(`WebDAV download skipped '${ds.key}': ${errorMessage(dsErr)}`)
        }
        continue
      }
      if (ds.recordCount === 0) continue
      // Security: only accept datasets whose store name is a known backup store
      // (record stores + jav_ids). remoteMeta comes from an external WebDAV server
      // and is attacker-influenceable; an arbitrary store name would let a malicious
      // server write into any store.
      if (!BACKUP_STORES.includes(ds.key as RecordStoreName)) {
        errorLog(`WebDAV download skipped '${ds.key}': not a known backup store`)
        continue
      }
      try {
        const blob = await WebDAV.downloadDataset(webdavUrl, webdavUsername, webdavPassword, ds.key)
        const { data } = await unpackageDataset(blob)
        const batch: Array<{ key: string; record: StoreRecord }> = []
        for (const [key, record] of Object.entries(data)) {
          // Validate record shape before writing (external data is untrusted).
          if (typeof record !== 'object' || record === null || typeof key !== 'string') continue
          try {
            // Migrate old-schema records (0→1→2) to the current schema (adds `comment`).
            // A too-new record throws MigrationError — skip just that record.
            const { record: migrated } = normalizeStoreRecord(record)
            batch.push({ key: normalizeStoreRecordKey(ds.key, key), record: migrated })
          } catch (err: unknown) {
            errorLog(`WebDAV download skipped record '${key}' in '${ds.key}': ${errorMessage(err)}`)
          }
        }
        if (batch.length > 0) {
          await mediaDB.batchPut(ds.key as RecordStoreName, batch)
          writtenStores.add(ds.key)
          writtenKeys.set(ds.key, [...(writtenKeys.get(ds.key) ?? []), ...batch.map(b => b.key)])
        }
        totalDownloaded += Object.keys(data).length
      } catch (dsErr: unknown) {
        errorLog(`WebDAV download skipped '${ds.key}': ${errorMessage(dsErr)}`)
        continue
      }
    }

    flushStoreCacheInvalidations(writtenStores, writtenKeys)
    broadcast('sync:completed', { direction: 'download', totalDownloaded })
    sendResponse({
      success: true,
      totalDownloaded,
      timestamp: remoteMeta.generatedAt,
      direction: 'download',
      message: `已下载 ${totalDownloaded} 条记录`,
    })
  } catch (err: unknown) {
    errorLog('WebDAV download failed:', err)
    sendResponse({ success: false, error: errorMessage(err), message: (err as Error)?.message || '下载失败' })
  }
}

/** WEBDAV_SYNC — merge: compare local vs remote, sync each dataset directionally */
export async function handleWebDAVSync(sendResponse: SendResponse) {
  try {
    const { webdavUrl, webdavUsername, webdavPassword } = await getWebDAVSettings()
    if (!webdavUrl) {
      sendResponse({ success: false, error: 'WebDAV URL not configured' })
      return
    }

    const localMeta = await buildLocalMeta()
    const localMap = new Map(localMeta.datasets.map(d => [d.key, d]))

    const remoteMeta = await WebDAV.fetchRemoteMeta(webdavUrl, webdavUsername, webdavPassword)
    const remoteMap = new Map((remoteMeta?.datasets || []).map(d => [d.key, d]))

    const allKeys = new Set([...localMap.keys(), ...remoteMap.keys()])

    let uploaded = 0
    let downloaded = 0
    let skipped = 0
    const resultingMetas: DatasetMeta[] = []
    const writtenStores = new Set<string>()
    const writtenKeys = new Map<string, string[]>()

    for (const key of allKeys) {
      const local = localMap.get(key)
      const remote = remoteMap.get(key)

      // ADR-016 decision 5: settings do not participate in the bidirectional
      // merge. Settings are scalar values with no primary-key merge semantics,
      // and changes are infrequent (typically one device). Preserve the local
      // meta (buildLocalMeta always emits it) and skip upload/download — users
      // who want settings synced use the explicit upload/download actions.
      if (key === SETTINGS_DATASET_KEY) {
        resultingMetas.push(local || remote || {
          key,
          hash: 'empty',
          updatedAt: new Date().toISOString(),
          recordCount: 0,
          dataVersion: 1,
        })
        skipped++
        continue
      }

      // Security: mirror the download-path guard — only sync known backup stores
      // (record stores + jav_ids). remoteMeta.datasets[].key is attacker-influenceable
      // on a malicious/compromised WebDAV endpoint; writing into non-backup stores
      // (pt_id_cache / ttl_cache) would poison them (wrong PT dimming, stale cache).
      if (!BACKUP_STORES.includes(key as RecordStoreName)) {
        errorLog(`WebDAV sync skipped dataset '${key}': not a known backup store`)
        resultingMetas.push(local || remote || {
          key,
          hash: 'empty',
          updatedAt: new Date().toISOString(),
          recordCount: 0,
          dataVersion: 1,
        })
        continue
      }

      try {
        // Both empty → skip
        if ((!local || local.recordCount === 0) && (!remote || remote.recordCount === 0)) {
          skipped++
          resultingMetas.push(local || remote || {
            key,
            hash: 'empty',
            updatedAt: new Date().toISOString(),
            recordCount: 0,
            dataVersion: 1,
          })
          continue
        }

        // Only local → upload
        if (!remote || remote.recordCount === 0) {
          const entries = await mediaDB.getAll(key as RecordStoreName)
          const { blob, meta } = await packageDataset(key as RecordStoreName, entries)
          await WebDAV.uploadDataset(webdavUrl, webdavUsername, webdavPassword, key, blob)
          resultingMetas.push(meta)
          uploaded += entries.length
          continue
        }

        // Only remote → download
        if (!local || local.recordCount === 0) {
          const blob = await WebDAV.downloadDataset(webdavUrl, webdavUsername, webdavPassword, key)
          const { data } = await unpackageDataset(blob)
          const batch: Array<{ key: string; record: StoreRecord }> = []
          for (const [recordKey, record] of Object.entries(data)) {
            if (typeof record !== 'object' || record === null || typeof recordKey !== 'string') continue
            try {
              // Migrate old-schema records (0→1→2) to the current schema (adds `comment`).
              // A too-new record throws MigrationError — skip just that record.
              const { record: migrated } = normalizeStoreRecord(record)
              batch.push({ key: normalizeStoreRecordKey(key, recordKey), record: migrated })
            } catch (err: unknown) {
              errorLog(`WebDAV sync skipped record '${recordKey}' in '${key}': ${errorMessage(err)}`)
            }
          }
          if (batch.length > 0) {
            await mediaDB.batchPut(key as RecordStoreName, batch)
            writtenStores.add(key)
            writtenKeys.set(key, [...(writtenKeys.get(key) ?? []), ...batch.map(b => b.key)])
          }
          resultingMetas.push(remote)
          downloaded += Object.keys(data).length
          continue
        }

        // Both have data — compare hashes
        if (local.hash === remote.hash) {
          skipped++
          resultingMetas.push(local)
          continue
        }

        // Different hashes — compare updatedAt, newer wins
        if (local.updatedAt >= remote.updatedAt) {
          const entries = await mediaDB.getAll(key as RecordStoreName)
          const { blob, meta } = await packageDataset(key as RecordStoreName, entries)
          await WebDAV.uploadDataset(webdavUrl, webdavUsername, webdavPassword, key, blob)
          resultingMetas.push(meta)
          uploaded += entries.length
        } else {
          const blob = await WebDAV.downloadDataset(webdavUrl, webdavUsername, webdavPassword, key)
          const { data } = await unpackageDataset(blob)
          const batch: Array<{ key: string; record: StoreRecord }> = []
          for (const [recordKey, record] of Object.entries(data)) {
            if (typeof record !== 'object' || record === null || typeof recordKey !== 'string') continue
            try {
              // Migrate old-schema records (0→1→2) to the current schema (adds `comment`).
              // A too-new record throws MigrationError — skip just that record.
            const { record: migrated } = normalizeStoreRecord(record)
            batch.push({ key: normalizeStoreRecordKey(key, recordKey), record: migrated })
          } catch (err: unknown) {
            errorLog(`WebDAV sync skipped record '${recordKey}' in '${key}': ${errorMessage(err)}`)
            }
          }
          if (batch.length > 0) {
            await mediaDB.batchPut(key as RecordStoreName, batch)
            writtenStores.add(key)
            writtenKeys.set(key, [...(writtenKeys.get(key) ?? []), ...batch.map(b => b.key)])
          }
          resultingMetas.push(remote)
          downloaded += Object.keys(data).length
        }
      } catch (dsErr: unknown) {
        errorLog(`WebDAV sync skipped dataset '${key}': ${errorMessage(dsErr)}`)
        resultingMetas.push(local || remote || {
          key,
          hash: 'empty',
          updatedAt: new Date().toISOString(),
          recordCount: 0,
          dataVersion: 1,
        })
        continue
      }
    }

    // Update remote meta after merge
    const newRemoteMeta: RemoteMeta = {
      schema: 'umm-meta',
      version: 1,
      generatedAt: new Date().toISOString(),
      datasets: resultingMetas,
    }
    await WebDAV.createDirectory(webdavUrl, webdavUsername, webdavPassword)
    await WebDAV.uploadMeta(webdavUrl, webdavUsername, webdavPassword, newRemoteMeta)

    const parts: string[] = []
    if (uploaded > 0) parts.push(`上传 ${uploaded} 条`)
    if (downloaded > 0) parts.push(`下载 ${downloaded} 条`)
    if (skipped > 0) parts.push(`${skipped} 个数据集无变化`)
    const msg = parts.length > 0 ? parts.join('，') : '所有数据集均无变化'

    flushStoreCacheInvalidations(writtenStores, writtenKeys)
    broadcast('sync:completed', { direction: 'merge', uploaded, downloaded, skipped })
    sendResponse({
      success: true,
      direction: 'merge',
      message: msg,
      uploaded,
      downloaded,
      skipped,
      timestamp: newRemoteMeta.generatedAt,
    })
  } catch (err: unknown) {
    errorLog('WebDAV sync failed:', err)
    sendResponse({ success: false, error: errorMessage(err), message: (err as Error)?.message || '同步失败' })
  }
}
