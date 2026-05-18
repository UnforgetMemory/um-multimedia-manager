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

// ✅ 临时兼容：为 Background 提供 Store 接口(直接调用 mediaDB)
const Store = {
  async initialize() {
    // Background 中不需要初始化,mediaDB 会自动初始化
    return Promise.resolve()
  },
  
  async getDatasetMap(domain: string, provider: string) {
    const records = await mediaDB.getRecordsByProviderType(provider, domain)
    return new Map(records.map(r => [r.providerId, r]))
  },
  
  async upsertRecord(record: MediaRecord) {
    await mediaDB.saveRecord(record)
    return true
  },
  
  async getAllRecords() {
    return await mediaDB.getAllRecords()
  },
  
  async deleteRecord(id: string) {
    await mediaDB.deleteRecord(id)
  },
  
  async bulkUpsertRecords(records: MediaRecord[]) {
    for (const record of records) {
      await mediaDB.saveRecord(record)
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
          await mediaDB.saveRecord(record)
        }
      }
    }
  },
  
  async clearQuarantine() {
    // TODO: 实现隔离区清理
  },
  
  async getSettings(): Promise<AppSettings> {
    return new Promise((resolve) => {
      chrome.storage.local.get(['settings'], (result) => {
        const settings = (result.settings || {}) as Partial<AppSettings>
        // 提供默认值
        resolve({
          autoSync: false,
          syncInterval: 30,
          theme: 'auto',
          language: 'zh-CN',
          notificationEnabled: true,
          quarantineAutoClean: true,
          quarantineRetentionDays: 7,
          webdavUrl: '',
          webdavUsername: '',
          webdavPassword: '',
          neodbToken: '',
          ...settings
        } as AppSettings)
      })
    })
  },
  
  async updateSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
    return new Promise((resolve) => {
      chrome.storage.local.get(['settings'], (result) => {
        const current = result.settings || {}
        const updated = { ...current, ...partial } as AppSettings
        chrome.storage.local.set({ settings: updated }, () => {
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
  // 验证消息结构
  if (!message || !message.type) {
    sendResponse({ success: false, error: 'Invalid message format' })
    return
  }
  
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
      
      case 'DELETE_RECORD':
        await handleDeleteRecord(message.payload, sendResponse)
        break
      
      case 'GET_ALL_RECORDS':
        await handleGetAllRecords(sendResponse)
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
      
      default:
        console.warn('[UMM Background] Unknown message type:', message.type)
        sendResponse({ success: false, error: 'Unknown message type' })
    }
  } catch (error) {
    console.error('[UMM Background] Message handling error:', error)
    sendResponse({ success: false, error: String(error) })
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
  const success = await Store.upsertRecord(payload)
  
  if (success) {
    // ✅ 优化：通知所有 Popup 数据已变化
    notifyDataChanged()
    
    // 发送通知
    await showNotification('记录已保存', `✅ ${payload.providerId}`)
  }
  
  sendResponse({ success })
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
    const result = await WebDAV.syncWithWebDAV()
    
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
    const result = await WebDAV.downloadAndOverwrite()
    
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
    const result = await WebDAV.uploadAndOverwrite()
    
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
      status: string
      domain: string
      provider: string
    }
  },
  sendResponse: (response: any) => void
) {
  try {
    const { record } = payload
    
    console.log('[UMM Background] Pushing rating to NeoDB:', record)
    
    // 从存储中获取 NeoDB Token（不通过消息传递）
    const settings = await Store.getSettings()
    if (!settings.neodbToken) {
      sendResponse({ 
        success: false, 
        message: '请先在设置中配置 NeoDB Token' 
      })
      return
    }
    
    // TODO: 调用 NeoDB API 更新评分
    // 注意：目前 NeoDB API 只支持查询，不支持写入操作
    // 如果未来 API 支持写入，需要实现以下逻辑：
    // 1. 搜索作品获取 workId
    // 2. 调用 NeoDB 的更新接口（如果存在）
    
    // 当前返回提示信息，告知用户 API 限制
    sendResponse({ 
      success: false, 
      message: 'NeoDB API 暂不支持评分写入，请手动在 NeoDB 网站更新评分' 
    })
  } catch (error) {
    console.error('[UMM Background] NeoDB push failed:', error)
    sendResponse({ 
      success: false, 
      message: String(error) 
    })
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
  try {
    console.log('[Background] 📦 Handling GET_ALL_RECORDS request...')
    
    // ✅ 修复：确保 mediaDB 已初始化
    console.log('[Background] Checking mediaDB initialization...')
    await mediaDB.init()
    console.log('[Background] ✅ mediaDB initialized')
    
    const records = await Store.getAllRecords()
    console.log('[Background] ✅ Retrieved', records.length, 'records')
    
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
  
  // 初始化存储
  await Store.initialize()
  
  // 设置默认配置
  await Store.setSettings({
    autoSync: true,
    syncInterval: 30,
    notificationEnabled: true,
  })
  
  // 创建欢迎通知
  await showNotification(
    '欢迎使用 UMM!',
    '🎉 扩展已成功安装,开始管理您的收藏吧!'
  )
  
  // 设置定时同步任务
  await setupSyncAlarm()
}

/**
 * 更新处理
 */
async function handleUpdate(previousVersion?: string) {
  console.log('[UMM Background] Update detected from version:', previousVersion)
  
  await Store.initialize()
  
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
  
  try {
    // ✅ 修复：Chrome Notifications API 不支持 SVG 图标，使用 manifest 中的默认图标
    await chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon-48.png'),  // 使用 PNG 格式
      title,
      message,
      priority: 2,
    })
  } catch (error) {
    console.error('[UMM Background] Failed to show notification:', error)
  }
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
    await Store.initialize()
    
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
 * 显示 Toast 通知
 */
async function handleShowToast(
  payload: { type: 'success' | 'error' | 'info'; title: string; message?: string },
  sendResponse: (response: any) => void
) {
  try {
    // ✅ 使用 Chrome Notifications API 显示通知
    if (chrome.notifications) {
      const iconMap = {
        success: 'icons/icon-48.svg',
        error: 'icons/icon-48.svg',
        info: 'icons/icon-48.svg'
      }
      
      chrome.notifications.create({
        type: 'basic',
        iconUrl: iconMap[payload.type],
        title: payload.title,
        message: payload.message || ''
      })
    }
    
    sendResponse({ success: true })
  } catch (error) {
    console.error('[UMM Background] Failed to show toast:', error)
    sendResponse({ success: false, error: String(error) })
  }
}

console.log('[UMM Background] Service worker ready')

// ✅ 修复：CRXJS 需要显式导出，否则 Service Worker 不会正确加载
export default {}
