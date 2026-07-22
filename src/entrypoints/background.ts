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
import { mediaDB, STORE_NAMES } from '@/features/database/models'
import { debugLog, infoLog, warnLog, errorLog, configureLogging } from '@/utils/logger'
import { STORAGE_KEYS } from '@/config'

import { DataScheduler } from '@/features/data-scheduler/data-scheduler'
import { CacheManager } from '@/features/cache'
import { infoLog as schedulerLog } from '@/utils/logger'

// Handler imports
import { handleWebDAVTest, handleWebDAVUpload, handleWebDAVDownload, handleWebDAVSync } from './background/handlers/webdav'
import { handleNeoDBPushRating } from './background/handlers/neodb'
import { handleGetSettings, handleUpdateSettings, handleExportData, handleImportData, handleGetStatistics, handleGetAllRecords, handleGetMigrationStatus } from './background/handlers/data'
import { handleShowToast } from './background/handlers/toast'
import { handleAdultAvCheck, handleAdultAvCheckBatch, handleAdultAvAdd, handleAdultAvBatchAdd, handleAdultAvGetAll, handleSehuatangCheckViewed, handleSehuatangAdd, handleSehuatangBatchAdd, handleSehuatangGetAll } from './background/handlers/adult-av'
import {
  handleDbGet, handleDbPut, handleDbDelete, handleDbGetAll, handleDbQuery,
  handleDbCount, handleDbGetWatchedIds, handleDbSyncPageRecord,
  handlePtIdCacheGet, handlePtIdCachePut, handlePtIdCacheGetBulk,
  type DbHandlerContext,
} from './background/handlers/db'
import { handleBilibiliInject, handleBilibiliSave } from './background/handlers/bilibili'
import { handleDownloadFile } from './background/handlers/download'
import * as NeoDB from '@/features/neodb/api'
import { settingsCache } from '@/features/settings/cache'
import { RecordRepositoryAdapter } from '@/features/database/record-repository-adapter'
import { RecordService } from '@/domain/record/RecordService'

