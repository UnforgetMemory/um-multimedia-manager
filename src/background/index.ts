/**
 * Background Service Worker - UMM 多媒体管理器
 * 
 * 负责:
 * - 消息路由(Content Script ↔ Popup ↔ Background)
 * - 定时同步任务
 * - 通知管理
 * - IndexedDB 数据库初始化
 * - Legacy 数据迁移（油猴脚本 → IndexedDB）
 */

import { MediaRecord, AppSettings, ExportData } from '@/shared'
import * as WebDAV from '@/shared/api/webdav'
import * as NeoDB from '@/shared/api/neodb'
import { mediaDB } from './database'
import { migrator } from './migration'

// ✅ Startup health check
console.log('[UMM Background] Starting up...')
console.log('[UMM Background] Extension ID:', chrome.runtime.id)
console.log('[UMM Background] Manifest version:', chrome.runtime.getManifest().version)

// Verify critical APIs are available
const requiredAPIs = ['storage', 'runtime', 'notifications', 'alarms']
for (const api of requiredAPIs) {
  if (!(chrome as any)[api]) {
    console.error(`[UMM Background] ❌ Required API missing: ${api}`)
  } else {
    console.log(`[UMM Background] ✅ API available: ${api}`)
  }
}

// ✅ 迁移旧版嵌套结构到新版扁平结构
chrome.storage.local.get(['settings'], async (result) => {
  if (result.settings && typeof result.settings === 'object') {
    console.log('[UMM Background] Migrating legacy nested settings to flat structure...')
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
        console.error('[UMM Background] Migration failed:', chrome.runtime.lastError)
      } else {
        console.log('[UMM Background] ✅ Settings migrated to flat structure')
        // 删除旧的嵌套结构
        chrome.storage.local.remove(['settings'])
      }
    })
  } else {
    console.log('[UMM Background] No legacy settings to migrate')
  }
})

// Initialize database immediately
mediaDB.init().then(() => {
  console.log('[UMM Background] ✅ Database initialized')
}).catch(err => {
  console.error('[UMM Background] ❌ Database initialization failed:', err)
})

// ✅ 临时兼容：为 Background 提供 Store 接口(直接调用 mediaDB)
const Store = {
  async getDatasetMap(domain: string, provider: string) {
    const records = await mediaDB.getRecordsByProviderType(provider, domain)
    return new Map(records.map(r => [r.providerId, r]))
  },
  
  async upsertRecord(record: MediaRecord) {
    const result = await mediaDB.saveRecord(record)
    return result
  },
  
  async getAllRecords() {
    return await mediaDB.getAllRecords()
  },
  
  async deleteRecord(id: string) {
    await mediaDB.deleteRecord(id)
  },
  
  async bulkUpsertRecords(records: MediaRecord[]) {
    for (const record of records) {
      await mediaDB.saveRecord(record) // 批量操作，忽略返回值
    }
  },
  
  async exportStructuredData() {
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
    
    return {
      schema: 'umm-export',
      version: 1,
      exportedAt: new Date().toISOString(),
      datasets
    } as ExportData
  },
  
  async importStructuredData(data: ExportData) {
    // 遍历 datasets 导入所有记录
    for (const provider in data.datasets) {
      for (const type in data.datasets[provider]) {
        const records = data.datasets[provider][type]
        for (const record of records) {
          await mediaDB.saveRecord(record) // 批量导入，忽略返回值
        }
      }
    }
  },
  
  async clearQuarantine() {
    await mediaDB.clearQuarantine()
  },
  
  async getSettings(): Promise<AppSettings> {
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
  },
  
  async updateSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
    return new Promise((resolve) => {
      // 先读取当前配置
      chrome.storage.local.get([
        'webdavUrl', 'webdavUsername', 'webdavPassword', 'neodbToken',
        'autoSync', 'syncInterval', 'theme', 'language',
        'notificationEnabled', 'quarantineAutoClean', 'quarantineRetentionDays'
      ], (result) => {
        const current = {
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
        } as AppSettings
        
        const updated = { ...current, ...partial }
        
        // ✅ 确保密码字段不为 undefined
        const settingsToSave = {
          webdavUrl: updated.webdavUrl || '',
          webdavUsername: updated.webdavUsername || '',
          webdavPassword: updated.webdavPassword || '',
          neodbToken: updated.neodbToken || '',
          autoSync: updated.autoSync ?? false,
          syncInterval: updated.syncInterval || 30,
          theme: updated.theme || 'auto',
          language: updated.language || 'zh-CN',
          notificationEnabled: updated.notificationEnabled ?? true,
          quarantineAutoClean: updated.quarantineAutoClean ?? true,
          quarantineRetentionDays: updated.quarantineRetentionDays || 7,
        }
        
        chrome.storage.local.set(settingsToSave, () => {
          if (chrome.runtime.lastError) {
            console.error('[Background] Failed to save settings:', chrome.runtime.lastError)
          } else {
            console.log('[Background] Settings saved successfully')
          }
          resolve(updated)
        })
      })
    })
  },
  
  setSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
    return this.updateSettings(partial)
  },
  
  async getStatistics() {
    const records = await mediaDB.getAllRecords()
    console.log('[Background] 📊 Statistics - Total records:', records.length)
    
    // ✅ 修复：详细统计每个 provider 和 type 的数量
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
    
    console.log('[Background] 📊 Breakdown:', stats)
    
    // ✅ 调试：检查是否有重复的 providerId
    const providerIds = new Set(records.map(r => r.providerId))
    console.log('[Background] 🔍 Unique providerIds:', providerIds.size, '/ Total:', records.length)
    
    if (providerIds.size < records.length) {
      console.warn('[Background] ⚠️ WARNING: Duplicate records detected!')
      console.warn('[Background] Expected unique count:', providerIds.size)
      console.warn('[Background] Actual count:', records.length)
      console.warn('[Background] Duplicates:', records.length - providerIds.size)
    }
    
    return stats
  },
  
  async getRecordsByProviderType(provider: string, type: string) {
    return await mediaDB.getRecordsByProviderType(provider, type)
  }
}

