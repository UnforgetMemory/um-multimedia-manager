/**
 * Background Service Worker - UMM 多媒体管理器 (WXT Version)
 * 
 * 负责:
 * - 消息路由(Content Script ↔ Popup ↔ Background)
 * - 定时同步任务
 * - 通知管理
 * - IndexedDB 数据库初始化
 * - Legacy 数据迁移（油猴脚本 → IndexedDB）
 */

import { defineBackground } from 'wxt/utils/define-background'
import { MediaRecord, AppSettings, ExportData } from '@/shared'
import * as WebDAV from '@/shared/api/webdav'
import * as NeoDB from '@/shared/api/neodb'
import { mediaDB } from '../shared/models/database'
import { migrator } from '../shared/models/migration'
import { debugLog, infoLog, errorLog } from '@/shared/utils/logger'

// ✅ P0: 使用 Alarm API 定期清理 NeoDB 书架缓存（每10分钟）
chrome.alarms.create('cleanupShelfCache', { periodInMinutes: 10 })

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'cleanupShelfCache') {
    import('@/shared/api/neodb').then(({ cleanupShelfCache }) => {
      cleanupShelfCache()
      debugLog('Shelf cache cleaned via alarm')
    })
  }
})

export default defineBackground({
  type: 'module',
  
  main() {
    // ✅ Startup health check
    infoLog('=== Service Worker Starting ===')
    infoLog('Extension ID:', chrome.runtime.id)
    infoLog('Manifest version:', chrome.runtime.getManifest().version)
    
    // ✅ 关键 API 可用性检查
    const requiredAPIs = ['storage', 'runtime', 'notifications', 'alarms']
    for (const api of requiredAPIs) {
      if (!(chrome as any)[api]) {
        errorLog(`❌ Required API missing: ${api}`)
      } else {
        debugLog(`✅ API available: ${api}`)
      }
    }
    
    // ✅ 数据库初始化（带超时保护）
    const dbInitPromise = mediaDB.init()
    const dbTimeout = setTimeout(() => {
      errorLog('⚠️ Database init timeout after 10s')
    }, 10000)
    
    dbInitPromise.then(() => {
      clearTimeout(dbTimeout)
      debugLog('✅ Database initialized')
    }).catch(err => {
      clearTimeout(dbTimeout)
      errorLog('❌ Database initialization failed:', err)
    })
    
    infoLog('=== Service Worker Ready ===')
    
    // ✅ 迁移旧版嵌套结构到新版扁平结构
    chrome.storage.local.get(['settings'], async (result) => {
      if (result.settings && typeof result.settings === 'object') {
        debugLog('Migrating legacy nested settings to flat structure...')
        const legacySettings = result.settings as any
        
        // 转换为扁平结构
        const flatSettings = {
          webdavUrl: legacySettings.webdavUrl || '',
          webdavUsername: legacySettings.webdavUsername || '',
          webdavPassword: legacySettings.webdavPassword || '',
          neodbToken: legacySettings.neodbToken || '',
          autoSync: legacySettings.autoSync ?? false,
          syncInterval: legacySettings.syncInterval || 30,
          theme: legacySettings.theme || 'auto',
          language: legacySettings.language || 'zh-CN',
          notificationEnabled: legacySettings.notificationEnabled ?? true,
          quarantineAutoClean: legacySettings.quarantineAutoClean ?? true,
          quarantineRetentionDays: legacySettings.quarantineRetentionDays || 7,
        }
        
        // 保存为扁平结构
        chrome.storage.local.set(flatSettings, () => {
          if (chrome.runtime.lastError) {
            errorLog('Migration failed:', chrome.runtime.lastError)
          } else {
            debugLog('Settings migrated to flat structure')
            // 删除旧的嵌套结构
            chrome.storage.local.remove(['settings'])
          }
        })
      } else {
        debugLog('No legacy settings to migrate')
      }
    })
    
    // ==================== 初始化 ====================
    
    // 扩展安装/更新时触发
    chrome.runtime.onInstalled.addListener(async (details) => {
      infoLog('Extension installed/updated:', details.reason)
      
      // 初始化 IndexedDB
      await initializeDatabase()
      
      if (details.reason === 'install') {
        await handleFirstInstall()
        
        // 创建右键菜单
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
        
        // 统计信息（只读，不可点击）
        chrome.contextMenus.create({
          id: 'show-stats',
          title: '📦 加载中...',
          contexts: ['all'],
          enabled: false, // 只读
        })
        
        // 初始化统计信息
        await updateContextMenuStats()
      } else if (details.reason === 'update') {
        await handleUpdate(details.previousVersion)
      }
    })
    
    /**
     * 初始化 IndexedDB 并执行迁移
     */
    async function initializeDatabase(): Promise<void> {
      try {
        infoLog('Initializing IndexedDB...')
        await mediaDB.init()
        infoLog('IndexedDB initialized successfully')
        
        // 检查是否已迁移
        const migrationDone = await checkMigrationStatus()
        if (!migrationDone) {
          infoLog('Starting legacy data migration...')
          const result = await migrator.migrate()
          
          if (result.success) {
            infoLog(`Migration completed: ${result.migratedCount} records migrated`)
            await markMigrationDone()
            
            // 显示迁移完成通知
            if (result.migratedCount > 0) {
              await showNotification(
                '数据迁移完成',
                `✅ 成功迁移 ${result.migratedCount} 条记录${result.errorCount > 0 ? `, ${result.errorCount} 条失败` : ''}`
              )
            }
          } else {
            errorLog('Migration failed:', result)
            await showNotification(
              '数据迁移失败',
              `❌ 部分数据迁移失败，请查看控制台日志`
            )
          }
        } else {
          infoLog('Migration already completed, skipping')
        }
      } catch (error) {
        errorLog('Database initialization failed:', error)
      }
    }
    
    /**
     * 检查迁移状态
     */
    async function checkMigrationStatus(): Promise<boolean> {
      return new Promise((resolve) => {
        chrome.storage.local.get('umm:migration:v2:done', (result) => {
          resolve(!!result['umm:migration:v2:done'])
        })
      })
    }
    
    /**
     * 标记迁移完成
     */
    async function markMigrationDone(): Promise<void> {
      return new Promise((resolve) => {
        chrome.storage.local.set({ 'umm:migration:v2:done': true }, () => {
          resolve()
        })
      })
    }
    
    // 右键菜单点击事件
    chrome.contextMenus.onClicked.addListener((info, _tab) => {
      if (info.menuItemId === 'open-popup') {
        // 打开 Popup
        chrome.action.openPopup()
      }
    })
    
    // ==================== 消息处理 ====================
    
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      // 验证发送者身份
      if (!sender.id && !sender.url) {
        debugLog('Message from unknown sender')
        return false
      }
      
      debugLog('✅ Message received:', message.type, 'from:', sender.id || sender.url)
      
      // 异步处理消息
      handleMessage(message, sender, sendResponse).catch(err => {
        errorLog('❌ handleMessage failed:', err)
        sendResponse({ success: false, error: String(err) })
      })
      
      // 保持消息通道开启(用于异步响应)
      return true
    })
    
    /**
     * 消息接口定义
     */
    interface RuntimeMessage {
      type: string
      payload?: any
    }
    
    async function handleMessage(
      message: RuntimeMessage,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response?: any) => void
    ) {
      debugLog('Received message:', message.type, 'at', new Date().toISOString())
      
      // ✅ 验证扩展上下文是否有效
      if (!chrome.runtime?.id) {
        errorLog('Extension context invalid')
        sendResponse({ success: false, error: 'Extension context invalidated' })
        return
      }
      
      // 验证消息结构
      if (!message || !message.type) {
        sendResponse({ success: false, error: 'Invalid message format' })
        return
      }
      
      // ✅ 修复：降低全局超时至 20 秒，更快反馈错误
      const globalTimeout = setTimeout(() => {
        errorLog('⚠️ Message handler timeout for:', message.type)
        sendResponse({ 
          success: false, 
          error: `Operation timed out after 20s (${message.type})` 
        })
      }, 20000)
      
      try {
        switch (message.type) {
          case 'GET_RECORD':
            await handleGetRecord(message.payload, sendResponse)
            break
          
          case 'SAVE_RECORD':
            await handleSaveRecord(message.payload, sendResponse)
            break
          
          case 'GET_STATS':
            await handleGetStats(sendResponse)
            break
          
          case 'EXPORT_DATA':
            await handleExportData(sendResponse)
            break
          
          case 'IMPORT_DATA':
            await handleImportData(message.payload, sendResponse)
            break
          
          case 'CLEAR_QUARANTINE':
            await handleClearQuarantine(sendResponse)
            break
          
          case 'WEBDAV_SYNC':
            await handleWebDAVSync(sendResponse)
            break
          
          case 'WEBDAV_DOWNLOAD':
            await handleWebDAVDownload(sendResponse)
            break
          
          case 'WEBDAV_UPLOAD':
            await handleWebDAVUpload(sendResponse)
            break
          
          case 'WEBDAV_TEST':
            await handleWebDAVTest(message.payload, sendResponse)
            break
          
          case 'NEODB_ENRICH':
            await handleNeoDBEnrich(message.payload, sendResponse)
            break
          
          case 'NEODB_SEARCH':
            await handleNeoDBSearch(message.payload, sendResponse)
            break
          
          case 'NEODB_PUSH_RATING':
            await handleNeoDBPushRating(message.payload, sendResponse)
            break
          
          case 'GET_RECORDS_BY_PROVIDER_TYPE':
            await handleGetRecordsByProviderType(message.payload, sendResponse)
            break
          
          // ✅ 新增：根据 provider/type/providerId 查询单条记录
          case 'GET_RECORD_BY_KEY':
            await handleGetRecordByKey(message.payload, sendResponse)
            break
          
          case 'DELETE_RECORD':
            await handleDeleteRecord(message.payload, sendResponse)
            break
          
          case 'GET_ALL_RECORDS':
            debugLog('Processing GET_ALL_RECORDS...')
            await handleGetAllRecords(sendResponse)
            debugLog('GET_ALL_RECORDS completed')
            break
          
          case 'BULK_UPSERT_RECORDS':
            await handleBulkUpsertRecords(message.payload, sendResponse)
            break
          
          case 'GET_SETTINGS':
            await handleGetSettings(sendResponse)
            break
          
          case 'UPDATE_SETTINGS':
            await handleUpdateSettings(message.payload, sendResponse)
            break
          
          case 'EXPORT_STRUCTURED_DATA':
            await handleExportStructuredData(sendResponse)
            break
          
          case 'IMPORT_STRUCTURED_DATA':
            await handleImportStructuredData(message.payload, sendResponse)
            break
          
          case 'GET_STATISTICS':
            await handleGetStatistics(sendResponse)
            break
          
          // ✅ 新增：显示 Toast 通知
          case 'SHOW_TOAST':
            await handleShowToast(message.payload, sendResponse)
            break
          
          // ✅ 新增：关联库查询
          case 'FIND_LINKED_RECORDS':
            await handleFindLinkedRecords(message.payload, sendResponse)
            break
          
          case 'GET_RECORD_BY_NEODB_UUID':
            await handleGetRecordByNeoDBUuid(message.payload, sendResponse)
            break
          
          // ✅ 新增：同步日志查询
          case 'GET_SYNC_LOGS':
            await handleGetSyncLogs(message.payload, sendResponse)
            break
          
          case 'CLEAR_SYNC_LOGS':
            await handleClearSyncLogs(sendResponse)
            break
          
          default:
            debugLog('Unknown message type:', message.type)
            sendResponse({ success: false, error: 'Unknown message type' })
        }
      } catch (error) {
        errorLog('❌ Message handling error:', error)
        sendResponse({ success: false, error: String(error) })
      } finally {
        clearTimeout(globalTimeout)  // ✅ 确保清除超时
      }
    }
    
    
    // ==================== 辅助函数 ====================
    
    /**
     * 获取设置（直接从 chrome.storage.local）
     */
    async function getLocalSettings(): Promise<AppSettings> {
      return new Promise((resolve) => {
        chrome.storage.local.get([
          'webdavUrl', 'webdavUsername', 'webdavPassword', 'neodbToken',
          'autoSync', 'syncInterval', 'theme', 'language',
          'notificationEnabled', 'quarantineAutoClean', 'quarantineRetentionDays'
        ], (result) => {
          resolve({
            webdavUrl: result.webdavUrl || '',
            webdavUsername: result.webdavUsername || '',
            webdavPassword: result.webdavPassword || '',
            neodbToken: result.neodbToken || '',
            autoSync: result.autoSync ?? false,
            syncInterval: result.syncInterval || 30,
            theme: result.theme || 'auto',
            language: result.language || 'zh-CN',
            notificationEnabled: result.notificationEnabled ?? true,
            quarantineAutoClean: result.quarantineAutoClean ?? true,
            quarantineRetentionDays: result.quarantineRetentionDays || 7,
          } as AppSettings)
        })
      })
    }
    
    /**
     * 更新设置
     */
    async function updateLocalSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
      const current = await getLocalSettings()
      const updated = { ...current, ...partial }
      
      return new Promise((resolve) => {
        chrome.storage.local.set(updated, () => {
          if (chrome.runtime.lastError) {
            errorLog('Failed to save settings:', chrome.runtime.lastError)
          } else {
            debugLog('Settings saved successfully')
          }
          resolve(updated)
        })
      })
    }
    
    /**
     * 导出数据
     */
    async function exportData(): Promise<ExportData> {
      const records = await mediaDB.getAllRecords()
      
      const datasets: ExportData['datasets'] = {}
      for (const record of records) {
        if (!datasets[record.provider]) {
          datasets[record.provider] = {}
        }
        if (!datasets[record.provider][record.type]) {
          datasets[record.provider][record.type] = []
        }
        datasets[record.provider][record.type].push({
          ...record,
          id: undefined
        } as MediaRecord)
      }
      
      return {
        schema: 'umm-export',
        version: 1,
        exportedAt: new Date().toISOString(),
        datasets
      }
    }
    
    /**
     * 导入数据
     */
    async function importData(data: ExportData): Promise<void> {
      for (const provider in data.datasets) {
        for (const type in data.datasets[provider]) {
          const records = data.datasets[provider][type]
          for (const record of records) {
            await mediaDB.saveRecord(record)
          }
        }
      }
    }
    
    /**
     * 获取统计数据
     */
    async function getStatisticsData() {
      const records = await mediaDB.getAllRecords()
      
      return {
        total: records.length,
        movie: records.filter(r => r.type === 'movie').length,
        tv: records.filter(r => r.type === 'tv').length,
        music: records.filter(r => r.type === 'music').length,
        book: records.filter(r => r.type === 'book').length,
        douban: records.filter(r => r.provider === 'douban').length,
        imdb: records.filter(r => r.provider === 'imdb').length,
        neodb: records.filter(r => r.provider === 'neodb').length,
      }
    }
    
    // ==================== 消息处理器 ====================
    
    /**
     * 获取记录
     */
    async function handleGetRecord(
      payload: { type: string; provider: string; providerId: string },
      sendResponse: (response: any) => void
    ) {
      const records = await mediaDB.getRecordsByProviderType(payload.provider, payload.type)
      const record = records.find(r => r.providerId === payload.providerId)
      
      sendResponse({
        success: true,
        record: record || null
      })
    }
    
    /**
     * 保存记录
     */
    async function handleSaveRecord(
      payload: MediaRecord,
      sendResponse: (response: any) => void
    ) {
      const result = await mediaDB.saveRecord(payload)
      
      if (result.success) {
        // ✅ 优化：通知所有 Popup 数据已变化
        notifyDataChanged()
        
        // ✅ 修复：只在数据有实质性变化时才发送通知
        if (result.hasChange) {
          await showNotification('记录已保存', `✅ ${payload.providerId}`)
        } else {
          debugLog('Data unchanged, skipped notification')
        }
      }
      
      sendResponse({ success: result.success })
    }
    
    /**
     * 获取统计数据
     */
    async function handleGetStats(sendResponse: (response: any) => void) {
      const records = await mediaDB.getAllRecords()
      debugLog('Statistics - Total records:', records.length)
      
      const stats = {
        total: records.length,
        movie: records.filter(r => r.type === 'movie').length,
        tv: records.filter(r => r.type === 'tv').length,
        music: records.filter(r => r.type === 'music').length,
        book: records.filter(r => r.type === 'book').length,
        douban: records.filter(r => r.provider === 'douban').length,
        imdb: records.filter(r => r.provider === 'imdb').length,
        neodb: records.filter(r => r.provider === 'neodb').length,
      }
      
      debugLog('Breakdown:', stats)
      
      // 检查是否有重复的 providerId
      const providerIds = new Set(records.map(r => r.providerId))
      debugLog('Unique providerIds:', providerIds.size, '/ Total:', records.length)
      
      if (providerIds.size < records.length) {
        debugLog('WARNING: Duplicate records detected!')
        debugLog('Expected unique count:', providerIds.size)
        debugLog('Actual count:', records.length)
        debugLog('Duplicates:', records.length - providerIds.size)
      }
      
      sendResponse({ success: true, stats })
    }
    
    /**
     * 导出数据
     */
    async function handleExportData(sendResponse: (response: any) => void) {
      try {
        debugLog('Starting export...')
        
        const records = await mediaDB.getAllRecords()
        
        // 按 provider 和 type 分组
        const datasets: ExportData['datasets'] = {}
        for (const record of records) {
          if (!datasets[record.provider]) {
            datasets[record.provider] = {}
          }
          if (!datasets[record.provider][record.type]) {
            datasets[record.provider][record.type] = []
          }
          datasets[record.provider][record.type].push({
            ...record,
            id: undefined
          } as MediaRecord)
        }
        
        const data: ExportData = {
          schema: 'umm-export',
          version: 1,
          exportedAt: new Date().toISOString(),
          datasets
        }
        
        debugLog('Export data generated:', Object.keys(data.datasets).length, 'providers')
        
        // ✅ 直接返回数据给 Popup，由 Popup 处理下载（Service Worker 不支持 URL.createObjectURL）
        sendResponse({ success: true, data })
      } catch (error) {
        errorLog('Export failed:', error)
        sendResponse({ success: false, error: String(error) })
      }
    }
    
    /**
     * 导入数据
     */
    async function handleImportData(
      payload: any,
      sendResponse: (response: any) => void
    ) {
      try {
        // ✅ 统计记录数
        let totalRecords = 0
        for (const provider in payload.datasets || {}) {
          for (const type in payload.datasets[provider]) {
            totalRecords += payload.datasets[provider][type].length
          }
        }
        
        debugLog(`Importing ${totalRecords} records...`)
        
        // 遍历 datasets 导入所有记录
        for (const provider in payload.datasets) {
          for (const type in payload.datasets[provider]) {
            const records = payload.datasets[provider][type]
            for (const record of records) {
              await mediaDB.saveRecord(record)
            }
          }
        }
        
        await showNotification('数据导入成功', `✅ 已导入 ${totalRecords.toLocaleString()} 条记录`)
        sendResponse({ success: true, recordCount: totalRecords })
      } catch (error) {
        errorLog('Import failed:', error)
        sendResponse({ success: false, error: String(error) })
      }
    }
    
    /**
     * 清空隔离区
     */
    async function handleClearQuarantine(sendResponse: (response: any) => void) {
      await mediaDB.clearQuarantine()
      await showNotification('隔离区已清空', '✅ 所有隔离记录已删除')
      
      sendResponse({ success: true })
    }
    
    /**
     * WebDAV 同步
     */
    async function handleWebDAVSync(sendResponse: (response: any) => void) {
      try {
        // ✅ 验证扩展上下文是否有效
        if (!chrome.runtime?.id) {
          errorLog('Extension context invalid')
          sendResponse({ success: false, error: 'Extension context invalidated' })
          return
        }
        
        debugLog('WebDAV sync operation starting, config will be loaded via Store.getSettings()')
        
        const result = await WebDAV.syncWithWebDAV()
        
        // ✅ 记录同步日志
        await mediaDB.saveSyncLog({
          type: result.direction === 'merge' ? 'merge' : (result.direction as 'upload' | 'download'),
          direction: 'bidirectional',
          timestamp: new Date().toISOString(),
          success: result.success,
          message: result.message,
          stats: result.stats,
          error: result.success ? undefined : result.message
        })
        
        if (result.success) {
          await showNotification('同步成功', result.message || '数据已同步')
        } else {
          await showNotification('同步失败', result.message || '请检查 WebDAV 配置')
        }
        
        sendResponse(result)
      } catch (error) {
        errorLog('WebDAV sync error:', error)
        sendResponse({ success: false, message: String(error) })
      }
    }
    
    /**
     * 测试 WebDAV 连接
     */
    async function handleWebDAVTest(
      payload: { url: string; username: string; password: string },
      sendResponse: (response: any) => void
    ) {
      try {
        // 临时设置用于测试
        const testConfig = {
          url: payload.url,
          username: payload.username,
          password: payload.password,
        }
        
        // 测试连接
        const isConnected = await WebDAV.checkConnection(testConfig as any)
        
        if (isConnected) {
          sendResponse({ success: true, message: '连接成功' })
        } else {
          sendResponse({ success: false, message: '连接失败，请检查配置' })
        }
      } catch (error) {
        errorLog('WebDAV test error:', error)
        sendResponse({ success: false, message: String(error) })
      }
    }
    
    /**
     * WebDAV 云覆盖本
     */
    async function handleWebDAVDownload(sendResponse: (response: any) => void) {
      try {
        // ✅ 验证扩展上下文是否有效
        if (!chrome.runtime?.id) {
          errorLog('Extension context invalid')
          sendResponse({ success: false, error: 'Extension context invalidated' })
          return
        }
        
        debugLog('WebDAV download operation starting, config will be loaded via Store.getSettings()')
        
        const result = await WebDAV.downloadAndOverwrite()
        
        // ✅ 记录同步日志
        await mediaDB.saveSyncLog({
          type: 'download',
          direction: 'cloud-to-local',
          timestamp: new Date().toISOString(),
          success: result.success,
          message: result.message,
          stats: result.stats,
          error: result.success ? undefined : result.message
        })
        
        if (result.success) {
          await showNotification('下载成功', result.message || '已从云端覆盖本地数据')
        } else {
          await showNotification('下载失败', result.message || '请检查 WebDAV 配置')
        }
        
        sendResponse(result)
      } catch (error) {
        errorLog('WebDAV download error:', error)
        sendResponse({ success: false, message: String(error) })
      }
    }
    
    /**
     * WebDAV 本覆盖云
     */
    async function handleWebDAVUpload(sendResponse: (response: any) => void) {
      try {
        // ✅ 验证扩展上下文是否有效
        if (!chrome.runtime?.id) {
          errorLog('Extension context invalid')
          sendResponse({ success: false, error: 'Extension context invalidated' })
          return
        }
        
        debugLog('WebDAV upload operation starting, config will be loaded via Store.getSettings()')
        
        const result = await WebDAV.uploadAndOverwrite()
        
        // ✅ 记录同步日志
        await mediaDB.saveSyncLog({
          type: 'upload',
          direction: 'local-to-cloud',
          timestamp: new Date().toISOString(),
          success: result.success,
          message: result.message,
          stats: result.stats,
          error: result.success ? undefined : result.message
        })
        
        if (result.success) {
          await showNotification('上传成功', result.message || '已将本地数据覆盖到云端')
        } else {
          await showNotification('上传失败', result.message || '请检查 WebDAV 配置')
        }
        
        sendResponse(result)
      } catch (error) {
        errorLog('WebDAV upload error:', error)
        sendResponse({ success: false, message: String(error) })
      }
    }
    
    /**
     * NeoDB 元数据增强
     */
    async function handleNeoDBEnrich(
      payload: { providerId: string },
      sendResponse: (response: any) => void
    ) {
      try {
        const settings = await getLocalSettings()
        
        // 获取记录
        const records = await mediaDB.getRecordsByProviderType('neodb', 'movie')
        const record = records.find(r => r.providerId === payload.providerId)
        
        if (!record) {
          sendResponse({ success: false, message: '记录不存在' })
          return
        }
        
        // 增强元数据
        const enriched = await NeoDB.enrichRecordMetadata(record, settings.neodbToken)
        
        sendResponse({ success: true, record: enriched })
      } catch (error) {
        errorLog('NeoDB enrich error:', error)
        sendResponse({ success: false, message: String(error) })
      }
    }
    
    /**
     * NeoDB 搜索
     */
    async function handleNeoDBSearch(
      payload: { query: string; type?: string },
      sendResponse: (response: any) => void
    ) {
      try {
        const settings = await getLocalSettings()
        
        const results = await NeoDB.searchWorks(
          payload.query,
          payload.type as any,
          settings.neodbToken
        )
        
        sendResponse({ success: true, results })
      } catch (error) {
        errorLog('NeoDB search error:', error)
        sendResponse({ success: false, message: String(error) })
      }
    }
    
    /**
     * 处理 NeoDB 评分推送
     */
    async function handleNeoDBPushRating(
      payload: { 
        record: { 
          providerId: string
          rating: number
          status: number  // 0=未看, 1=在看, 2=已看
          type: string    // movie/tv/music/book
          provider: string
          url: string     // ✅ 新增：作品 URL
        }
      },
      sendResponse: (response: any) => void
    ) {
      // ✅ 修复：将 keepAlive 移到 try 块之前，确保所有路径都能访问
      const keepAlive = setInterval(() => {
        debugLog('Keep-alive ping during NeoDB push')
      }, 20000)
      
      // ✅ 统一的清理和响应函数
      const cleanupAndRespond = (response: any) => {
        clearInterval(keepAlive)
        sendResponse(response)
      }
      
      try {
        const { record } = payload
        
        debugLog('Pushing rating to NeoDB:', record)
        
        // 从存储中获取 NeoDB Token
        const settings = await getLocalSettings()
        if (!settings.neodbToken) {
          cleanupAndRespond({ 
            success: false, 
            message: '请先在设置中配置 NeoDB Token' 
          })
          return
        }
        
        // 验证状态：只有已看/已听（status=2）才允许推送
        if (record.status !== 2) {
          cleanupAndRespond({ 
            success: false, 
            message: '请先在豆瓣标记为“已看/已听”后再同步到 NeoDB' 
          })
          return
        }
        
        // ✅ 步骤 1: 通过 URL 抓取 NeoDB 作品信息（正确方式）
        debugLog('Fetching NeoDB catalog by URL:', record.url)
        const catalogData = await NeoDB.fetchCatalogByUrl(
          record.url,
          settings.neodbToken
        )
        
        debugLog('Catalog fetch result:', catalogData ? 'Success' : 'Failed')
        if (catalogData) {
          debugLog('Catalog UUID:', catalogData.uuid)
        }
        
        if (!catalogData || !catalogData.uuid) {
          cleanupAndRespond({ 
            success: false, 
            message: '未在 NeoDB 找到对应作品，请手动搜索并标记' 
          })
          return
        }
        
        const neodbWorkId = catalogData.uuid
        debugLog('Found NeoDB work:', neodbWorkId)
        
        // ✅ 步骤 2: 检查是否已存在于书架
        let existingShelfUuid = await NeoDB.getShelfItemUuid(
          neodbWorkId,
          settings.neodbToken
        )
        
        let shelfItemResponse: NeoDB.ShelfItemResponse | null = null
        
        if (existingShelfUuid) {
          // 已存在，更新评分
          shelfItemResponse = await NeoDB.updateShelfItem(
            existingShelfUuid,
            { rating: record.rating },
            settings.neodbToken
          )
          
          if (!shelfItemResponse) {
            cleanupAndRespond({ 
              success: false, 
              message: '更新 NeoDB 评分失败' 
            })
            return
          }
        } else {
          // 不存在，创建新标记（✅ 正确方式：POST /me/shelf/item/{item_uuid}）
          shelfItemResponse = await NeoDB.markItem(
            neodbWorkId,
            'complete',  // 标记为“已完成”
            record.rating,
            settings.neodbToken
          )
          
          if (!shelfItemResponse) {
            cleanupAndRespond({ 
              success: false, 
              message: '同步到 NeoDB 失败' 
            })
            return
          }
          
          existingShelfUuid = shelfItemResponse.uuid
        }
        
        // ✅ 步骤 3: 更新本地记录，保存 NeoDB UUID
        const localRecord = await mediaDB.getRecordByKey(
          record.provider,
          record.type,
          record.providerId
        )
        
        if (localRecord) {
          // ✅ 调试：输出更新前的记录
          debugLog('Before update - localRecord:', {
            id: localRecord.id,
            neodbUuid: localRecord.neodbUuid,
            neodbShelfUuid: localRecord.neodbShelfUuid
          })
          
          // 更新 linkedIds 和 NeoDB UUID
          const updatedRecord = {
            ...localRecord,
            neodbUuid: neodbWorkId,
            neodbShelfUuid: existingShelfUuid,
            linkedIds: {
              ...localRecord.linkedIds,
              neodbId: neodbWorkId,
            },
            updatedAt: new Date().toISOString(),
          }
          
          // ✅ 调试：输出更新后的记录
          debugLog('After update - updatedRecord:', {
            id: updatedRecord.id,
            neodbUuid: updatedRecord.neodbUuid,
            neodbShelfUuid: updatedRecord.neodbShelfUuid
          })
          
          await mediaDB.saveRecord(updatedRecord)
          debugLog('Saved NeoDB UUID to local record:', neodbWorkId)
          
          // ✅ 验证：重新读取记录确认保存成功
          const verifyRecord = await mediaDB.getRecordByKey(
            record.provider,
            record.type,
            record.providerId
          )
          debugLog('Verify after save:', verifyRecord ? {
            neodbUuid: verifyRecord.neodbUuid,
            neodbShelfUuid: verifyRecord.neodbShelfUuid
          } : 'null')
        } else {
          debugLog('Local record not found, cannot save NeoDB UUID')
        }
        
        cleanupAndRespond({ 
          success: true, 
          message: `已同步到 NeoDB (${record.rating}/10)`,
          neodbUuid: neodbWorkId,
          neodbShelfUuid: existingShelfUuid,
        })
      } catch (error) {
        errorLog('NeoDB push failed:', error)
        cleanupAndRespond({ 
          success: false, 
          message: `同步失败: ${String(error)}` 
        })
      } finally {
        clearInterval(keepAlive)
      }
    }
    
    /**
     * 获取指定 Provider 和 Type 的所有记录
     */
    async function handleGetRecordsByProviderType(
      payload: { provider: string; type: string },
      sendResponse: (response: any) => void
    ) {
      const records = await mediaDB.getRecordsByProviderType(
        payload.provider as any,
        payload.type as any
      )
      sendResponse({ success: true, records })
    }
    
    /**
     * ✅ 新增：根据 provider/type/providerId 查询单条记录
     */
    async function handleGetRecordByKey(
      payload: { provider: string; type: string; providerId: string },
      sendResponse: (response: any) => void
    ) {
      try {
        debugLog('GET_RECORD_BY_KEY:', payload)
        
        const record = await mediaDB.getRecordByKey(
          payload.provider,
          payload.type,
          payload.providerId
        )
        
        debugLog('Record found:', record ? 'Yes' : 'No')
        if (record) {
          debugLog('Record details:', {
            id: record.id,
            neodbUuid: record.neodbUuid,
            neodbShelfUuid: record.neodbShelfUuid
          })
        }
        
        sendResponse({ success: true, record })
      } catch (error) {
        errorLog('GET_RECORD_BY_KEY failed:', error)
        sendResponse({ success: false, error: String(error) })
      }
    }
    
    /**
     * 删除记录
     */
    async function handleDeleteRecord(
      payload: { id: string },
      sendResponse: (response: any) => void
    ) {
      await mediaDB.deleteRecord(payload.id)
      // ✅ 优化：通知数据变化
      notifyDataChanged()
      sendResponse({ success: true })
    }
    
    /**
     * 获取所有记录
     */
    async function handleGetAllRecords(sendResponse: (response: any) => void) {
      // ✅ 修复：移除 keep-alive interval，改用单次长连接
      // Chrome 会在 sendResponse 调用前保持 channel 开启（通过 return true）
      
      try {
        debugLog('Starting getAllRecords query...')
        const startTime = Date.now()
        
        await mediaDB.init()
        const records = await mediaDB.getAllRecords()
        
        debugLog('Retrieved', records.length, 'records in', Date.now() - startTime, 'ms')
        
        sendResponse({ success: true, records })
      } catch (error) {
        errorLog('Failed to get all records:', error)
        sendResponse({ success: false, error: String(error), records: [] })
      }
      // ✅ 修复：不需要 clearInterval，sendResponse 后 channel 自动关闭
    }
    
    /**
     * 批量保存记录
     */
    async function handleBulkUpsertRecords(
      payload: { records: MediaRecord[] },
      sendResponse: (response: any) => void
    ) {
      await mediaDB.saveRecords(payload.records)
      // ✅ 优化：通知数据变化
      notifyDataChanged()
      sendResponse({ success: true })
    }
    
    /**
     * 获取设置
     */
    async function handleGetSettings(sendResponse: (response: any) => void) {
      const settings = await getLocalSettings()
      sendResponse({ success: true, settings })
    }
    
    /**
     * 更新设置
     */
    async function handleUpdateSettings(
      payload: Partial<AppSettings>,
      sendResponse: (response: any) => void
    ) {
      const settings = await updateLocalSettings(payload)
      sendResponse({ success: true, settings })
    }
    
    /**
     * 导出结构化数据
     */
    async function handleExportStructuredData(sendResponse: (response: any) => void) {
      const data = await exportData()
      sendResponse({ success: true, data })
    }
    
    /**
     * 导入结构化数据
     */
    async function handleImportStructuredData(
      payload: ExportData,
      sendResponse: (response: any) => void
    ) {
      await importData(payload)
      // ✅ 优化：通知数据变化
      notifyDataChanged()
      sendResponse({ success: true })
    }
    
    /**
     * 获取统计数据
     */
    async function handleGetStatistics(sendResponse: (response: any) => void) {
      const stats = await getStatisticsData()
      debugLog('Statistics - Total records:', stats.total)
      sendResponse({ success: true, stats })
    }
    
    // ==================== 生命周期管理 ====================
    
    /**
     * 首次安装处理
     */
    async function handleFirstInstall() {
      infoLog('First install detected')
      
      // ✅ 修复：mediaDB 会自动初始化，无需手动调用
      // await Store.initialize()
      
      // 设置默认配置（✅ 所有同步均为手动触发）
      await updateLocalSettings({
        autoSync: false,
        syncInterval: 30,
        notificationEnabled: true,
      })
      
      // 创建欢迎通知
      await showNotification(
        '欢迎使用 UMM!',
        '🎉 扩展已成功安装,开始管理您的收藏吧!'
      )
      
      // ✅ 移除：不再设置自动同步闹钟，所有同步操作由用户手动触发
      // await setupSyncAlarm()
    }
    
    /**
     * 更新处理
     */
    async function handleUpdate(previousVersion?: string) {
      infoLog('Update detected from version:', previousVersion)
      
      // ✅ 修复：mediaDB 会自动初始化，无需手动调用
      // await Store.initialize()
      
      // 版本迁移逻辑
      if (previousVersion) {
        await migrateData(previousVersion)
      }
      
      // 重新设置定时任务
      await setupSyncAlarm()
      
      await showNotification('扩展已更新', `✅ 从 v${previousVersion} 升级成功`)
    }
    
    // ==================== 定时任务 ====================
    
    /**
     * 设置同步闹钟
     */
    async function setupSyncAlarm() {
      // 清除旧的闹钟
      await chrome.alarms.clear('sync-alarm')
      
      // 获取设置
      const settings = await getLocalSettings()
      
      if (settings.autoSync && settings.syncInterval) {
        // 创建新的闹钟(单位:分钟)
        chrome.alarms.create('sync-alarm', {
          periodInMinutes: settings.syncInterval,
        })
        
        infoLog(`Sync alarm set: every ${settings.syncInterval} minutes`)
      }
    }
    
    // 监听闹钟事件
    chrome.alarms.onAlarm.addListener(async (alarm) => {
      if (alarm.name === 'sync-alarm') {
        infoLog('Sync alarm triggered')
        await performSync()
      }
    })
    
    /**
     * 执行同步
     */
    async function performSync() {
      infoLog('Performing sync...')
      
      try {
        const settings = await getLocalSettings()
        
        if (settings.webdavUrl && settings.webdavUsername && settings.webdavPassword) {
          // 执行 WebDAV 同步
          const result = await WebDAV.syncWithWebDAV()
          
          if (result.success) {
            infoLog('WebDAV sync successful:', result.message)
            await showNotification('同步成功', result.message || '数据已同步')
          } else {
            errorLog('WebDAV sync failed:', result.message)
            await showNotification('同步失败', result.message || '请检查 WebDAV 配置')
          }
        } else {
          debugLog('WebDAV not configured, skipping sync')
        }
      } catch (error) {
        errorLog('Sync failed:', error)
        await showNotification('同步错误', String(error))
      }
    }
    
    // ==================== 通知管理 ====================
    
    /**
     * ✅ 优化：通知所有 Popup 数据已变化
     */
    function notifyDataChanged() {
      // 通过 chrome.storage.local 发送变化通知
      chrome.storage.local.set({ umm_data_changed: Date.now() })
    }
    
    /**
     * 显示通知
     */
    async function showNotification(title: string, message: string) {
      const settings = await getLocalSettings()
      
      if (!settings.notificationEnabled) {
        return
      }
      
      // ✅ 统一使用 handleShowToast 发送到活动页面
      await handleShowToast({
        type: 'info',
        title,
        message
      }, () => {})
    }
    
    // ==================== 数据迁移 ====================
    
    /**
     * 数据迁移
     */
    async function migrateData(fromVersion: string) {
      infoLog(`Migrating data from ${fromVersion}`)
      
      // TODO: 实现从 Tampermonkey 脚本的数据迁移
      // 1. 读取 GM_getValue 存储的数据
      // 2. 转换为新格式
      // 3. 写入 chrome.storage
      
      // 示例:
      // const legacyData = await getLegacyData()
      // if (legacyData) {
      //   await convertAndMigrate(legacyData)
      // }
    }
    
    // ==================== 清理任务 ====================
    
    /**
     * 更新右键菜单统计信息
     */
    async function updateContextMenuStats() {
      try {
        const records = await mediaDB.getAllRecords()
        
        const stats = {
          movie: records.filter(r => (r.type === 'movie' || r.type === 'tv') && r.status === 2).length,
          music: records.filter(r => r.type === 'music' && r.status === 2).length,
        }
        
        chrome.contextMenus.update('show-stats', {
          title: `📦 影视 ${stats.movie} | 音乐 ${stats.music}`,
        })
      } catch (error) {
        errorLog('Failed to update context menu stats:', error)
      }
    }
    
    // Service Worker 即将停止时触发
    self.addEventListener('beforeunload', async () => {
      debugLog('Service worker stopping')
      
      // 保存任何待处理的更改
    })
    
    // ==================== Toast 通知处理器 ====================
    
    /**
     * 显示 Toast 通知(注入到当前活动浏览器页面)
     */
    async function handleShowToast(
      payload: { type: 'success' | 'error' | 'info' | 'loading'; title: string; message?: string },
      sendResponse: (response: any) => void
    ) {
      try {
        let toastSent = false
        
        // ✅ 1. 优先发送到当前活动标签页(排除 Popup 和 Chrome 内部页面)
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true })
        
        if (activeTab && activeTab.id && !activeTab.url?.includes('popup.html')) {
          // ✅ 修复：检查是否是 Chrome 内部页面或受限页面
          const isRestrictedPage = activeTab.url?.startsWith('chrome://') || 
                                   activeTab.url?.startsWith('chrome-extension://') ||
                                   activeTab.url?.startsWith('edge://') ||
                                   activeTab.url?.startsWith('about:')
          
          if (!isRestrictedPage) {
            try {
              await chrome.tabs.sendMessage(activeTab.id, {
                type: 'SHOW_TOAST',
                payload
              })
              toastSent = true
              debugLog('Toast sent to active tab:', activeTab.id)
            } catch (e) {
              // ✅ 修复：静默处理连接错误，不显示 warn 日志(这是正常情况)
              debugLog('Active tab has no content script, will try fallback')
            }
          } else {
            debugLog('Restricted page detected, skipping active tab')
          }
        }
        
        // ✅ 2. 如果活动标签页失败，尝试发送到其他已注入 Content Script 的标签页
        if (!toastSent) {
          const tabs = await chrome.tabs.query({ url: ['*://*.douban.com/*', '*://*.imdb.com/*', '*://neodb.social/*', '*://*.themoviedb.org/*', '*://*.m-team.cc/*', '*://ourbits.club/*', '*://hdhome.org/*'] })
          
          for (const tab of tabs) {
            if (tab.id && !tab.url?.includes('popup.html')) {
              try {
                await chrome.tabs.sendMessage(tab.id, {
                  type: 'SHOW_TOAST',
                  payload
                })
                toastSent = true
                debugLog('Toast sent to tab:', tab.id, tab.url)
                break
              } catch (e) {
                // 继续尝试下一个标签页
              }
            }
          }
        }
        
        // ✅ 3. 如果所有标签页都失败，使用 Chrome Notifications API
        if (!toastSent && chrome.notifications) {
          try {
            await chrome.notifications.create({
              type: 'basic',
              iconUrl: chrome.runtime.getURL('icons/icon-48.png'),
              title: payload.title,
              message: payload.message || ''
            })
            toastSent = true
            debugLog('Toast shown via Chrome Notifications API')
          } catch (notifError) {
            // ✅ 图标加载失败时重试不带图标（使用透明 1x1 PNG）
            try {
              await chrome.notifications.create({
                type: 'basic',
                iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
                title: payload.title,
                message: payload.message || ''
              })
              toastSent = true
              debugLog('Toast shown via Chrome Notifications API (fallback icon)')
            } catch (retryError) {
              errorLog('Chrome Notifications API failed completely:', retryError)
            }
          }
        }
        
        // ✅ 4. 如果所有方式都失败，记录日志但不报错
        if (!toastSent) {
          debugLog('All toast delivery methods failed')
        }
        
        sendResponse({ success: toastSent })
      } catch (error) {
        errorLog('Failed to show toast:', error)
        sendResponse({ success: false, error: String(error) })
      }
    }
    
    // ==================== 关联库查询处理器 ====================
    
    /**
     * 查找关联记录
     */
    async function handleFindLinkedRecords(
      payload: { record: MediaRecord },
      sendResponse: (response: any) => void
    ) {
      try {
        const linkedRecords = await mediaDB.findLinkedRecords(payload.record)
        sendResponse({ success: true, records: linkedRecords })
      } catch (error) {
        errorLog('Find linked records failed:', error)
        sendResponse({ success: false, error: String(error) })
      }
    }
    
    /**
     * 通过 NeoDB UUID 查询记录
     */
    async function handleGetRecordByNeoDBUuid(
      payload: { neodbUuid: string },
      sendResponse: (response: any) => void
    ) {
      try {
        const record = await mediaDB.getRecordByNeoDBUuid(payload.neodbUuid)
        sendResponse({ success: true, record: record || null })
      } catch (error) {
        errorLog('Get record by NeoDB UUID failed:', error)
        sendResponse({ success: false, error: String(error) })
      }
    }
    
    // ==================== 同步日志处理器 ====================
    
    async function handleGetSyncLogs(
      payload: { limit?: number },
      sendResponse: (response: any) => void
    ) {
      try {
        const logs = await mediaDB.getRecentSyncLogs(payload.limit || 10)
        sendResponse({ success: true, logs })
      } catch (error) {
        errorLog('Get sync logs failed:', error)
        sendResponse({ success: false, error: String(error) })
      }
    }
    
    async function handleClearSyncLogs(sendResponse: (response: any) => void) {
      try {
        const deletedCount = await mediaDB.cleanupOldLogs(0) // 清除所有
        sendResponse({ success: true, deletedCount })
      } catch (error) {
        errorLog('Clear sync logs failed:', error)
        sendResponse({ success: false, error: String(error) })
      }
    }
    
    debugLog('Service worker ready')
    
    // ✅ 修复：CRXJS 需要显式导出，否则 Service Worker 不会正确加载
    
    
  }
})
