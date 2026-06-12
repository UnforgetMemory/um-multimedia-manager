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
import type { AppSettings, ExportData, Statistics, RecordStoreName, RemoteMeta, DatasetMeta } from '@/types'
import * as NeoDB from '@/features/neodb/api'
import { mediaDB, RECORD_STORES, STORE_NAMES } from '@/features/database/models'

/** Allowed store names for generic DB message handlers */
const ALLOWED_DB_STORES = new Set<string>([
  ...RECORD_STORES,
  STORE_NAMES.TTL_CACHE,
  STORE_NAMES.PT_ID_CACHE,
  STORE_NAMES.SEHUATANG_AVIDS,
])

function isAllowedStore(storeName: string): boolean {
  return ALLOWED_DB_STORES.has(storeName)
}
import * as WebDAV from '@/features/webdav/api'
import { packageDataset, unpackageDataset } from '@/utils/zip-utils'
import { calculateStoreHash } from '@/utils/hash-utils'
import { debugLog, infoLog, warnLog, errorLog, configureLogging } from '@/utils/logger'
import type { LogLevel } from '@/types'
import { STORAGE_KEYS } from '@/config'
import { SEHUATANG_STORE_NAME, createAvId, normalizeAvId } from '@/features/sehuatang/models'
import type { SehuatangAvId } from '@/types'

