/**
 * WebDAV Sync Message Handlers
 *
 * Handles WEBDAV_TEST, WEBDAV_UPLOAD, WEBDAV_DOWNLOAD, WEBDAV_SYNC messages.
 * Extracted from background.ts for modularity.
 */

import type { RecordStoreName, RemoteMeta, DatasetMeta } from '@/types'
import { mediaDB, RECORD_STORES, STORE_NAMES } from '@/features/database/models'
import * as WebDAV from '@/features/webdav/api'
import { packageDataset, unpackageDataset } from '@/utils/zip-utils'
import { calculateStoreHash } from '@/utils/hash-utils'
import { errorLog } from '@/utils/logger'
import { STORAGE_KEYS } from '@/config'

type SendResponse = (response?: any) => void

/** Read WebDAV settings from chrome.storage.local */
async function getWebDAVSettings() {
  const result = (await chrome.storage.local.get(null)) as Record<string, any>
  return {
    webdavUrl: result[STORAGE_KEYS.WEBDAV_URL] || '',
    webdavUsername: result[STORAGE_KEYS.WEBDAV_USERNAME] || '',
    webdavPassword: result[STORAGE_KEYS.WEBDAV_PASSWORD] || '',
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
  return {
    schema: 'umm-meta',
    version: 1,
    generatedAt: new Date().toISOString(),
    datasets,
  }
}

/** WEBDAV_TEST — check connection */
export async function handleWebDAVTest(
  payload: any,
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
  } catch (err: any) {
    sendResponse({ success: false, message: err?.message || String(err) })
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

    for (const storeName of RECORD_STORES) {
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
  } catch (err: any) {
    errorLog('WebDAV upload failed:', err)
    sendResponse({ success: false, error: err?.message || String(err), message: err?.message || '上传失败' })
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
    for (const ds of remoteMeta.datasets) {
      if (ds.recordCount === 0) continue
      try {
        const blob = await WebDAV.downloadDataset(webdavUrl, webdavUsername, webdavPassword, ds.key)
        const { data } = await unpackageDataset(blob)
        for (const [key, record] of Object.entries(data)) {
          await mediaDB.put(ds.key as RecordStoreName, key, record)
        }
        totalDownloaded += Object.keys(data).length
      } catch (dsErr: any) {
        errorLog(`WebDAV download skipped '${ds.key}': ${dsErr?.message || String(dsErr)}`)
        continue
      }
    }

    sendResponse({
      success: true,
      totalDownloaded,
      timestamp: remoteMeta.generatedAt,
      direction: 'download',
      message: `已下载 ${totalDownloaded} 条记录`,
    })
  } catch (err: any) {
    errorLog('WebDAV download failed:', err)
    sendResponse({ success: false, error: err?.message || String(err), message: err?.message || '下载失败' })
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

    for (const key of allKeys) {
      const local = localMap.get(key)
      const remote = remoteMap.get(key)

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
          for (const [recordKey, record] of Object.entries(data)) {
            await mediaDB.put(key as RecordStoreName, recordKey, record)
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
          for (const [recordKey, record] of Object.entries(data)) {
            await mediaDB.put(key as RecordStoreName, recordKey, record)
          }
          resultingMetas.push(remote)
          downloaded += Object.keys(data).length
        }
      } catch (dsErr: any) {
        errorLog(`WebDAV sync skipped dataset '${key}': ${dsErr?.message || String(dsErr)}`)
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

    sendResponse({
      success: true,
      direction: 'merge',
      message: msg,
      uploaded,
      downloaded,
      skipped,
      timestamp: newRemoteMeta.generatedAt,
    })
  } catch (err: any) {
    errorLog('WebDAV sync failed:', err)
    sendResponse({ success: false, error: err?.message || String(err), message: err?.message || '同步失败' })
  }
}