// ==================== 初始化 ====================

console.log('[UMM Background] Service worker started')

// 扩展安装/更新时触发
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[UMM Background] Extension installed/updated:', details.reason)
  
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
    console.log('[UMM Background] Initializing IndexedDB...')
    await mediaDB.init()
    console.log('[UMM Background] IndexedDB initialized successfully')
    
    // 检查是否已迁移
    const migrationDone = await checkMigrationStatus()
    if (!migrationDone) {
      console.log('[UMM Background] Starting legacy data migration...')
      const result = await migrator.migrate()
      
      if (result.success) {
        console.log(`[UMM Background] Migration completed: ${result.migratedCount} records migrated`)
        await markMigrationDone()
        
        // 显示迁移完成通知
        if (result.migratedCount > 0) {
          await showNotification(
            '数据迁移完成',
            `✅ 成功迁移 ${result.migratedCount} 条记录${result.errorCount > 0 ? `, ${result.errorCount} 条失败` : ''}`
          )
        }
      } else {
        console.error('[UMM Background] Migration failed:', result)
        await showNotification(
          '数据迁移失败',
          `❌ 部分数据迁移失败，请查看控制台日志`
        )
      }
    } else {
      console.log('[UMM Background] Migration already completed, skipping')
    }
  } catch (error) {
    console.error('[UMM Background] Database initialization failed:', error)
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
    console.warn('[UMM Background] Message from unknown sender')
    return false
  }
  
  console.log('[UMM Background] ✅ Message received:', message.type, 'from:', sender.id || sender.url)
  
  // 异步处理消息
  handleMessage(message, sender, sendResponse).catch(err => {
    console.error('[UMM Background] ❌ handleMessage failed:', err)
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
  console.log('[UMM Background] 📨 Received message:', message.type, 'at', new Date().toISOString())
  
  // ✅ 验证扩展上下文是否有效
  if (!chrome.runtime?.id) {
    console.error('[UMM Background] Extension context invalid')
    sendResponse({ success: false, error: 'Extension context invalidated' })
    return
  }
  
  // 验证消息结构
  if (!message || !message.type) {
    sendResponse({ success: false, error: 'Invalid message format' })
    return
  }
  
  // ✅ 添加全局超时保护（25 秒，接近 Chrome 上限）
  const globalTimeout = setTimeout(() => {
    console.error('[UMM Background] ⚠️ Message handler timeout for:', message.type)
    sendResponse({ 
      success: false, 
      error: `Operation timed out after 25s (${message.type})` 
    })
  }, 25000)
  
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
        console.log('[UMM Background] 🔄 Processing GET_ALL_RECORDS...')
        await handleGetAllRecords(sendResponse)
        console.log('[UMM Background] ✅ GET_ALL_RECORDS completed')
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
        console.warn('[UMM Background] Unknown message type:', message.type)
        sendResponse({ success: false, error: 'Unknown message type' })
    }
  } catch (error) {
    console.error('[UMM Background] ❌ Message handling error:', error)
    sendResponse({ success: false, error: String(error) })
  } finally {
    clearTimeout(globalTimeout)  // ✅ 确保清除超时
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
  const map = await Store.getDatasetMap(
    payload.type as any,
    payload.provider as any
  )
  
  const record = map.get(payload.providerId)
  
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
  const result = await Store.upsertRecord(payload)
  
  if (result.success) {
    // ✅ 优化：通知所有 Popup 数据已变化
    notifyDataChanged()
    
    // ✅ 修复：只在数据有实质性变化时才发送通知
    if (result.hasChange) {
      await showNotification('记录已保存', `✅ ${payload.providerId}`)
    } else {
      console.log('[UMM Background] ⏭️ Data unchanged, skipped notification')
    }
  }
  
  sendResponse({ success: result.success })
}

