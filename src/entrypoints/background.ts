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

// Handler imports
import { handleWebDAVTest, handleWebDAVUpload, handleWebDAVDownload, handleWebDAVSync } from './background/handlers/webdav'
import { handleNeoDBPushRating } from './background/handlers/neodb'
import { handleGetSettings, handleUpdateSettings, handleExportData, handleImportData, handleGetStatistics, handleGetAllRecords, handleGetMigrationStatus } from './background/handlers/data'
import { handleShowToast } from './background/handlers/toast'
import { handleAdultAvCheck, handleAdultAvAdd, handleAdultAvBatchAdd, handleAdultAvGetAll, handleSehuatangCheckViewed, handleSehuatangAdd, handleSehuatangBatchAdd, handleSehuatangGetAll } from './background/handlers/adult-av'
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

export default defineBackground({
  type: 'module',

  main() {
    const startTime = Date.now()
    let dbReady = false
    let dbInitFailed = false

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
            const record = await mediaDB.get(message.payload.storeName, message.payload.key)
            sendResponse({ success: true, record })
            break
          }
          case 'DB_PUT': {
            if (!isAllowedStore(message.payload.storeName)) {
              sendResponse({ success: false, error: 'Invalid store name' }); break
            }
            await mediaDB.put(message.payload.storeName, message.payload.key, message.payload.record)
            broadcast('record:updated', { storeName: message.payload.storeName, key: message.payload.key })
            sendResponse({ success: true })
            break
          }
          case 'DB_DELETE': {
            if (!isAllowedStore(message.payload.storeName)) {
              sendResponse({ success: false, error: 'Invalid store name' }); break
            }
            await mediaDB.delete(message.payload.storeName, message.payload.key)
            broadcast('record:deleted', { storeName: message.payload.storeName, key: message.payload.key })
            sendResponse({ success: true })
            break
          }
          case 'DB_GET_ALL': {
            if (!isAllowedStore(message.payload.storeName)) {
              sendResponse({ success: false, error: 'Invalid store name' }); break
            }
            const entries = await mediaDB.getAll(message.payload.storeName)
            sendResponse({ success: true, entries })
            break
          }
          case 'DB_QUERY': {
            if (!isAllowedStore(message.payload.storeName)) {
              sendResponse({ success: false, error: 'Invalid store name' }); break
            }
            const entries = await mediaDB.query(message.payload.storeName, message.payload.indexName, message.payload.value)
            sendResponse({ success: true, entries })
            break
          }
          case 'DB_COUNT': {
            if (!isAllowedStore(message.payload.storeName)) {
              sendResponse({ success: false, error: 'Invalid store name' }); break
            }
            const count = await mediaDB.count(message.payload.storeName)
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
              const ids = await mediaDB.getWatchedIds(storeName)
              results[storeName] = Array.from(ids)
            }
            sendResponse({ success: true, results })
            break
          }
          case 'PT_ID_CACHE_GET': {
            const entry = await mediaDB.getCacheEntry(message.payload.ptUrl)
            sendResponse({ success: true, entry })
            break
          }
          case 'PT_ID_CACHE_PUT': {
            await mediaDB.putCacheEntry(message.payload.entry)
            sendResponse({ success: true })
            break
          }
          case 'PT_ID_CACHE_GET_BULK': {
            const { ptUrls } = message.payload
            const entries: Record<string, any> = {}
            for (const ptUrl of ptUrls) {
              const entry = await mediaDB.getCacheEntry(ptUrl)
              if (entry) entries[ptUrl] = entry
            }
            sendResponse({ success: true, entries })
            break
          }
          case 'DB_SYNC_PAGE_RECORD': {
            const platform = message.payload.platform
            if (!isAllowedStore(`${platform}_records`)) {
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
            const result = await mediaDB.syncPageRecord(platform, message.payload.key, message.payload.record, linked)
            broadcast('record:updated', { storeName: `${platform}_records`, key: message.payload.key })
            sendResponse({ success: true, result })
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
