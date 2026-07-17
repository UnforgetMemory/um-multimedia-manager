/**
 * Background Service Worker — UMM 多媒体管理器 (WXT)
 *
 * Responsibilities:
 * - Message routing (Content Script ↔ Popup ↔ Background)
 * - Single IndexedDB connection (via mediaDB singleton)
 * - Alarm-based periodic tasks
 * - Notification management
 */

import { defineBackground } from 'wxt/utils/define-background'
import type { LogLevel } from '@/types'
import { mediaDB, RECORD_STORES, STORE_NAMES } from '@/features/database/models'
import { debugLog, infoLog, warnLog, errorLog, configureLogging } from '@/utils/logger'
import { STORAGE_KEYS } from '@/config'
import { broadcast } from '@/utils/event-bus'

import { DataScheduler } from '@/features/data-scheduler/data-scheduler'
import { CacheManager } from '@/features/cache'
import { infoLog as schedulerLog } from '@/utils/logger'
import { UmmApiClient } from '@umm/sdk'

// Handler imports
import { handleWebDAVTest, handleWebDAVUpload, handleWebDAVDownload, handleWebDAVSync } from './background/handlers/webdav'
import { handleNeoDBPushRating } from './background/handlers/neodb'
import { handleGetSettings, handleUpdateSettings, handleExportData, handleImportData, handleGetStatistics, handleGetAllRecords, handleGetMigrationStatus } from './background/handlers/data'
import { handleShowToast } from './background/handlers/toast'
import { handleAdultAvCheck, handleAdultAvCheckBatch, handleAdultAvAdd, handleAdultAvBatchAdd, handleAdultAvGetAll, handleSehuatangCheckViewed, handleSehuatangAdd, handleSehuatangBatchAdd, handleSehuatangGetAll } from './background/handlers/adult-av'
import * as NeoDB from '@/features/neodb/api'
import { settingsCache } from '@/features/settings/cache'

/** Allowed store names for generic DB message handlers */
const ALLOWED_DB_STORES = new Set<string>([
  ...RECORD_STORES,
  STORE_NAMES.TTL_CACHE,
  STORE_NAMES.PT_ID_CACHE,
  STORE_NAMES.JAV_IDS,
])

function isAllowedStore(storeName: string): boolean {
  return ALLOWED_DB_STORES.has(storeName)
}

// ── Sync Manager ──────────────────────────────────────

class SyncManager {
  private client: UmmApiClient | null = null
  private lastSyncAt: string = ''
  private syncInProgress = false

  async init() {
    const settings = await chrome.storage.sync.get([
      STORAGE_KEYS.SYNC_SERVER_URL,
      STORAGE_KEYS.SYNC_TOKEN,
    ])
    if (!settings[STORAGE_KEYS.SYNC_SERVER_URL] || !settings[STORAGE_KEYS.SYNC_TOKEN]) {
      debugLog('[Sync] Not configured — skipping')
      return
    }

    this.client = new UmmApiClient(
      String(settings[STORAGE_KEYS.SYNC_SERVER_URL]),
      String(settings[STORAGE_KEYS.SYNC_TOKEN]),
    )
    const stored = await chrome.storage.local.get('lastSyncAt')
    this.lastSyncAt = (stored.lastSyncAt as string) || ''
    debugLog('[Sync] Manager initialized')
  }