/**
 * 获取统计数据
 */
async function handleGetStats(sendResponse: (response: any) => void) {
  const stats = {
    total: 0,
    movie: 0,
    tv: 0,
    music: 0,
    done: 0,
    wish: 0,
    none: 0,
  }
  
  // 遍历所有数据集
  const domains = ['movie', 'tv', 'music'] as const
  const providers: Record<string, string[]> = {
    movie: ['douban', 'imdb', 'neodb', 'tmdb'],
    tv: ['neodb', 'tmdb'],
    music: ['douban', 'neodb'],
  }
  
  for (const domain of domains) {
    for (const provider of providers[domain]) {
      const map = await Store.getDatasetMap(domain, provider as any)
      
      for (const record of map.values()) {
        stats.total++
        
        if (domain === 'movie') stats.movie++
        else if (domain === 'tv') stats.tv++
        else if (domain === 'music') stats.music++
        
        if (record.status === 2) stats.done++  // 2 = 已看
        else if (record.status === 1) stats.wish++  // 1 = 在看
        else stats.none++  // 0 = 未看
      }
    }
  }
  
  sendResponse({ success: true, stats })
}

/**
 * 导出数据
 */
async function handleExportData(sendResponse: (response: any) => void) {
  try {
    console.log('[Background] 📤 Starting export...')
    
    const data = await Store.exportStructuredData()
    console.log('[Background] ✅ Export data generated:', Object.keys(data.datasets).length, 'providers')
    
    // ✅ 直接返回数据给 Popup，由 Popup 处理下载（Service Worker 不支持 URL.createObjectURL）
    sendResponse({ success: true, data })
  } catch (error) {
    console.error('[Background] ❌ Export failed:', error)
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
    
    console.log(`[Background] Importing ${totalRecords} records...`)
    
    await Store.importStructuredData(payload)
    
    await showNotification('数据导入成功', `✅ 已导入 ${totalRecords.toLocaleString()} 条记录`)
    sendResponse({ success: true, recordCount: totalRecords })
  } catch (error) {
    console.error('[Background] Import failed:', error)
    sendResponse({ success: false, error: String(error) })
  }
}

/**
 * 清空隔离区
 */