/** Escape HTML special characters — pure regex, no DOM element creation */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
import { validateExportVersion, getMigrationInfo, MigrationError } from '@/features/migration/models'
import { settingsCache } from '@/features/settings/cache'
import { broadcast } from '@/utils/event-bus'

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

    /** Read debug settings from storage and configure logger */
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

    // React to settings changes from popup or other contexts
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

    // Init log config before anything else logs
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
        // No migration needed for v6 — fresh schema
        infoLog('Updated — v6 schema, no data migration required')
      }
    })

    // Context menu click
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

      // ✅ SHOW_TOAST bypasses all DB gates — it's a pure UI message, no DB needed
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
              sendResponse({ success: false, error: 'Invalid store name' })
              break
            }
            const record = await mediaDB.get(message.payload.storeName, message.payload.key)
            sendResponse({ success: true, record })
            break
          }
          case 'DB_PUT': {
            if (!isAllowedStore(message.payload.storeName)) {
              sendResponse({ success: false, error: 'Invalid store name' })
              break
            }
            await mediaDB.put(message.payload.storeName, message.payload.key, message.payload.record)
            broadcast('record:updated', { storeName: message.payload.storeName, key: message.payload.key })
            sendResponse({ success: true })
            break
          }
          case 'DB_DELETE': {
            if (!isAllowedStore(message.payload.storeName)) {
              sendResponse({ success: false, error: 'Invalid store name' })
              break
            }
            await mediaDB.delete(message.payload.storeName, message.payload.key)
            broadcast('record:deleted', { storeName: message.payload.storeName, key: message.payload.key })
            sendResponse({ success: true })
            break
          }
          case 'DB_GET_ALL': {
            if (!isAllowedStore(message.payload.storeName)) {
              sendResponse({ success: false, error: 'Invalid store name' })
              break
            }
            const entries = await mediaDB.getAll(message.payload.storeName)
            sendResponse({ success: true, entries })
            break
          }
          case 'DB_QUERY': {
            if (!isAllowedStore(message.payload.storeName)) {
              sendResponse({ success: false, error: 'Invalid store name' })
              break
            }
            const entries = await mediaDB.query(
              message.payload.storeName,
              message.payload.indexName,
              message.payload.value
            )
            sendResponse({ success: true, entries })
            break
          }
          case 'DB_COUNT': {
            if (!isAllowedStore(message.payload.storeName)) {
              sendResponse({ success: false, error: 'Invalid store name' })
              break
            }
            const count = await mediaDB.count(message.payload.storeName)
            sendResponse({ success: true, count })
            break
          }
          case 'DB_GET_WATCHED_IDS': {
            const { storeNames } = message.payload
            const results: Record<string, string[]> = {}
            for (const storeName of storeNames) {
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
            const { entry } = message.payload
            await mediaDB.putCacheEntry(entry)
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
            const result = await mediaDB.syncPageRecord(
              message.payload.platform,
              message.payload.key,
              message.payload.record,
              message.payload.linked
            )
            broadcast('record:updated', { storeName: `${message.payload.platform}_records`, key: message.payload.key })
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
          case 'GET_ALL_RECORDS': {
            const allRecords: any[] = []
            const storePlatformMap: Record<string, string> = {
              [STORE_NAMES.DOUBAN]: 'douban',
              [STORE_NAMES.IMDB]: 'imdb',
              [STORE_NAMES.NEODB]: 'neodb',
              [STORE_NAMES.TMDB]: 'tmdb',
            }
            for (const storeName of RECORD_STORES) {
              const entries = await mediaDB.getAll(storeName)
              for (const entry of entries) {
                const [type, ...idParts] = entry.key.split('::')
                const providerId = idParts.join('::')
                allRecords.push({
                  ...entry.record,
                  type,
                  provider: storePlatformMap[storeName] || 'unknown',
                  providerId,
                })
              }
            }
            sendResponse({ success: true, records: allRecords })
            break
          }

          // ==================== Utility ====================
          case 'HEALTH_CHECK':
            sendResponse({ success: true, dbReady, uptime: Date.now() - startTime })
            break

          case 'GET_MIGRATION_STATUS':
            sendResponse({ success: true, migration: getMigrationInfo() })
            break

          // SHOW_TOAST is handled above the dbReady gate (pure UI message)

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

          // ==================== Sehuatang AV ID Operations ====================
          case 'SEHUATANG_CHECK_VIEWED': {
            const { id } = message.payload
            if (!id) { sendResponse({ success: false, error: 'Missing id' }); break }
            const cleanId = normalizeAvId(id)
            const record = await mediaDB.get(SEHUATANG_STORE_NAME, cleanId)
            sendResponse({ success: true, exists: !!record, record })
            break
          }
          case 'SEHUATANG_ADD': {
            const { id, rating = 0 } = message.payload
            if (!id) { sendResponse({ success: false, error: 'Missing id' }); break }
            const avId = createAvId(id, rating)
            await mediaDB.put(SEHUATANG_STORE_NAME, avId.id, {
              url: '',
              status: 2,
              rating: avId.rating,
              updatedAt: avId.updatedAt,
              linkedIds: {},
            } as any)
            sendResponse({ success: true })
            break
          }
          case 'SEHUATANG_BATCH_ADD': {
            const { items } = message.payload
            if (!Array.isArray(items) || items.length === 0) {
              sendResponse({ success: false, error: 'Invalid items' }); break
            }
            let addedCount = 0
            for (const item of items) {
              if (!item.id) continue
              const avId = createAvId(item.id, item.rating, item.updatedAt)
              await mediaDB.put(SEHUATANG_STORE_NAME, avId.id, {
                url: '',
                status: 2,
                rating: avId.rating,
                updatedAt: avId.updatedAt,
                linkedIds: {},
              } as any)
              addedCount++
            }
            sendResponse({ success: true, addedCount })
            break
          }
          case 'SEHUATANG_GET_ALL': {
            const entries = await mediaDB.getAll(SEHUATANG_STORE_NAME)
            const items: SehuatangAvId[] = entries.map(e => ({
              id: e.key,
              rating: (e.record as any).rating || 0,
              updatedAt: e.record.updatedAt,
            }))
            sendResponse({ success: true, items })
            break
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

    // ==================== Handler Implementations ====================

    async function handleGetSettings(sendResponse: (r?: any) => void) {
      const settings = settingsCache.get()
      sendResponse({ success: true, settings })
    }

    async function handleUpdateSettings(payload: Partial<AppSettings>, sendResponse: (r?: any) => void) {
      await settingsCache.updateAll(payload)
      const settings = settingsCache.get()
      sendResponse({ success: true, settings })
    }

    async function handleExportData(sendResponse: (r?: any) => void) {
      const stores = await mediaDB.getAllStores()
      const appSettings = settingsCache.get()
      const settings: Partial<AppSettings> = {
        autoSync: appSettings.autoSync,
        syncInterval: appSettings.syncInterval,
        theme: appSettings.theme,
        notificationEnabled: appSettings.notificationEnabled,
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

    async function handleImportData(payload: ExportData, sendResponse: (r?: any) => void) {
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

      // Import each store — put() auto-stamps schemaVersion
      let totalImported = 0
      for (const [storeName, records] of Object.entries(payload.stores)) {
        // Only import recognized record stores
        if (!RECORD_STORES.includes(storeName)) continue
        for (const [key, record] of Object.entries(records)) {
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

    async function handleGetStatistics(sendResponse: (r?: any) => void) {
      const stats: Statistics = {
        total: 0, movie: 0, tv: 0, music: 0, book: 0,
        douban: 0, imdb: 0, neodb: 0, tmdb: 0,
      }

      // Per-platform store → platform mapping
      const storePlatformMap: Record<string, string> = {
        [STORE_NAMES.DOUBAN]: 'douban',
        [STORE_NAMES.IMDB]: 'imdb',
        [STORE_NAMES.NEODB]: 'neodb',
        [STORE_NAMES.TMDB]: 'tmdb',
      }

      for (const storeName of RECORD_STORES) {
        const entries = await mediaDB.getAll(storeName)
        const platform = storePlatformMap[storeName] || 'unknown'

        stats.total += entries.length
        if (platform && platform in stats) {
          (stats as any)[platform] += entries.length
        }

        // Detect type from key prefix
        for (const entry of entries) {
          const type = entry.key.split('::')[0]
          if (type && type in stats) {
            (stats as any)[type]++
          }
        }
      }

      sendResponse({ success: true, stats })
    }

    async function handleShowToast(payload: any, sendResponse: (r?: any) => void) {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        if (!tab?.id) {
          sendResponse({ success: false, error: 'No active tab' })
          return
        }

        const toastPayload = { type: payload?.type || 'info', title: payload?.title || '', message: payload?.message }

        // 1) 尝试发送到已加载的内容脚本
        try {
          await chrome.tabs.sendMessage(tab.id, { type: 'SHOW_TOAST', payload: toastPayload })
          sendResponse({ success: true })
          return
        } catch {
          // 内容脚本未加载 — 走动态注入
        }

        // 2) 动态注入轻量级 toast（适用于任何页面）
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: __showInlineToast,
          args: [toastPayload.type, toastPayload.title, toastPayload.message || ''],
        })
        sendResponse({ success: true })
      } catch (err) {
        sendResponse({ success: false })
      }
    }

    /** 轻量级内联 toast — 注入到任意页面，样式与 FloatingToast 完全一致 */
    function __showInlineToast(type: string, title: string, message: string) {
      const CONTAINER_ID = 'umm-toast-container'
      const STYLES_ID = 'umm-toast-styles'
      const MAX_TOASTS = 3
      const AUTO_REMOVE_MS = 2800

      // 注入样式（与 toast.ts 完全一致）
      if (!document.getElementById(STYLES_ID)) {
        const style = document.createElement('style')
        style.id = STYLES_ID
        style.textContent = `
          .umm-toast {
            padding: 14px 18px;
            border-radius: 10px;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15), 0 4px 8px rgba(0, 0, 0, 0.1);
            font-size: 14px;
            min-width: 300px;
            max-width: 420px;
            transform: translateX(120%);
            opacity: 0;
            transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
            backdrop-filter: blur(8px);
            pointer-events: auto;
            position: relative;
            overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          }
          .umm-toast.show {
            transform: translateX(0);
            opacity: 1;
          }
          .umm-toast--success {
            background: linear-gradient(180deg, rgba(17, 111, 70, 0.96), rgba(11, 83, 53, 0.98));
            color: white;
          }
          .umm-toast--error {
            background: linear-gradient(180deg, rgba(164, 43, 60, 0.96), rgba(126, 28, 48, 0.98));
            color: white;
          }
          .umm-toast--info {
            background: linear-gradient(180deg, #1757d6 0%, #0d47b8 100%);
            color: white;
          }
          .umm-toast--loading {
            background: linear-gradient(180deg, #3b82f6 0%, #2563eb 100%);
            color: white;
          }
          .umm-toast strong {
            display: block;
            margin-bottom: 4px;
          }
          .umm-toast p {
            margin: 0;
            font-size: 12px;
            opacity: 0.9;
          }
        `
        document.documentElement.appendChild(style)
      }

      // 获取或创建容器
      let ctr = document.getElementById(CONTAINER_ID)
      if (!ctr) {
        ctr = document.createElement('div')
        ctr.id = CONTAINER_ID
        ctr.style.cssText = `
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: 999999;
          display: flex;
          flex-direction: column;
          gap: 12px;
          align-items: flex-end;
          pointer-events: none;
        `
        ctr.setAttribute('role', 'region')
        ctr.setAttribute('aria-label', '通知区域')
        document.body.appendChild(ctr)
      }

      // 去重：同标题 2s 内替换
      const now = Date.now()
      for (const child of Array.from(ctr.children)) {
        const el = child as HTMLElement
        if (el.dataset.ummTitle === title && now - Number(el.dataset.ummTs || 0) < 2000) {
          el.dataset.ummTs = String(now)
          const pEl = el.querySelector('p')
          if (pEl && message) pEl.textContent = message
          return
        }
      }

      // 限制数量
      while (ctr.children.length >= MAX_TOASTS) {
        const first = ctr.firstElementChild as HTMLElement | null
        if (first) {
          first.classList.remove('show')
          setTimeout(() => first.remove(), 350)
        }
        ctr.firstChild?.remove()
      }

      // 创建 toast（与 createToastElement 结构一致）
      const toast = document.createElement('div')
      toast.className = `umm-toast umm-toast--${type}`
      toast.dataset.ummTitle = title
      toast.dataset.ummTs = String(now)
      toast.setAttribute('role', 'alert')
      toast.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite')
      toast.setAttribute('aria-atomic', 'true')

      const content = document.createElement('div')
      content.className = 'umm-toast__content'
      content.innerHTML = `<strong>${escapeHtml(title)}</strong>${message ? `<p>${escapeHtml(message)}</p>` : ''}`
      toast.appendChild(content)

      ctr.appendChild(toast)

      // 入场动画
      requestAnimationFrame(() => toast.classList.add('show'))

      // 自动移除
      setTimeout(() => {
        toast.classList.remove('show')
        setTimeout(() => toast.remove(), 350)
      }, AUTO_REMOVE_MS)
    }

    // ==================== WebDAV Sync Handlers ====================

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
        // Find latest updatedAt across entries
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
      return {
        schema: 'umm-meta',
        version: 1,
        generatedAt: new Date().toISOString(),
        datasets,
      }
    }

    /** WEBDAV_TEST — check connection */
    async function handleWebDAVTest(
      payload: any,
      sendResponse: (r?: any) => void
    ) {
      try {
        // Popup sends { url, username, password }, but storage uses webdavUrl/Username/Password
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

        const result = await WebDAV.testConnection(
          webdavUrl,
          webdavUsername,
          webdavPassword
        )
        sendResponse({ success: true, ...result })
      } catch (err: any) {
        sendResponse({ success: false, message: err?.message || String(err) })
      }
    }

    /** WEBDAV_UPLOAD — local → WebDAV */
    async function handleWebDAVUpload(sendResponse: (r?: any) => void) {
      try {
        const { webdavUrl, webdavUsername, webdavPassword } =
          await getWebDAVSettings()
        if (!webdavUrl) {
          sendResponse({ success: false, error: 'WebDAV URL not configured' })
          return
        }

        // Ensure directory exists
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
          await WebDAV.uploadDataset(
            webdavUrl,
            webdavUsername,
            webdavPassword,
            storeName,
            blob
          )
          datasetMetas.push(meta)
          totalUploaded += entries.length
        }

        // Upload consolidated meta.json
        const remoteMeta: RemoteMeta = {
          schema: 'umm-meta',
          version: 1,
          generatedAt: new Date().toISOString(),
          datasets: datasetMetas,
        }
        await WebDAV.uploadMeta(
          webdavUrl,
          webdavUsername,
          webdavPassword,
          remoteMeta
        )

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
    async function handleWebDAVDownload(sendResponse: (r?: any) => void) {
      try {
        const { webdavUrl, webdavUsername, webdavPassword } =
          await getWebDAVSettings()
        if (!webdavUrl) {
          sendResponse({ success: false, error: 'WebDAV URL not configured' })
          return
        }

        const remoteMeta = await WebDAV.fetchRemoteMeta(
          webdavUrl,
          webdavUsername,
          webdavPassword
        )
        if (!remoteMeta) {
          sendResponse({ success: false, error: 'No remote data found', message: '云端没有数据' })
          return
        }

        let totalDownloaded = 0
        for (const ds of remoteMeta.datasets) {
          if (ds.recordCount === 0) continue
          try {
            const blob = await WebDAV.downloadDataset(
              webdavUrl,
              webdavUsername,
              webdavPassword,
              ds.key
            )
            const { data } = await unpackageDataset(blob)

            // Write records to local DB
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
    async function handleWebDAVSync(sendResponse: (r?: any) => void) {
      try {
        const { webdavUrl, webdavUsername, webdavPassword } =
          await getWebDAVSettings()
        if (!webdavUrl) {
          sendResponse({ success: false, error: 'WebDAV URL not configured' })
          return
        }

        // Build local meta
        const localMeta = await buildLocalMeta()
        const localMap = new Map(localMeta.datasets.map(d => [d.key, d]))

        // Fetch remote meta
        const remoteMeta = await WebDAV.fetchRemoteMeta(
          webdavUrl,
          webdavUsername,
          webdavPassword
        )
        const remoteMap = new Map(
          (remoteMeta?.datasets || []).map(d => [d.key, d])
        )

        // Get all store names to sync
        const allKeys = new Set([...localMap.keys(), ...remoteMap.keys()])

        let uploaded = 0
        let downloaded = 0
        let skipped = 0
        const resultingMetas: DatasetMeta[] = []

        for (const key of allKeys) {
          // Lookup before try so catch can access them
          const local = localMap.get(key)
          const remote = remoteMap.get(key)

          // Isolate per-dataset: one failure should not break the whole sync
          try {

            // Both empty → skip
            if (
              (!local || local.recordCount === 0) &&
              (!remote || remote.recordCount === 0)
            ) {
              skipped++
              resultingMetas.push(
                local || remote || {
                  key,
                  hash: 'empty',
                  updatedAt: new Date().toISOString(),
                  recordCount: 0,
                  dataVersion: 1,
                }
              )
              continue
            }

            // Only local → upload
            if (!remote || remote.recordCount === 0) {
              const entries = await mediaDB.getAll(key as RecordStoreName)
              const { blob, meta } = await packageDataset(key as RecordStoreName, entries)
              await WebDAV.uploadDataset(
                webdavUrl,
                webdavUsername,
                webdavPassword,
                key,
                blob
              )
              resultingMetas.push(meta)
              uploaded += entries.length
              continue
            }

            // Only remote → download
            if (!local || local.recordCount === 0) {
              const blob = await WebDAV.downloadDataset(
                webdavUrl,
                webdavUsername,
                webdavPassword,
                key
              )
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
              // Local is newer → upload
              const entries = await mediaDB.getAll(key as RecordStoreName)
              const { blob, meta } = await packageDataset(key as RecordStoreName, entries)
              await WebDAV.uploadDataset(
                webdavUrl,
                webdavUsername,
                webdavPassword,
                key,
                blob
              )
              resultingMetas.push(meta)
              uploaded += entries.length
            } else {
              // Remote is newer → download
              const blob = await WebDAV.downloadDataset(
                webdavUrl,
                webdavUsername,
                webdavPassword,
                key
              )
              const { data } = await unpackageDataset(blob)
              for (const [recordKey, record] of Object.entries(data)) {
                await mediaDB.put(key as RecordStoreName, recordKey, record)
              }
              resultingMetas.push(remote)
              downloaded += Object.keys(data).length
            }
          } catch (dsErr: any) {
            errorLog(`WebDAV sync skipped dataset '${key}': ${dsErr?.message || String(dsErr)}`)
            // Keep the old meta entry so the resulting meta stays valid
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
        // Ensure directory exists before writing meta
        await WebDAV.createDirectory(webdavUrl, webdavUsername, webdavPassword)
        await WebDAV.uploadMeta(
          webdavUrl,
          webdavUsername,
          webdavPassword,
          newRemoteMeta
        )

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

    // ==================== NeoDB Push ====================

    /**
     * Build Douban URL from provider info
     * @returns URL like https://movie.douban.com/subject/1297924/
     */
    function buildDoubanUrl(type: string, providerId: string): string {
      const domain = type === 'music' ? 'music.douban.com'
        : type === 'book' ? 'book.douban.com'
        : 'movie.douban.com'
      return `https://${domain}/subject/${providerId}/`
    }

    /** Map numeric status to NeoDB shelf type */
    function statusToShelfType(status: number): 'complete' | 'progress' | 'wishlist' {
      if (status === 2) return 'complete'
      if (status === 1) return 'progress'
      return 'wishlist'
    }

    /** NEODB_PUSH_RATING — push rating from Douban to NeoDB */
    async function handleNeoDBPushRating(
      payload: any,
      sendResponse: (r?: any) => void
    ) {
      try {
        const record = payload?.record
        if (!record?.providerId || !record?.type || !record?.provider) {
          sendResponse({ success: false, message: 'Missing required fields' })
          return
        }

        // Get NeoDB token
        const result = (await chrome.storage.local.get(STORAGE_KEYS.NEODB_TOKEN)) as Record<string, any>
        const token = result[STORAGE_KEYS.NEODB_TOKEN] || ''
        if (!token) {
          sendResponse({ success: false, message: 'NeoDB token not configured' })
          return
        }

        const doubanUrl = buildDoubanUrl(record.type, record.providerId)
        infoLog('[NeoDB] Fetching catalog for:', doubanUrl)

        // 1. Fetch catalog UUID with retry for 404 (NeoDB triggers background fetch on first request)
        // 429 = NeoDB 无法抓取对应数据，无需重试
        let catalog: { uuid: string } | null = null
        const maxRetries = 3
        const retryDelays = [2000, 3000, 5000] // 2s, 3s, 5s

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            catalog = await NeoDB.fetchCatalogByUrl(doubanUrl, token)
            infoLog('[NeoDB] Catalog result:', { uuid: catalog.uuid, hasUuid: !!catalog.uuid, attempt })
            break // Success
          } catch (fetchErr: any) {
            if (fetchErr instanceof NeoDB.NeoDBError) {
              // 429 = NeoDB 无法抓取，直接失败
              if (fetchErr.status === 429) {
                warnLog('[NeoDB] Rate limited (429) — NeoDB 无法抓取该作品数据')
                sendResponse({ success: false, message: '[429] NeoDB 无法抓取该作品数据' })
                return
              }
              // 404 = NeoDB 正在后台拉取，等待后重试
              if (fetchErr.status === 404 && attempt < maxRetries) {
                const delay = retryDelays[attempt]
                warnLog(`[NeoDB] Catalog not found (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms...`)
                await new Promise(resolve => setTimeout(resolve, delay))
              } else {
                throw fetchErr
              }
            } else {
              throw fetchErr
            }
          }
        }

        if (!catalog?.uuid) {
          sendResponse({ success: false, message: 'NeoDB 未找到该作品（已重试多次）' })
          return
        }

        // 2. Mark on shelf with retry for 404 only
        const shelfType = statusToShelfType(record.status ?? 0)
        const rating = record.rating ?? 0
        const comment = record.comment ?? ''
        let shelfItem: any = null

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            shelfItem = await NeoDB.markItem(catalog.uuid, shelfType, rating, comment, token)
            break // Success
          } catch (markErr: any) {
            if (markErr instanceof NeoDB.NeoDBError) {
              if (markErr.status === 429) {
                warnLog('[NeoDB] Rate limited (429) on markItem')
                sendResponse({ success: false, message: '[429] NeoDB 请求过于频繁' })
                return
              }
              if (markErr.status === 404 && attempt < maxRetries) {
                const delay = retryDelays[attempt]
                warnLog(`[NeoDB] Mark item failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms...`)
                await new Promise(resolve => setTimeout(resolve, delay))
              } else {
                throw markErr
              }
            } else {
              throw markErr
            }
          }
        }

        infoLog('[NeoDB] Push success:', { catalogUuid: catalog.uuid, shelfItemUuid: shelfItem?.uuid })
        sendResponse({ success: true, shelfItem, catalogUuid: catalog.uuid })
      } catch (err: any) {
        const msg = err instanceof NeoDB.NeoDBError
          ? err.message
          : err?.message || '推送失败'
        errorLog('NeoDB push failed:', msg)
        sendResponse({ success: false, message: msg })
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