  async trigger() {
    if (this.syncInProgress || !this.client) return
    this.syncInProgress = true

    try {
      debugLog(`[Sync] Starting incremental sync from ${this.lastSyncAt || 'beginning'}...`)

      if (!mediaDB) {
        warnLog('[Sync] mediaDB not available')
        return
      }

      const items: Array<{
        platform: string; mediaType: string; providerSelfId: string;
        title: string; updatedAt: string;
      }> = []
      const marks: Array<{
        itemRef: { platform: string; mediaType: string; providerSelfId: string };
        status: number; rating?: number; comment?: string; updatedAt: string;
      }> = []

      for (const storeName of RECORD_STORES) {
        const platform = storeName.replace('_records', '')
        const entries = await mediaDB.getAll(storeName)

        for (const { key, record } of entries) {
          // Key format: "type::providerId" (e.g. "movie::37332784")
          const parts = key.split('::')
          if (parts.length < 2) continue
          const mediaType = parts[0]
          const providerSelfId = parts.slice(1).join('::')

          // Only sync records updated since last sync
          if (this.lastSyncAt && record.updatedAt <= this.lastSyncAt) continue

          // Only sync records with active status (not NONE/0)
          if (!record.status || record.status === 0) continue

          items.push({
            platform,
            mediaType,
            providerSelfId,
            title: '',
            updatedAt: record.updatedAt,
          })

          marks.push({
            itemRef: { platform, mediaType, providerSelfId },
            status: record.status,
            rating: record.rating > 0 ? record.rating : undefined,
            comment: record.comment || undefined,
            updatedAt: record.updatedAt,
          })
        }
      }

      if (items.length === 0 && marks.length === 0) {
        debugLog('[Sync] No new changes to sync')
        return
      }

      const result = await this.client.sync({
        lastSyncAt: this.lastSyncAt || new Date(0).toISOString(),
        items,
        marks,
        deletedMarkIds: [],
      })

      this.lastSyncAt = result.syncedAt
      await chrome.storage.local.set({ lastSyncAt: this.lastSyncAt })
      infoLog(`[Sync] Completed: ${result.upserted.items} items, ${result.upserted.marks} marks`)
    } catch (err) {
      errorLog('[Sync] Failed:', err)
    } finally {
      this.syncInProgress = false
    }
  }
}