async function handleClearQuarantine(sendResponse: (response: any) => void) {
  await Store.clearQuarantine()
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
      console.error('[UMM Background] Extension context invalid')
      sendResponse({ success: false, error: 'Extension context invalidated' })
      return
    }
    
    console.log('[UMM Background] WebDAV sync operation starting, config will be loaded via Store.getSettings()')
    
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
    console.error('[UMM Background] WebDAV sync error:', error)
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
    console.error('[UMM Background] WebDAV test error:', error)
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
      console.error('[UMM Background] Extension context invalid')
      sendResponse({ success: false, error: 'Extension context invalidated' })
      return
    }
    
    console.log('[UMM Background] WebDAV download operation starting, config will be loaded via Store.getSettings()')
    
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
    console.error('[UMM Background] WebDAV download error:', error)
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
      console.error('[UMM Background] Extension context invalid')
      sendResponse({ success: false, error: 'Extension context invalidated' })
      return
    }
    
    console.log('[UMM Background] WebDAV upload operation starting, config will be loaded via Store.getSettings()')
    
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
    console.error('[UMM Background] WebDAV upload error:', error)
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
    const settings = await Store.getSettings()
    
    // 获取记录
    const map = await Store.getDatasetMap('movie', 'neodb')
    const record = map.get(payload.providerId)
    
    if (!record) {
      sendResponse({ success: false, message: '记录不存在' })
      return
    }
    
    // 增强元数据
    const enriched = await NeoDB.enrichRecordMetadata(record, settings.neodbToken)
    
    sendResponse({ success: true, record: enriched })
  } catch (error) {
    console.error('[UMM Background] NeoDB enrich error:', error)
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
    const settings = await Store.getSettings()
    
    const results = await NeoDB.searchWorks(
      payload.query,
      payload.type as any,
      settings.neodbToken
    )
    
    sendResponse({ success: true, results })
  } catch (error) {
    console.error('[UMM Background] NeoDB search error:', error)
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
    console.log('[UMM Background] Keep-alive ping during NeoDB push')
  }, 20000)
  
  // ✅ 统一的清理和响应函数
  const cleanupAndRespond = (response: any) => {
    clearInterval(keepAlive)
    sendResponse(response)
  }
  
  try {
    const { record } = payload
    
    console.log('[UMM Background] Pushing rating to NeoDB:', record)
    
    // 从存储中获取 NeoDB Token
    const settings = await Store.getSettings()
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
    console.log('[UMM Background] Fetching NeoDB catalog by URL:', record.url)
    const catalogData = await NeoDB.fetchCatalogByUrl(
      record.url,
      settings.neodbToken
    )
    
    console.log('[UMM Background] Catalog fetch result:', catalogData ? 'Success' : 'Failed')
    if (catalogData) {
      console.log('[UMM Background] Catalog UUID:', catalogData.uuid)
    }
    
    if (!catalogData || !catalogData.uuid) {
      cleanupAndRespond({ 
        success: false, 
        message: '未在 NeoDB 找到对应作品，请手动搜索并标记' 
      })
      return
    }
    
    const neodbWorkId = catalogData.uuid
    console.log('[UMM Background] Found NeoDB work:', neodbWorkId)
    
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
      console.log('[UMM Background] Before update - localRecord:', {
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
      console.log('[UMM Background] After update - updatedRecord:', {
        id: updatedRecord.id,
        neodbUuid: updatedRecord.neodbUuid,
        neodbShelfUuid: updatedRecord.neodbShelfUuid
      })
      
      await Store.upsertRecord(updatedRecord)
      console.log('[UMM Background] Saved NeoDB UUID to local record:', neodbWorkId)
      
      // ✅ 验证：重新读取记录确认保存成功
      const verifyRecord = await mediaDB.getRecordByKey(
        record.provider,
        record.type,
        record.providerId
      )
      console.log('[UMM Background] Verify after save:', verifyRecord ? {
        neodbUuid: verifyRecord.neodbUuid,
        neodbShelfUuid: verifyRecord.neodbShelfUuid
      } : 'null')
    } else {
      console.warn('[UMM Background] Local record not found, cannot save NeoDB UUID')
    }
    
    cleanupAndRespond({ 
      success: true, 
      message: `已同步到 NeoDB (${record.rating}/10)`,
      neodbUuid: neodbWorkId,
      neodbShelfUuid: existingShelfUuid,
    })
  } catch (error) {
    console.error('[UMM Background] NeoDB push failed:', error)
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
  const records = await Store.getRecordsByProviderType(
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
    console.log('[UMM Background] GET_RECORD_BY_KEY:', payload)
    
    const record = await mediaDB.getRecordByKey(
      payload.provider,
      payload.type,
      payload.providerId
    )
    
    console.log('[UMM Background] Record found:', record ? 'Yes' : 'No')
    if (record) {
      console.log('[UMM Background] Record details:', {
        id: record.id,
        neodbUuid: record.neodbUuid,
        neodbShelfUuid: record.neodbShelfUuid
      })
    }
    
    sendResponse({ success: true, record })
  } catch (error) {
    console.error('[UMM Background] GET_RECORD_BY_KEY failed:', error)
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
  await Store.deleteRecord(payload.id)
  // ✅ 优化：通知数据变化
  notifyDataChanged()
  sendResponse({ success: true })
}

/**
 * 获取所有记录
 */
async function handleGetAllRecords(sendResponse: (response: any) => void) {
  // ✅ 修复：使用更可靠的 keep-alive 机制
  // Chrome 会在 Service Worker 空闲时终止它，即使有 open message channel
  // 定期调用多个轻量级 API 可以防止被判定为 idle
  const keepAlive = setInterval(async () => {
    try {
      // 多个轻量级 API 调用确保 worker 保持活跃
      await Promise.all([
        chrome.runtime.getPlatformInfo(),
        chrome.storage.local.get(['_keepalive'])
      ])
      console.log('[UMM Background] 🔋 Keep-alive active')
    } catch (e) {
      // 忽略错误，继续尝试
    }
  }, 3000)  // 缩短至 3 秒，更频繁地 ping
  
  try {
    console.log('[Background] 📦 Starting getAllRecords query... (this may take a moment)')
    const startTime = Date.now()
    
    // ✅ 修复：确保 mediaDB 已初始化
    console.log('[Background] Checking mediaDB initialization...')
    await mediaDB.init()
    console.log('[Background] ✅ mediaDB initialized in', Date.now() - startTime, 'ms')
    
    const records = await Store.getAllRecords()
    console.log('[Background] ✅ Retrieved', records.length, 'records in', Date.now() - startTime, 'ms')
    
    // ✅ 调试：输出前 3 条记录的详细信息
    if (records.length > 0) {
      console.log('[Background] 📋 Sample records:', records.slice(0, 3).map(r => ({
        id: r.id,
        provider: r.provider,
        type: r.type,
        providerId: r.providerId,
        status: r.status,
        updatedAt: r.updatedAt
      })))
    }
    
    sendResponse({ success: true, records })
  } catch (error) {
    console.error('[Background] ❌ Failed to get all records:', error)
    sendResponse({ success: false, error: String(error), records: [] })
  } finally {
    clearInterval(keepAlive)
    console.log('[Background] 🛑 Keep-alive stopped')
  }
}

/**
 * 批量保存记录
 */
async function handleBulkUpsertRecords(
  payload: { records: MediaRecord[] },
  sendResponse: (response: any) => void
) {
  await Store.bulkUpsertRecords(payload.records)
  // ✅ 优化：通知数据变化
  notifyDataChanged()
  sendResponse({ success: true })
}

/**
 * 获取设置
 */
async function handleGetSettings(sendResponse: (response: any) => void) {
  const settings = await Store.getSettings()
  sendResponse({ success: true, settings })
}

/**
 * 更新设置
 */
async function handleUpdateSettings(
  payload: Partial<AppSettings>,
  sendResponse: (response: any) => void
) {
  const settings = await Store.updateSettings(payload)
  sendResponse({ success: true, settings })
}

/**
 * 导出结构化数据
 */
async function handleExportStructuredData(sendResponse: (response: any) => void) {
  const data = await Store.exportStructuredData()
  sendResponse({ success: true, data })
}

/**
 * 导入结构化数据
 */
async function handleImportStructuredData(
  payload: ExportData,
  sendResponse: (response: any) => void
) {
  await Store.importStructuredData(payload)
  // ✅ 优化：通知数据变化
  notifyDataChanged()
  sendResponse({ success: true })
}

/**
 * 获取统计数据
 */
async function handleGetStatistics(sendResponse: (response: any) => void) {
  const stats = await Store.getStatistics()
  sendResponse({ success: true, stats })
}

// ==================== 生命周期管理 ====================

/**
 * 首次安装处理
 */
async function handleFirstInstall() {
  console.log('[UMM Background] First install detected')
  
  // ✅ 修复：mediaDB 会自动初始化，无需手动调用
  // await Store.initialize()
  
  // 设置默认配置（✅ 所有同步均为手动触发）
  await Store.setSettings({
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
  console.log('[UMM Background] Update detected from version:', previousVersion)
  
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
  const settings = await Store.getSettings()
  
  if (settings.autoSync && settings.syncInterval) {
    // 创建新的闹钟(单位:分钟)
    chrome.alarms.create('sync-alarm', {
      periodInMinutes: settings.syncInterval,
    })
    
    console.log(`[UMM Background] Sync alarm set: every ${settings.syncInterval} minutes`)
  }
}

// 监听闹钟事件
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'sync-alarm') {
    console.log('[UMM Background] Sync alarm triggered')
    await performSync()
  }
})

/**
 * 执行同步
 */
async function performSync() {
  console.log('[UMM Background] Performing sync...')
  
  try {
    const settings = await Store.getSettings()
    
    if (settings.webdavUrl && settings.webdavUsername && settings.webdavPassword) {
      // 执行 WebDAV 同步
      const result = await WebDAV.syncWithWebDAV()
      
      if (result.success) {
        console.log('[UMM Background] WebDAV sync successful:', result.message)
        await showNotification('同步成功', result.message || '数据已同步')
      } else {
        console.error('[UMM Background] WebDAV sync failed:', result.message)
        await showNotification('同步失败', result.message || '请检查 WebDAV 配置')
      }
    } else {
      console.log('[UMM Background] WebDAV not configured, skipping sync')
    }
  } catch (error) {
    console.error('[UMM Background] Sync failed:', error)
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
  const settings = await Store.getSettings()
  
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
  console.log(`[UMM Background] Migrating data from ${fromVersion}`)
  
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
    // ✅ 修复：mediaDB 会自动初始化，无需手动调用
    // await Store.initialize()
    
    const stats = {
      movie: 0,
      music: 0,
    }
    
    // 遍历所有数据集
    const domains = ['movie', 'tv', 'music'] as const
    const providers: Record<string, string[]> = {
      movie: ['douban', 'imdb', 'neodb', 'tmdb'],
      tv: ['neodb', 'tmdb'],
      music: ['douban', 'neodb'],
    }
    
    for (const domain of domains) {
      for (const provider of providers[domain]) {
        const map = await Store.getDatasetMap(domain, provider as any)
        
        for (const record of map.values()) {
          if (record.status === 2) {  // 2 = 已看
            if (domain === 'movie' || domain === 'tv') {
              stats.movie++
            } else if (domain === 'music') {
              stats.music++
            }
          }
        }
      }
    }
    
    chrome.contextMenus.update('show-stats', {
      title: `📦 影视 ${stats.movie} | 音乐 ${stats.music}`,
    })
  } catch (error) {
    console.error('[UMM Background] Failed to update context menu stats:', error)
  }
}

// Service Worker 即将停止时触发
self.addEventListener('beforeunload', async () => {
  console.log('[UMM Background] Service worker stopping')
  
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
          console.log('[UMM Background] ✅ Toast sent to active tab:', activeTab.id)
        } catch (e) {
          // ✅ 修复：静默处理连接错误，不显示 warn 日志(这是正常情况)
          console.log('[UMM Background] ⏭️ Active tab has no content script, will try fallback')
        }
      } else {
        console.log('[UMM Background] ⏭️ Restricted page detected, skipping active tab')
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
            console.log('[UMM Background] ✅ Toast sent to tab:', tab.id, tab.url)
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
        console.log('[UMM Background] ✅ Toast shown via Chrome Notifications API')
      } catch (notifError) {
        console.error('[UMM Background] ❌ Chrome Notifications API failed:', notifError)
      }
    }
    
    // ✅ 4. 如果所有方式都失败，记录日志但不报错
    if (!toastSent) {
      console.warn('[UMM Background] ⚠️ All toast delivery methods failed')
    }
    
    sendResponse({ success: toastSent })
  } catch (error) {
    console.error('[UMM Background] ❌ Failed to show toast:', error)
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
    console.error('[UMM Background] Find linked records failed:', error)
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
    console.error('[UMM Background] Get record by NeoDB UUID failed:', error)
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
    console.error('[UMM Background] Get sync logs failed:', error)
    sendResponse({ success: false, error: String(error) })
  }
}

async function handleClearSyncLogs(sendResponse: (response: any) => void) {
  try {
    const deletedCount = await mediaDB.cleanupOldLogs(0) // 清除所有
    sendResponse({ success: true, deletedCount })
  } catch (error) {
    console.error('[UMM Background] Clear sync logs failed:', error)
    sendResponse({ success: false, error: String(error) })
  }
}

console.log('[UMM Background] Service worker ready')

// ✅ P0: 定期清理 NeoDB 书架缓存（每10分钟）
setInterval(() => {
  NeoDB.cleanupShelfCache()
  console.log('[UMM Background] Shelf cache cleaned')
}, 10 * 60 * 1000)

// ✅ 修复：CRXJS 需要显式导出，否则 Service Worker 不会正确加载
export default {}