export default defineBackground({
  type: 'module',

  main() {
    const startTime = Date.now()
    let dbReady = false
    let dbInitFailed = false

    // Domain layer — wired after mediaDB.init()
    let recordService: RecordService | null = null

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

        // Wire domain layer
        const recordRepo = new RecordRepositoryAdapter(mediaDB as any)
        recordService = new RecordService(recordRepo)

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

      const dbCtx: DbHandlerContext = {
        db: mediaDB as any,
        scheduler: dataScheduler,
        recordService,
      }

      try {
        switch (message.type) {
          // ==================== Core DB Operations ====================
          case 'DB_GET':
            sendResponse(await handleDbGet(message.payload, dbCtx))
            break
          case 'DB_PUT':
            sendResponse(await handleDbPut(message.payload, dbCtx))
            break
          case 'DB_DELETE':
            sendResponse(await handleDbDelete(message.payload, dbCtx))
            break
          case 'DB_GET_ALL':
            sendResponse(await handleDbGetAll(message.payload, dbCtx))
            break
          case 'DB_QUERY':
            sendResponse(await handleDbQuery(message.payload, dbCtx))
            break
          case 'DB_COUNT':
            sendResponse(await handleDbCount(message.payload, dbCtx))
            break
          case 'DB_GET_WATCHED_IDS':
            sendResponse(await handleDbGetWatchedIds(message.payload, dbCtx))
            break
          case 'PT_ID_CACHE_GET':
            sendResponse(await handlePtIdCacheGet(message.payload, dbCtx))
            break
          case 'PT_ID_CACHE_PUT':
            sendResponse(await handlePtIdCachePut(message.payload, dbCtx))
            break
          case 'PT_ID_CACHE_GET_BULK':
            sendResponse(await handlePtIdCacheGetBulk(message.payload, dbCtx))
            break
          case 'DB_SYNC_PAGE_RECORD':
            sendResponse(await handleDbSyncPageRecord(message.payload, dbCtx))
            break

          // ==================== Settings ====================
          case 'GET_SETTINGS':
            await handleGetSettings(sendResponse)
            break
          case 'UPDATE_SETTINGS':
            await handleUpdateSettings(message.payload, sendResponse)
            break

          // ==================== Export / Import ====================
          case 'EXPORT_DATA':
            await dataScheduler.schedule(() => handleExportData(sendResponse), { priority: 'MEDIUM', cacheKey: 'export' })
            break
          case 'IMPORT_DATA':
            await dataScheduler.schedule(() => handleImportData(message.payload, sendResponse), { priority: 'HIGH', cacheKey: 'import' })
            break

          // ==================== Statistics ====================
          case 'GET_STATISTICS':
            await dataScheduler.schedule(() => handleGetStatistics(sendResponse), { priority: 'MEDIUM', cacheKey: 'statistics' })
            break

          // ==================== Popup Data ====================
          case 'GET_ALL_RECORDS':
            await dataScheduler.schedule(() => handleGetAllRecords(sendResponse), { priority: 'MEDIUM', cacheKey: 'all-records' })
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
            await dataScheduler.schedule(() => handleWebDAVTest(message.payload, sendResponse), { priority: 'MEDIUM', cacheKey: 'webdav-test' })
            break
          case 'WEBDAV_UPLOAD':
            await dataScheduler.schedule(() => handleWebDAVUpload(sendResponse), { priority: 'MEDIUM', cacheKey: 'webdav-upload' })
            break
          case 'WEBDAV_DOWNLOAD':
            await dataScheduler.schedule(() => handleWebDAVDownload(sendResponse), { priority: 'MEDIUM', cacheKey: 'webdav-download' })
            break
          case 'WEBDAV_SYNC':
            await dataScheduler.schedule(() => handleWebDAVSync(sendResponse), { priority: 'MEDIUM', cacheKey: 'webdav-sync' })
            break

          // ==================== NeoDB Push ====================
          case 'NEODB_PUSH_RATING':
            await handleNeoDBPushRating(message.payload, sendResponse)
            break

          // ==================== Adult AV ID Operations ====================
          case 'ADULT_AV_CHECK':
            await dataScheduler.schedule(() => handleAdultAvCheck(message.payload, sendResponse), { priority: 'LOW', cacheKey: 'av-check' })
            break
          case 'ADULT_AV_CHECK_BATCH':
            await dataScheduler.schedule(() => handleAdultAvCheckBatch(message.payload, sendResponse), { priority: 'LOW', cacheKey: 'av-check-batch' })
            break
          case 'ADULT_AV_ADD':
            await dataScheduler.schedule(() => handleAdultAvAdd(message.payload, sendResponse), { priority: 'LOW', cacheKey: 'av-add' })
            break
          case 'ADULT_AV_BATCH_ADD':
            await dataScheduler.schedule(() => handleAdultAvBatchAdd(message.payload, sendResponse), { priority: 'LOW', cacheKey: 'av-batch-add' })
            break
          case 'ADULT_AV_GET_ALL':
            await dataScheduler.schedule(() => handleAdultAvGetAll(message.payload, sendResponse), { priority: 'LOW', cacheKey: 'av-get-all' })
            break

          // Legacy handlers (backward compat)
          case 'SEHUATANG_CHECK_VIEWED':
            await dataScheduler.schedule(() => handleSehuatangCheckViewed(message.payload, sendResponse), { priority: 'LOW', cacheKey: 'sehuatang-check-viewed' })
            break
          case 'SEHUATANG_ADD':
            await dataScheduler.schedule(() => handleSehuatangAdd(message.payload, sendResponse), { priority: 'LOW', cacheKey: 'sehuatang-add' })
            break
          case 'SEHUATANG_BATCH_ADD':
            await dataScheduler.schedule(() => handleSehuatangBatchAdd(message.payload, sendResponse), { priority: 'LOW', cacheKey: 'sehuatang-batch-add' })
            break
          case 'SEHUATANG_GET_ALL':
            await dataScheduler.schedule(() => handleSehuatangGetAll(message.payload, sendResponse), { priority: 'LOW', cacheKey: 'sehuatang-get-all' })
            break

          // ==================== Bilibili ====================
          case 'BILIBILI_INJECT':
            sendResponse(await handleBilibiliInject(message.payload, _sender))
            break
          case 'BILIBILI_SAVE':
            sendResponse(await handleBilibiliSave(message.payload, { db: mediaDB as any, scheduler: dataScheduler }))
            break

          // ==================== File Download (MAIN world) ====================
          case 'DOWNLOAD_FILE': {
            sendResponse(await handleDownloadFile(message.payload, _sender))
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
