/**
 * IndexedDB Store Adapter
 * 
 * 统一管理所有数据的持久化：
 * - Media Records: 媒体记录主数据
 * - Quarantine: 隔离区记录
 * - TTL Cache: 过期缓存
 * - Settings: 应用设置（保留在 chrome.storage.local）
 */

import { mediaDB, MediaDatabase, type MediaRecord, type QuarantineEntry } from '@/background/database'
import type { Domain, Provider } from '../config'
import type { AppSettings, ExportData } from '../types'

export class IndexedDBStore {
  // ==================== Records 操作 ====================
  
  /**
   * 获取单条记录
   */
  async getRecord(id: string): Promise<MediaRecord | undefined> {
    return await mediaDB.getRecord(id)
  }
  
  /**
   * 初始化数据库(兼容旧 API,实际无需操作)
   */
  async initialize(): Promise<void> {
    // IndexedDB 自动初始化,无需手动调用
    return Promise.resolve()
  }
  
  /**
   * 按 provider + type 查询所有记录
   */
  async getRecordsByProviderType(
    provider: Provider,
    type: string
  ): Promise<MediaRecord[]> {
    return await mediaDB.getRecordsByProviderType(provider, type)
  }
  
  /**
   * 兼容旧 API: 获取 Map 格式的记录集(已废弃,请使用 getRecordsByProviderType)
   * @deprecated 使用 getRecordsByProviderType 替代
   */
  async getDatasetMap(type: string, provider: Provider): Promise<Map<string, MediaRecord>> {
    const records = await this.getRecordsByProviderType(provider, type)
    const map = new Map<string, MediaRecord>()
    records.forEach(record => {
      map.set(record.providerId, record)
    })
    return map
  }
  
  /**
   * 兼容旧 API: 设置数据集(已废弃,请使用 upsertRecord)
   * @deprecated 使用 upsertRecord 替代
   */
  async setDatasetMap(type: string, provider: Provider, records: Map<string, any>): Promise<void> {
    // 转换为标准格式并批量保存
    const v2Records: MediaRecord[] = []
    for (const [providerId, record] of records) {
      v2Records.push({
        provider,
        type,
        providerId,
        id: `${provider}:${type}:${providerId}`,
        url: record.url || '',
        status: record.status || 0,
        rating: record.rating || 0,
        updatedAt: record.updatedAt || new Date().toISOString(),
      })
    }
    await this.bulkUpsertRecords(v2Records)
  }
  
  /**
   * 保存或更新单条记录（智能合并）
   */
  async upsertRecord(record: MediaRecord): Promise<boolean> {
    console.log('[IndexedDBStore] upsertRecord called:', { id: record.id, provider: record.provider, type: record.type })
    
    const existing = await this.getRecord(record.id!)
    console.log('[IndexedDBStore] Existing record:', existing ? 'Found' : 'Not found')
    
    // 如果已存在且更新时间更晚，跳过
    if (existing && existing.updatedAt && record.updatedAt && new Date(existing.updatedAt) >= new Date(record.updatedAt)) {
      console.log('[IndexedDBStore] Skipping update (existing is newer)')
      return false
    }
    
    try {
      console.log('[IndexedDBStore] Calling mediaDB.saveRecord...')
      await mediaDB.saveRecord(record)
      console.log('[IndexedDBStore] mediaDB.saveRecord succeeded')
      
      // 触发数据版本更新，通知 Popup 刷新
      this._notifyDataChanged()
      
      return true
    } catch (error) {
      console.error('[IndexedDBStore] mediaDB.saveRecord failed:', error)
      throw error
    }
  }
  
  /**
   * 批量保存记录（事务）
   */
  async bulkUpsertRecords(records: MediaRecord[]): Promise<void> {
    if (records.length === 0) return
    
    await mediaDB.saveRecords(records)
    
    // 触发数据版本更新
    this._notifyDataChanged()
  }
  
  /**
   * 删除记录
   */
  async deleteRecord(id: string): Promise<void> {
    await mediaDB.deleteRecord(id)
    
    // 触发数据版本更新
    this._notifyDataChanged()
  }
  
  /**
   * 获取记录总数
   */
  async countRecords(): Promise<number> {
    return await mediaDB.countRecords()
  }
  
  /**
   * 获取所有记录（用于评分功能）
   */
  async getAllRecords(): Promise<MediaRecord[]> {
    return await mediaDB.getAllRecords()
  }
  
  /**
   * 获取所有已评分的记录
   */
  async getRatedRecords(): Promise<MediaRecord[]> {
    const allRecords = await this.getAllRecords()
    // 过滤出 rating > 0 的记录
    return allRecords.filter(record => record.rating > 0)
  }
  