export default defineBackground({
  type: 'module',

  main() {
    const startTime = Date.now()
    let dbReady = false
    let dbInitFailed = false

    // CacheManager — L1 in-memory LRU (shared across DataScheduler + MediaDatabase)
    const cacheManager = new CacheManager({ maxSize: 500, defaultTtlMs: 30_000 })

    // DataScheduler — request queue, rate limiter, retry, monitoring
    const dataScheduler = new DataScheduler(cacheManager)
    dataScheduler.onEvent((event) => {
      schedulerLog(`[Scheduler] ${event.type}${event.taskId ? ` id=${event.taskId}` : ''}${event.duration ? ` dur=${event.duration}ms` : ''}`)
    })

    // Pending message queue for messages arriving before DB is ready
    const MAX_QUEUE_SIZE = 50
    const pendingMessages: Array<{
      message: any
      sender: chrome.runtime.MessageSender
      sendResponse: (response?: any) => void
    }> = []

    function flushPendingMessages() {
      if (pendingMessages.length === 0) return
      infoLog(`📤 Flushing ${pendingMessages.length} pending messages...`)
      const queue = [...pendingMessages]
      pendingMessages.length = 0
      for (const { message, sender, sendResponse } of queue) {
        handleMessage(message, sender, sendResponse).catch(err => {
          errorLog('❌ handleMessage (flushed) failed:', err)
          sendResponse({ success: false, error: String(err) })
        })
      }
    }

    // Alarm: periodic shelf cache cleanup
    chrome.alarms.create('cleanupShelfCache', { periodInMinutes: 10 })
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === 'cleanupShelfCache') {
        NeoDB.cleanupShelfCache()
      }
    })

    // ==================== Log Config Sync ====================

    async function initLogConfig() {
      try {
        const result = await chrome.storage.local.get([STORAGE_KEYS.DEBUG_ENABLED, STORAGE_KEYS.LOG_LEVEL])
        configureLogging({
          enabled: (result[STORAGE_KEYS.DEBUG_ENABLED] as boolean) ?? false,
          level: (result[STORAGE_KEYS.LOG_LEVEL] as LogLevel) ?? 'info',
        })
      } catch {
        // Silent fallback — keep defaults
      }
    }

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return
      const enabledChange = changes[STORAGE_KEYS.DEBUG_ENABLED]
      const levelChange = changes[STORAGE_KEYS.LOG_LEVEL]
      if (enabledChange || levelChange) {
        configureLogging({
          enabled: enabledChange?.newValue as boolean | undefined,
          level: levelChange?.newValue as LogLevel | undefined,
        })
      }
    })

    initLogConfig()
    initBackground()

    async function initBackground() {
      infoLog('=== Service Worker Starting ===')

      await settingsCache.init()
      settingsCache.startListening()

      // Initialize SyncManager
      const syncManager = new SyncManager()
      syncManager.init().catch(err => errorLog('[Sync] Init failed:', err))

      // API availability check
      const requiredAPIs = ['storage', 'runtime', 'notifications', 'alarms']
      for (const api of requiredAPIs) {
        if (!(chrome as any)[api]) {
          errorLog(`❌ Required API missing: ${api}`)
        }
      }

      // Database init with timeout
      const dbTimeout = setTimeout(() => {
        errorLog('⚠️ Database init timeout after 10s')
      }, 10000)

      try {
        await mediaDB.init()
        clearTimeout(dbTimeout)
        debugLog('✅ Database initialized')
        dbReady = true
        flushPendingMessages()
      } catch (err) {
        clearTimeout(dbTimeout)
        errorLog('❌ Database initialization failed:', err)
        dbInitFailed = true
        flushPendingMessages()
      }

      infoLog('=== Service Worker Ready ===')
    }

    // ==================== Install / Update Hooks ====================

    chrome.runtime.onInstalled.addListener(async (details) => {
      infoLog('Extension installed/updated:', details.reason)

      await mediaDB.init().catch(err => {
        errorLog('Failed to init DB on install:', err)
      })

      if (details.reason === 'install') {
        chrome.contextMenus.create({
          id: 'open-popup',
          title: '🎛️ 打开 UMM 面板',
          contexts: ['all'],
        })
        chrome.contextMenus.create({
          id: 'separator',
          type: 'separator',
          contexts: ['all'],
        })
        chrome.contextMenus.create({
          id: 'show-stats',
          title: '📦 加载中...',
          contexts: ['all'],
          enabled: false,
        })
        await updateContextMenuStats()
      } else if (details.reason === 'update') {
        infoLog('Updated — v6 schema, no data migration required')
      }
    })

    chrome.contextMenus.onClicked.addListener((info, _tab) => {
      if (info.menuItemId === 'open-popup') {
        chrome.action.openPopup()
      }
    })

    // ==================== Message Handling ====================

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!sender.id || sender.id !== chrome.runtime.id) return false

      handleMessage(message, sender, sendResponse).catch(err => {
        errorLog('❌ handleMessage failed:', err)
        sendResponse({ success: false, error: String(err) })
      })

      return true // Keep channel open for async response
    })

    interface RuntimeMessage {
      type: string
      payload?: any
    }

    async function handleMessage(
      message: RuntimeMessage,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response?: any) => void
    ) {
      if (!chrome.runtime?.id) {
        sendResponse({ success: false, error: 'Extension context invalidated' })
        return
      }

      if (!message?.type) {
        sendResponse({ success: false, error: 'Invalid message format' })
        return
      }

      // SHOW_TOAST bypasses all DB gates — pure UI message
      if (message.type === 'SHOW_TOAST') {
        await handleShowToast(message.payload, sendResponse)
        return
      }

      // Queue message if DB not ready
      if (!dbReady && !dbInitFailed) {
        if (pendingMessages.length >= MAX_QUEUE_SIZE) {
          if (message.type !== 'HEALTH_CHECK') {
            warnLog(`[BG] Queue full (${MAX_QUEUE_SIZE}), dropping ${message.type}`)
            sendResponse({ success: false, error: 'Queue full' })
            return
          }
        }
        pendingMessages.push({ message, sender: _sender, sendResponse })
        setTimeout(() => {
          const idx = pendingMessages.findIndex(m => m.sendResponse === sendResponse)
          if (idx !== -1) {
            pendingMessages.splice(idx, 1)
            sendResponse({ success: false, error: 'DB_INIT_TIMEOUT' })
          }
        }, 15000)
        return
      }

      // Non-health-check messages fail if DB init failed
      if (dbInitFailed && message.type !== 'HEALTH_CHECK') {
        sendResponse({ success: false, error: 'DB_INIT_FAILED' })
        return
      }

      try {
        switch (message.type) {
          // ==================== Core DB Operations ====================
          case 'DB_GET': {
            if (!isAllowedStore(message.payload.storeName)) {
              sendResponse({ success: false, error: 'Invalid store name' }); break
            }
            const record = await dataScheduler.schedule(
              () => mediaDB.get(message.payload.storeName, message.payload.key),
              { priority: 'HIGH', storeName: message.payload.storeName, cacheKey: `get:${message.payload.storeName}:${message.payload.key}`, cacheTTL: 5000 },
            )
            sendResponse({ success: true, record })
            break
          }
          case 'DB_PUT': {
            if (!isAllowedStore(message.payload.storeName)) {
              sendResponse({ success: false, error: 'Invalid store name' }); break
            }
            const putStore = message.payload.storeName
            const putKey = message.payload.key
            await dataScheduler.schedule(
              () => mediaDB.put(putStore, putKey, message.payload.record),
              { priority: 'HIGH', storeName: putStore, cacheKey: `put:${putStore}:${putKey}`, invalidateCache: true },
            )
            // Invalidate GET cache so subsequent reads return fresh data
            dataScheduler.cacheManager?.invalidate('scheduler', `get:${putStore}:${putKey}`)
            broadcast('record:updated', { storeName: putStore, key: putKey })
            sendResponse({ success: true })
            break
          }
          case 'DB_DELETE': {
            if (!isAllowedStore(message.payload.storeName)) {
              sendResponse({ success: false, error: 'Invalid store name' }); break
            }
            const delStore = message.payload.storeName
            const delKey = message.payload.key
            await dataScheduler.schedule(
              () => mediaDB.delete(delStore, delKey),
              { priority: 'HIGH', storeName: delStore, cacheKey: `delete:${delStore}:${delKey}`, invalidateCache: true },
            )
            // Invalidate GET cache so subsequent reads reflect the deletion
            dataScheduler.cacheManager?.invalidate('scheduler', `get:${delStore}:${delKey}`)
            broadcast('record:deleted', { storeName: delStore, key: delKey })
            sendResponse({ success: true })
            break
          }
          case 'DB_GET_ALL': {
            if (!isAllowedStore(message.payload.storeName)) {
              sendResponse({ success: false, error: 'Invalid store name' }); break
            }
            const entries = await dataScheduler.schedule(
              () => mediaDB.getAll(message.payload.storeName),
              { priority: 'MEDIUM', storeName: message.payload.storeName, cacheKey: `all:${message.payload.storeName}`, cacheTTL: 5000 },
            )
            sendResponse({ success: true, entries })
            break
          }
          case 'DB_QUERY': {
            if (!isAllowedStore(message.payload.storeName)) {
              sendResponse({ success: false, error: 'Invalid store name' }); break
            }
            const entries = await dataScheduler.schedule(
              () => mediaDB.query(message.payload.storeName, message.payload.indexName, message.payload.value),
              { priority: 'MEDIUM', storeName: message.payload.storeName },
            )
            sendResponse({ success: true, entries })
            break
          }
          case 'DB_COUNT': {
            if (!isAllowedStore(message.payload.storeName)) {
              sendResponse({ success: false, error: 'Invalid store name' }); break
            }
            const count = await dataScheduler.schedule(
              () => mediaDB.count(message.payload.storeName),
              { priority: 'LOW', storeName: message.payload.storeName, cacheKey: `count:${message.payload.storeName}`, cacheTTL: 5000 },
            )
            sendResponse({ success: true, count })
            break
          }
          case 'DB_GET_WATCHED_IDS': {
            const { storeNames } = message.payload
            const results: Record<string, string[]> = {}
            for (const storeName of storeNames) {
              if (!isAllowedStore(storeName)) {
                warnLog(`DB_GET_WATCHED_IDS: skipped disallowed store "${storeName}"`)
                continue
              }
              const ids = await dataScheduler.schedule(
                () => mediaDB.getWatchedIds(storeName),
                { priority: 'HIGH', storeName, cacheKey: `watched:${storeName}`, cacheTTL: 10000 },
              )
              results[storeName] = Array.from(ids)
            }
            sendResponse({ success: true, results })
            break
          }
          case 'PT_ID_CACHE_GET': {
            const entry = await dataScheduler.schedule(
              () => mediaDB.getCacheEntry(message.payload.ptUrl),
              { priority: 'HIGH', cacheKey: `ptcache:${message.payload.ptUrl}`, cacheTTL: 5000 },
            )
            sendResponse({ success: true, entry })
            break
          }
          case 'PT_ID_CACHE_PUT': {
            await dataScheduler.schedule(
              () => mediaDB.putCacheEntry(message.payload.entry),
              { priority: 'HIGH', cacheKey: `ptcache:${message.payload.entry.ptUrl}`, invalidateCache: true },
            )
            sendResponse({ success: true })
            break
          }
          case 'PT_ID_CACHE_GET_BULK': {
            const { ptUrls } = message.payload
            const entries: Record<string, any> = {}
            for (const ptUrl of ptUrls) {
              const entry = await dataScheduler.schedule(
                () => mediaDB.getCacheEntry(ptUrl),
                { priority: 'MEDIUM', cacheKey: `ptcache:${ptUrl}`, cacheTTL: 5000 },
              )
              if (entry) entries[ptUrl] = entry
            }
            sendResponse({ success: true, entries })
            break
          }
          case 'DB_SYNC_PAGE_RECORD': {
            const syncPlatform = message.payload.platform
            if (!isAllowedStore(`${syncPlatform}_records`)) {
              sendResponse({ success: false, error: 'Invalid platform' }); break
            }
            const linked = message.payload.linked
            let linkedInvalid = false
            if (linked && Array.isArray(linked)) {
              for (const link of linked) {
                if (!isAllowedStore(`${link.platform}_records`)) {
                  linkedInvalid = true; break
                }
              }
            }
            if (linkedInvalid) {
              sendResponse({ success: false, error: 'Invalid linked platform' }); break
            }
            const syncStoreName = `${syncPlatform}_records`
            const syncKey = message.payload.key
            const syncResult = await dataScheduler.schedule(
              () => mediaDB.syncPageRecord(syncPlatform, syncKey, message.payload.record, linked),
              { priority: 'HIGH', storeName: syncStoreName, cacheKey: `sync:${syncPlatform}:${syncKey}`, invalidateCache: true },
            )
            // Invalidate GET cache for the synced record
            dataScheduler.cacheManager?.invalidate('scheduler', `get:${syncStoreName}:${syncKey}`)
            broadcast('record:updated', { storeName: syncStoreName, key: syncKey })
            sendResponse({ success: true, result: syncResult })
            break
          }

          // ==================== Settings ====================
          case 'GET_SETTINGS':
            await handleGetSettings(sendResponse)
            break
          case 'UPDATE_SETTINGS':
            await handleUpdateSettings(message.payload, sendResponse)
            break

          // ==================== Export / Import ====================
          case 'EXPORT_DATA':
            await handleExportData(sendResponse)
            break
          case 'IMPORT_DATA':
            await handleImportData(message.payload, sendResponse)
            break

          // ==================== Statistics ====================
          case 'GET_STATISTICS':
            await handleGetStatistics(sendResponse)
            break

          // ==================== Popup Data ====================
          case 'GET_ALL_RECORDS':
            await handleGetAllRecords(sendResponse)
            break

          // ==================== Utility ====================
          case 'HEALTH_CHECK':
            sendResponse({ success: true, dbReady, uptime: Date.now() - startTime })
            break
          case 'GET_MIGRATION_STATUS':
            handleGetMigrationStatus(sendResponse)
            break

          // ==================== WebDAV Sync ====================
          case 'WEBDAV_TEST':
            await handleWebDAVTest(message.payload, sendResponse)
            break
          case 'WEBDAV_UPLOAD':
            await handleWebDAVUpload(sendResponse)
            break
          case 'WEBDAV_DOWNLOAD':
            await handleWebDAVDownload(sendResponse)
            break
          case 'WEBDAV_SYNC':
            await handleWebDAVSync(sendResponse)
            break

          // ==================== NeoDB Push ====================
          case 'NEODB_PUSH_RATING':
            await handleNeoDBPushRating(message.payload, sendResponse)
            break

          // ==================== Adult AV ID Operations ====================
          case 'ADULT_AV_CHECK':
            await handleAdultAvCheck(message.payload, sendResponse)
            break
          case 'ADULT_AV_CHECK_BATCH':
            await handleAdultAvCheckBatch(message.payload, sendResponse)
            break
          case 'ADULT_AV_ADD':
            await handleAdultAvAdd(message.payload, sendResponse)
            break
          case 'ADULT_AV_BATCH_ADD':
            await handleAdultAvBatchAdd(message.payload, sendResponse)
            break
          case 'ADULT_AV_GET_ALL':
            await handleAdultAvGetAll(message.payload, sendResponse)
            break

          // Legacy handlers (backward compat)
          case 'SEHUATANG_CHECK_VIEWED':
            await handleSehuatangCheckViewed(message.payload, sendResponse)
            break
          case 'SEHUATANG_ADD':
            await handleSehuatangAdd(message.payload, sendResponse)
            break
          case 'SEHUATANG_BATCH_ADD':
            await handleSehuatangBatchAdd(message.payload, sendResponse)
            break
          case 'SEHUATANG_GET_ALL':
            await handleSehuatangGetAll(message.payload, sendResponse)
            break

          // ==================== Bilibili Inject ====================
          case 'BILIBILI_INJECT': {
            const { tabId } = message.payload ?? {}
            if (!tabId) {
              sendResponse({ success: false, error: 'Missing tabId' })
              return
            }
            chrome.scripting.executeScript({
              target: { tabId },
              func: () => {
                const d = document.createElement('div')
                d.setAttribute('data-umm-bili-float', '')
                d.textContent = 'UMM'
                Object.assign(d.style, {
                  position: 'fixed', left: '20px', top: '20px',
                  zIndex: '2147483647',
                  width: '50px', height: '50px', borderRadius: '50%',
                  background: '#22c55e', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', fontSize: '14px', fontWeight: '700',
                  fontFamily: 'Arial,sans-serif',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                  userSelect: 'none',
                })
                document.body.appendChild(d)
              },
            }).then(() => {
              sendResponse({ success: true })
            }).catch((err: any) => {
              sendResponse({ success: false, error: err?.message || String(err) })
            })
            return // keep channel open
          }

          // ==================== Bilibili Save ====================
          case 'BILIBILI_SAVE': {
            const { bvid, status, rating } = message.payload ?? {}
            if (!bvid) {
              sendResponse({ success: false, error: 'Missing bvid' })
              return
            }
            try {
              const record = {
                url: `https://www.bilibili.com/video/${bvid}/`,
                status,
                rating: Math.min(10, Math.max(0, rating ?? 0)),
                comment: '',
                updatedAt: new Date().toISOString(),
                linkedIds: {},
              }
              await dataScheduler.schedule(
                () => mediaDB.put(STORE_NAMES.BILIBILI, bvid, record),
                { priority: 'HIGH', storeName: STORE_NAMES.BILIBILI, cacheKey: `put:${STORE_NAMES.BILIBILI}:${bvid}`, invalidateCache: true },
              )
              dataScheduler.cacheManager?.invalidate('scheduler', `get:${STORE_NAMES.BILIBILI}:${bvid}`)
              sendResponse({ success: true })
            } catch (err: any) {
              sendResponse({ success: false, error: err?.message || String(err) })
            }
            return
          }

          // ==================== File Download (MAIN world) ====================
          case 'DOWNLOAD_FILE': {
            const { url, filename } = message.payload ?? {}
            if (!url || !filename || !_sender.tab?.id) {
              sendResponse({ success: false, error: 'Missing params or tab' })
              return
            }
            chrome.scripting.executeScript({
              target: { tabId: _sender.tab.id },
              world: 'MAIN',
              args: [url, filename],
              func: (u: string, fn: string) => {
                fetch(u, { credentials: 'include' })
                  .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob() })
                  .then((blob) => {
                    const blobUrl = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = blobUrl
                    a.download = fn
                    a.style.display = 'none'
                    document.body.appendChild(a)
                    a.click()
                    a.remove()
                    URL.revokeObjectURL(blobUrl)
                  })
                  .catch(() => {
                    const a = document.createElement('a')
                    a.href = u
                    a.target = '_blank'
                    a.style.display = 'none'
                    document.body.appendChild(a)
                    a.click()
                    a.remove()
                  })
              },
            })
            sendResponse({ success: true })
            return
          }

          default:
            debugLog('Unknown message type:', message.type)
            sendResponse({ success: false, error: 'Unknown message type' })
        }
      } catch (err: any) {
        errorLog(`❌ Error handling '${message.type}':`, err)
        sendResponse({ success: false, error: err?.message || String(err) })
      }
    }

    // ==================== Context Menu Stats ====================

    async function updateContextMenuStats() {
      try {
        const count = await mediaDB.count(STORE_NAMES.DOUBAN)
        chrome.contextMenus.update('show-stats', {
          title: `📦 ${count} 条豆瓣记录`,
        })
      } catch {
        // DB may not be ready
      }
    }
  },
})