  /**
   * 更新单条记录的评分(如果记录不存在则自动创建)
   */
  async updateRecordRating(
    type: string,
    provider: Provider,
    providerId: string,
    rating: number
  ): Promise<void> {
    console.log('[IndexedDBStore] updateRecordRating:', { type, provider, providerId, rating })
    
    // 尝试获取现有记录
    const id = `${provider}:${type}:${providerId}`
    const existing = await this.getRecord(id)
    
    if (existing) {
      // 记录存在,更新评分
      existing.rating = rating
      existing.status = 2  // 自动设为已看
      existing.updatedAt = new Date().toISOString()
      await this.upsertRecord(existing)
      console.log('[IndexedDBStore] ✅ Updated existing record')
    } else {
      // 记录不存在,创建新记录
      const url = MediaDatabase.generateUrl(provider, type, providerId)
      const newRecord: MediaRecord = {
        provider,
        type,
        providerId,
        id,
        url,
        status: 2,
        rating,
        updatedAt: new Date().toISOString(),
      }
      await this.upsertRecord(newRecord)
      console.log('[IndexedDBStore] ✅ Created new record')
    }
  }
  
  // ==================== Quarantine 操作 ====================
  
  /**
   * 获取所有隔离区记录
   */
  async getQuarantineEntries(): Promise<QuarantineEntry[]> {
    return await mediaDB.getQuarantineEntries()
  }
  
  /**
   * 添加记录到隔离区
   */
  async addToQuarantine(entries: QuarantineEntry[]): Promise<void> {
    if (entries.length === 0) return
    
    await mediaDB.saveQuarantineEntries(entries)
  }
  
  /**
   * 清空隔离区
   */
  async clearQuarantine(): Promise<void> {
    await mediaDB.clearQuarantine()
  }
  
  // ==================== TTL Cache 操作 ====================
  
  /**
   * 设置带 TTL 的缓存
   */
  async setTTLCache(key: string, value: any, ttlMs: number): Promise<void> {
    await mediaDB.setTTLCache(key, value, ttlMs)
  }
  
  /**
   * 获取缓存（自动检查过期）
   */
  async getTTLCache(key: string): Promise<any | undefined> {
    return await mediaDB.getTTLCache(key)
  }
  
  /**
   * 清理所有过期缓存
   */
  async cleanupExpiredTTL(): Promise<number> {
    return await mediaDB.cleanupExpiredTTL()
  }
  
  /**
   * 添加 ID 到集合（用于 Mukaku 已看列表）
   */
  async addIdToSet(key: string, id: string): Promise<void> {
    const raw = await this.getTTLCache(key)
    const set = new Set(raw || [])
    set.add(id)
    await this.setTTLCache(key, Array.from(set), 365 * 24 * 60 * 60 * 1000) // 1年
  }
  
  /**
   * 兼容旧 API: 获取 ID 集合(从 IndexedDB 查询)
   * @deprecated 使用 getRecordsByProviderType 替代
   */
  async getIdSet(type: string, provider: Provider): Promise<Set<string>> {
    const records = await this.getRecordsByProviderType(provider, type)
    return new Set(records.map(r => r.providerId))
  }
  
  /**
   * 获取 ID 集合
   */
  async getIdSetByKey(key: string): Promise<Set<string>> {
    const raw = await this.getTTLCache(key)
    return new Set(raw || [])
  }
  
  /**
   * 添加带 TTL 的 ID（用于未看缓存）
   */
  async addExpiringId(key: string, id: string, ttlMs: number): Promise<void> {
    const expiresAt = Date.now() + ttlMs
    const raw = await this.getTTLCache(key)
    const map = raw || {}
    map[id] = expiresAt
    await this.setTTLCache(key, map, ttlMs)
  }
  
  /**
   * 获取过期 Map
   */
  async getExpiringMap(key: string): Promise<Map<string, number>> {
    const raw = await this.getTTLCache(key)
    const result = new Map<string, number>()
    const now = Date.now()
    
    if (raw) {
      for (const [id, expiresAt] of Object.entries(raw)) {
        if ((expiresAt as number) > now) {
          result.set(id, expiresAt as number)
        }
      }
    }
    
    return result
  }
  
  /**
   * 删除过期 ID
   */
  async deleteExpiringId(key: string, id: string): Promise<void> {
    const raw = await this.getTTLCache(key)
    if (raw) {
      delete raw[id]
      await this.setTTLCache(key, raw, 365 * 24 * 60 * 60 * 1000)
    }
  }
  
  // ==================== Settings 操作 ====================
  
  /**
   * 获取设置（从 chrome.storage.local）
   */
  async getSettings(): Promise<AppSettings> {
    return new Promise((resolve) => {
      if (!chrome.storage?.local) {
        console.warn('[IndexedDBStore] chrome.storage not available, using defaults')
        resolve({
          webdavUrl: '',
          webdavUsername: '',
          webdavPassword: '',
          neodbToken: '',
          autoSync: true,
          syncInterval: 30,
          theme: 'auto',
          language: 'zh-CN',
          notificationEnabled: true,
          quarantineAutoClean: true,
          quarantineRetentionDays: 7,
        } as AppSettings)
        return
      }
      
      chrome.storage.local.get([
        'webdavUrl', 'webdavUsername', 'webdavPassword', 'neodbToken',
        'autoSync', 'syncInterval', 'theme', 'language',
        'notificationEnabled', 'quarantineAutoClean', 'quarantineRetentionDays'
      ], (result) => {
        // ✅ 添加详细日志
        console.log('[IndexedDBStore] getSettings result:', {
          webdavUrl: (result.webdavUrl as string) ? `${(result.webdavUrl as string).substring(0, 20)}...` : '(empty)',
          webdavUsername: (result.webdavUsername as string) || '(empty)',
          webdavPassword: (result.webdavPassword as string) ? '***' : '(empty)',
          neodbToken: (result.neodbToken as string) ? '***' : '(empty)'
        })
        
        resolve({
          webdavUrl: result.webdavUrl || '',
          webdavUsername: result.webdavUsername || '',
          webdavPassword: result.webdavPassword || '',
          neodbToken: result.neodbToken || '',
          autoSync: result.autoSync ?? false,  // ✅ 默认禁用自动同步
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
   * 更新设置（写入 chrome.storage.local）
   */
  async updateSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
    console.log('[IndexedDBStore] updateSettings called with:', {
      webdavUrl: partial.webdavUrl ? 'provided' : 'not provided',
      webdavUsername: partial.webdavUsername ? 'provided' : 'not provided',
      webdavPassword: partial.webdavPassword ? 'provided' : 'not provided',
    })
    
    const current = await this.getSettings()
    const updated = { ...current, ...partial }
    
    // ✅ 确保密码字段不为 undefined 或 null
    const settingsToSave = {
      webdavUrl: updated.webdavUrl || '',
      webdavUsername: updated.webdavUsername || '',
      webdavPassword: updated.webdavPassword || '',  // Ensure empty string, not undefined
      neodbToken: updated.neodbToken || '',
      autoSync: updated.autoSync ?? false,
      syncInterval: updated.syncInterval || 30,
      theme: updated.theme || 'auto',
      language: updated.language || 'zh-CN',
      notificationEnabled: updated.notificationEnabled ?? true,
      quarantineAutoClean: updated.quarantineAutoClean ?? true,
      quarantineRetentionDays: updated.quarantineRetentionDays || 7,
    }
    
    console.log('[IndexedDBStore] Saving settings (password field):', 
      settingsToSave.webdavPassword ? 'present' : 'empty')
    
    return new Promise((resolve) => {
      chrome.storage.local.set(settingsToSave, () => {
        if (chrome.runtime.lastError) {
          console.error('[IndexedDBStore] Storage set error:', chrome.runtime.lastError)
        } else {
          console.log('[IndexedDBStore] Settings saved successfully')
        }
        resolve(updated)
      })
    })
  }
  
  /**
   * 兼容旧 API: setSettings 是 updateSettings 的别名
   */
  async setSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
    return this.updateSettings(partial)
  }
  
  // ==================== NeoDB 关联查询 ====================
  
  /**
   * 通过 NeoDB UUID 查询记录
   */
  async getRecordByNeoDBUuid(neodbUuid: string): Promise<MediaRecord | undefined> {
    return await mediaDB.getRecordByNeoDBUuid(neodbUuid)
  }
  
  /**
   * 查找关联记录
   */
  async findLinkedRecords(record: MediaRecord): Promise<MediaRecord[]> {
    return await mediaDB.findLinkedRecords(record)
  }
  
  // ==================== 导入导出 ====================
  
  /**
   * 导出所有数据为结构化格式
   */
  async exportAllData(): Promise<ExportData> {
    const settings = await this.getSettings()
    const quarantine = await this.getQuarantineEntries()
    
    // 导出所有数据集
    const datasets: ExportData['datasets'] = {}
    const domains: Domain[] = ['movie', 'tv', 'music']
    const providers: Record<Domain, Provider[]> = {
      movie: ['douban', 'imdb', 'neodb', 'tmdb'],
      tv: ['neodb', 'tmdb'],
      music: ['douban', 'neodb'],
    }
    
    for (const domain of domains) {
      datasets[domain] = {}
      for (const provider of providers[domain]) {
        const records = await this.getRecordsByProviderType(provider, domain)
        // 转换为旧格式（不含 id 和 linkedIds）
        datasets[domain]![provider] = records.map(r => ({
          type: r.type,
          provider: r.provider as Provider,
          providerId: r.providerId,
          url: r.url,
          status: r.status,
          rating: r.rating,  // 使用新字段名
          updatedAt: r.updatedAt,
        }))
      }
    }
    
    return {
      schema: 'umm-export',
      version: 2,
      exportedAt: new Date().toISOString(),
      datasets,
      quarantine: quarantine as any,  // 类型转换
      settings,
    }
  }
  
  /**
   * 兼容旧 API: exportStructuredData 是 exportAllData 的别名
   */
  async exportStructuredData(): Promise<ExportData> {
    return this.exportAllData()
  }
  
  /**
   * 导入结构化数据
   */
  async importAllData(payload: ExportData): Promise<void> {
    // 导入数据集
    for (const [domain, providers] of Object.entries(payload.datasets)) {
      for (const [provider, records] of Object.entries(providers)) {
        // 转换为标准格式
        const v2Records: MediaRecord[] = records.map((r: any) => ({
          provider,
          type: domain,  // domain 映射为 type
          providerId: r.providerId,
          id: `${provider}:${domain}:${r.providerId}`,  // 新复合主键格式
          url: r.url,
          status: r.status,
          rating: r.rating || r.rating10,
          updatedAt: r.updatedAt,
          source: 'manual' as const,
        }))
        
        await this.bulkUpsertRecords(v2Records)
      }
    }
    
    // 导入隔离区
    if (payload.quarantine && payload.quarantine.length > 0) {
      await this.addToQuarantine(payload.quarantine)
    }
    
    // 导入设置
    if (payload.settings) {
      await this.updateSettings(payload.settings)
    }
  }
  
  /**
   * 兼容旧 API: importStructuredData 是 importAllData 的别名
   */
  async importStructuredData(payload: ExportData): Promise<void> {
    return this.importAllData(payload)
  }
  
  // ==================== 统计信息 ====================
  
  /**
   * 获取统计数据
   */
  async getStatistics(): Promise<{
    total: number
    byType: Record<string, number>
    byStatus: Record<number, number>
  }> {
    const allRecords: MediaRecord[] = []
    const types: string[] = ['movie', 'tv', 'music', 'book']
    const providers: Record<string, Provider[]> = {
      movie: ['douban', 'imdb', 'neodb', 'tmdb'],
      tv: ['neodb', 'tmdb'],
      music: ['douban', 'neodb'],
      book: ['douban', 'neodb'],
    }
    
    for (const type of types) {
      for (const provider of providers[type]) {
        const records = await this.getRecordsByProviderType(provider, type)
        allRecords.push(...records)
      }
    }
    
    const byType: Record<string, number> = {}
    const byStatus: Record<number, number> = {}
    
    for (const record of allRecords) {
      byType[record.type] = (byType[record.type] || 0) + 1
      byStatus[record.status] = (byStatus[record.status] || 0) + 1
    }
    
    return {
      total: allRecords.length,
      byType,  // 改为 byType
      byStatus,
    }
  }
  
  /**
   * 通知数据变化（通过 chrome.storage 触发版本更新）
   */
  private _notifyDataChanged(): void {
    if (chrome.storage?.local) {
      // 更新时间戳，触发 onChanged 事件
      chrome.storage.local.set({
        umm_data_version: Date.now(),
      })
    }
  }
}

export const indexedDBStore = new IndexedDBStore()

// 默认导出,方便直接导入
export default indexedDBStore

// ==================== 调试工具 ====================

/**
 * 在浏览器控制台直接查询所有记录（调试用）
 * 使用方法: 在 Console 中运行 window.UMM_DEBUG.getAllRecords()
 */
if (typeof window !== 'undefined') {
  ;(window as any).UMM_DEBUG = {
    async getAllRecords() {
      const store = indexedDBStore
      const records = await store.getAllRecords()
      console.table(records)
      console.log(`Total: ${records.length} records`)
      return records
    },
    
    async getByProviderType(provider: string, type: string) {
      const store = indexedDBStore
      const records = await store.getRecordsByProviderType(provider as any, type)
      console.table(records)
      console.log(`Found: ${records.length} records for ${provider}/${type}`)
      return records
    },
    
    async getById(id: string) {
      const store = indexedDBStore
      const record = await store.getRecord(id)
      console.log('Record:', record)
      return record
    },
    
    clearDatabase() {
      if (confirm('确定要清空所有数据吗？此操作不可恢复！')) {
        const request = indexedDB.deleteDatabase('umm-media-db')
        request.onsuccess = () => {
          console.log('✅ 数据库已清空，请刷新页面')
          // ✅ 修复：使用 Background 消息发送 toast,替代 alert
          if (chrome.runtime?.id) {
            chrome.runtime.sendMessage({
              type: 'SHOW_TOAST',
              payload: { type: 'success', title: '数据库已清空', message: '请刷新页面' }
            }).catch(err => {
              console.warn('[IndexedDBStore] Failed to send toast message:', err)
            })
          } else {
            console.warn('[IndexedDBStore] Database cleared, please refresh')
          }
        }
        request.onerror = () => {
          console.error('❌ 清空失败')
        }
      }
    }
  }
  
  console.log('[UMM Debug] 调试工具已加载，可使用 window.UMM_DEBUG')
}

// ==================== ZIP 导出导入支持 ====================

import { objectToZipBlob, zipBlobToObject, validateZipStructure } from '../utils/zip-utils'

/**
 * 导出为 ZIP Blob（包含元数据）
 */
export async function exportAsZipBlob(): Promise<Blob> {
  const store = new IndexedDBStore()
  const data = await store.exportStructuredData()
  
  // 生成元数据
  const metadata = {
    format: 'v1.0',
    exportedAt: data.exportedAt,
    recordCount: Object.values(data.datasets).reduce((total, providers) => {
      return total + Object.values(providers).reduce((sum, records) => sum + records.length, 0)
    }, 0),
    version: '1.0.0' // 可以从 manifest.json 读取
  }
  
  return await objectToZipBlob(data, metadata)
}

/**
 * 从 ZIP Blob 导入（验证版本后）
 */
export async function importFromZipBlob(blob: Blob): Promise<{ success: boolean; message?: string }> {
  try {
    // 验证 ZIP 结构
    const isValid = await validateZipStructure(blob)
    if (!isValid) {
      return {
        success: false,
        message: 'ZIP 文件格式无效或已损坏'
      }
    }
    
    // 解压并提取数据
    const { data, metadata } = await zipBlobToObject(blob)
    
    // 验证版本兼容性
    const compatibility = await checkFormatCompatibility(metadata)
    if (!compatibility.compatible) {
      return {
        success: false,
        message: compatibility.message || '数据格式版本不兼容'
      }
    }
    
    // 如果需要迁移，执行迁移（预留接口）
    if (compatibility.needsMigration) {
      console.log(`[IndexedDBStore] Migrating from format ${metadata.format} to v1.0`)
      // TODO: 实现迁移逻辑
      // data = await migrateData(data, metadata.format)
    }
    
    // 导入数据
    const store = new IndexedDBStore()
    await store.importStructuredData(data)
    
    return {
      success: true,
      message: `成功导入 ${metadata.recordCount || '未知数量'} 条记录`
    }
  } catch (error) {
    console.error('[IndexedDBStore] Failed to import from ZIP:', error)
    return {
      success: false,
      message: `导入失败: ${String(error)}`
    }
  }
}

/**
 * 检查数据格式兼容性
 */
export async function checkFormatCompatibility(metadata: any): Promise<{
  compatible: boolean
  needsMigration: boolean
  message?: string
}> {
  // 支持的格式版本列表
  const SUPPORTED_FORMATS = ['v1.0']
  const CURRENT_FORMAT = 'v1.0'
  
  if (!metadata || !metadata.format) {
    return {
      compatible: false,
      needsMigration: false,
      message: '缺少格式版本信息'
    }
  }
  
  const cloudFormat = metadata.format
  
  // 检查是否为支持的格式
  if (!SUPPORTED_FORMATS.includes(cloudFormat)) {
    // 云端版本高于本地支持的最高版本
    return {
      compatible: false,
      needsMigration: false,
      message: `云端数据格式版本 ${cloudFormat} 高于本地支持的最高版本，请更新扩展`
    }
  }
  
  // 检查是否需要迁移（云端版本低于当前版本）
  if (cloudFormat !== CURRENT_FORMAT) {
    return {
      compatible: true,
      needsMigration: true,
      message: `数据格式版本 ${cloudFormat} 需要迁移到 ${CURRENT_FORMAT}`
    }
  }
  
  // 版本完全匹配
  return {
    compatible: true,
    needsMigration: false
  }
}
