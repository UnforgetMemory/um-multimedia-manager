/**
 * IndexedDB 数据库管理
 * 
 * 设计理念：
 * 1. 从油猴脚本的 localStorage 数组结构迁移到 IndexedDB 的对象存储
 * 2. 支持多字段索引和复合查询（按 domain/provider/status 等）
 * 3. 保留 linkedIds 用于跨平台关联查询
 * 4. TTL 缓存自动清理机制
 * 
 * 存储结构：
 * - records: 媒体记录主表（核心数据，支持多维度索引）
 * - ttl-cache: TTL 过期缓存（API 响应、临时状态等）
 * - quarantine: 隔离区记录（TV 域特殊校验失败记录）
 * - migration-log: 迁移日志（追踪数据来源和迁移历史）
 */

export const DB_NAME = 'umm-media-db'
export const DB_VERSION = 5  // ✅ 从 4 升级到 5,添加同步日志表

/**
 * IndexedDB 记录结构
 * 
 * 与油猴脚本对比的优势：
 * 1. id 作为主键：使用 `${provider}:${type}:${providerId}` 复合键，避免重复
 * 2. 多字段索引：支持快速按 provider/type/status 查询
 * 3. linkedIds 索引：支持跨平台关联查询（如通过 doubanId 查找对应的 imdb 记录）
 * 4. source 字段：追踪数据来源（legacy/manual/sync/api），便于审计
 * 5. title 字段：预留用于全文搜索（未来可扩展）
 */
export interface MediaRecord {
  // 联合主键字段
  provider: string        // douban/imdb/neodb/tmdb
  type: string           // movie/tv/music/book
  providerId: string     // 平台唯一 ID（如豆瓣 subject ID）
  
  // 复合主键（由上述三字段自动生成）
  id?: string            // `${provider}:${type}:${providerId}`
  
  // 业务数据
  url: string             // 规范化 URL（无 hash/search，以 / 结尾）
  status: number         // 0=未看/听, 1=在看/听, 2=已看/已听
  rating: number         // 评分 0-10（整数或小数）
  title?: string          // 标题（预留，用于搜索和展示）
  linkedIds?: {           // 关联 ID（跨平台映射，支持反向查询）
    doubanId?: string
    imdbId?: string
    tmdbId?: string
    neodbId?: string      // ✅ 新增：NeoDB 作品 UUID
  }
  source?: 'legacy' | 'manual' | 'sync' | 'api'  // 数据来源标记
  updatedAt?: string      // ISO 8601 更新时间（自动维护）
  
  // ✅ 新增：NeoDB 关联字段
  neodbUuid?: string      // NeoDB 作品的 UUID（catalog item uuid）
  neodbShelfUuid?: string // NeoDB 书架项的 UUID（shelf item uuid）
}

/**
 * 隔离区记录结构
 */
export interface QuarantineEntry {
  provider: string        // douban/imdb/neodb/tmdb
  type: string           // movie/tv/music/book
  providerId: string     // 主键（与 records 一致）
  url: string
  status: number         // 0=未看/听, 1=在看/听, 2=已看/已听
  rating: number         // 评分 0-10
  updatedAt?: string     // ISO 8601 更新时间
  quarantineReason: string
}

/**
 * 同步日志记录
 */
export interface SyncLog {
  id: string              // 自动生成: sync-${timestamp}
  type: 'upload' | 'download' | 'merge'
  direction: 'local-to-cloud' | 'cloud-to-local' | 'bidirectional'
  timestamp: string       // ISO 8601
  success: boolean
  message?: string
  stats?: {
    totalRecords: number
    uploadedCount?: number
    downloadedCount?: number
    conflictCount?: number
    mergedCount?: number
  }
  error?: string          // 如果失败,记录错误信息
}

export async function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      const oldVersion = event.oldVersion
      
      console.log('[Database] Upgrading from version', oldVersion, 'to', DB_VERSION)
      
      // ==================== 主表：records ====================
      if (!db.objectStoreNames.contains('records')) {
        // 首次创建：使用复合主键: [provider, type, providerId]
        const store = db.createObjectStore('records', { keyPath: ['provider', 'type', 'providerId'] })
        
        // 单字段索引
        store.createIndex('provider', 'provider', { unique: false })
        store.createIndex('type', 'type', { unique: false })
        store.createIndex('status', 'status', { unique: false })
        store.createIndex('updatedAt', 'updatedAt', { unique: false })
        
        // 复合索引（常用查询组合）
        store.createIndex('provider_type', ['provider', 'type'], { unique: false })
        store.createIndex('provider_status', ['provider', 'status'], { unique: false })
        store.createIndex('type_status', ['type', 'status'], { unique: false })
        
        // 关联 ID 索引（用于跨平台查询）
        store.createIndex('linked_douban', 'linkedIds.doubanId', { unique: false })
        store.createIndex('linked_imdb', 'linkedIds.imdbId', { unique: false })
        store.createIndex('linked_tmdb', 'linkedIds.tmdbId', { unique: false })
        store.createIndex('linked_neodb', 'linkedIds.neodbId', { unique: false })  // ✅ 新增
        
        // ✅ 新增：NeoDB UUID 索引
        store.createIndex('neodb_uuid', 'neodbUuid', { unique: false })
        store.createIndex('neodb_shelf_uuid', 'neodbShelfUuid', { unique: false })
        
        console.log('[Database] Created records store with all indexes')
      } else {
        // 增量升级：删除旧索引，创建新索引
        const store = request.transaction!.objectStore('records')
        
        // 删除所有旧索引
        const oldIndexes = Array.from(store.indexNames)
        for (const indexName of oldIndexes) {
          store.deleteIndex(indexName)
          console.log('[Database] Deleted old index:', indexName)
        }
        
        // 重新创建所有索引
        store.createIndex('provider', 'provider', { unique: false })
        store.createIndex('type', 'type', { unique: false })
        store.createIndex('status', 'status', { unique: false })
        store.createIndex('updatedAt', 'updatedAt', { unique: false })
        store.createIndex('provider_type', ['provider', 'type'], { unique: false })
        store.createIndex('provider_status', ['provider', 'status'], { unique: false })
        store.createIndex('type_status', ['type', 'status'], { unique: false })
        store.createIndex('linked_douban', 'linkedIds.doubanId', { unique: false })
        store.createIndex('linked_imdb', 'linkedIds.imdbId', { unique: false })
        store.createIndex('linked_tmdb', 'linkedIds.tmdbId', { unique: false })
        store.createIndex('linked_neodb', 'linkedIds.neodbId', { unique: false })  // ✅ 新增
        
        // ✅ 新增：NeoDB UUID 索引
        store.createIndex('neodb_uuid', 'neodbUuid', { unique: false })
        store.createIndex('neodb_shelf_uuid', 'neodbShelfUuid', { unique: false })
        
        console.log('[Database] Rebuilt all indexes for records store')
      }
      
      // ==================== TTL 缓存表 ====================
      if (!db.objectStoreNames.contains('ttl-cache')) {
        const store = db.createObjectStore('ttl-cache', { keyPath: 'key' })
        store.createIndex('expiresAt', 'expiresAt', { unique: false })
      }
      
      // ==================== 隔离区表 ====================
      if (!db.objectStoreNames.contains('quarantine')) {
        const store = db.createObjectStore('quarantine', { keyPath: ['provider', 'type', 'providerId'] })
        // 按隔离原因索引，支持筛选
        store.createIndex('quarantineReason', 'quarantineReason', { unique: false })
        store.createIndex('provider', 'provider', { unique: false })
        store.createIndex('type', 'type', { unique: false })
        store.createIndex('updatedAt', 'updatedAt', { unique: false })
      }
      
      // ==================== 迁移日志表 ====================
      if (!db.objectStoreNames.contains('migration-log')) {
        const store = db.createObjectStore('migration-log', { keyPath: 'id' })
        store.createIndex('timestamp', 'timestamp', { unique: false })
        store.createIndex('source', 'source', { unique: false })
      }
      
      // ==================== 同步日志表 ====================
      if (!db.objectStoreNames.contains('sync-log')) {
        const store = db.createObjectStore('sync-log', { keyPath: 'id' })
        store.createIndex('timestamp', 'timestamp', { unique: false })
        store.createIndex('type', 'type', { unique: false })
        store.createIndex('success', 'success', { unique: false })
      }
      
      console.log('[Database] Schema initialized')
    }
    
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export class MediaDatabase {
  private db: IDBDatabase | null = null
  private initializing: Promise<void> | null = null  // ✅ 新增：初始化锁
  
  // ✅ 优化：添加内存缓存，减少 IndexedDB 查询
  private recordsCache: MediaRecord[] | null = null
  private cacheTimestamp: number = 0
  
  /**
   * 生成复合主键
   */
  static generateId(provider: string, type: string, providerId: string): string {
    return `${provider}:${type}:${providerId}`
  }
  
  /**
   * 解析复合主键
   */
  static parseId(id: string): { provider: string; type: string; providerId: string } | null {
    const parts = id.split(':')
    if (parts.length !== 3) return null
    return {
      provider: parts[0],
      type: parts[1],
      providerId: parts[2]
    }
  }
  
  /**
   * 根据 provider + type + providerId 生成标准 URL
   */
  static generateUrl(provider: string, type: string, providerId: string): string {
    if (provider === 'douban') {
      // 豆瓣图书归类为 movie 域，但 URL 使用 book 子域名
      const subdomain = type === 'music' ? 'music' : type === 'book' ? 'book' : 'movie'
      return `https://${subdomain}.douban.com/subject/${providerId}/`
    } else if (provider === 'imdb') {
      return `https://www.imdb.com/title/${providerId}/`
    } else if (provider === 'neodb') {
      const path = type === 'tv' ? 'tv' : type === 'music' ? 'album' : 'movie'
      return `https://neodb.social/${path}/${providerId}/`
    } else if (provider === 'tmdb') {
      const path = type === 'tv' ? 'tv' : 'movie'
      return `https://www.themoviedb.org/${path}/${providerId}/`
    }
    return ''
  }
  
  async init(): Promise<void> {
    // ✅ 修复：如果正在初始化，等待现有初始化完成
    if (this.initializing) {
      return this.initializing
    }
    
    // 检查数据库连接是否有效
    if (this.db && this.db.version > 0) {
      try {
        const tx = this.db.transaction('records', 'readonly')
        tx.objectStore('records').count()
        return  // 连接有效，直接返回
      } catch (error) {
        console.warn('[MediaDB] Database connection invalid, reopening...', error)
        this.db = null  // 重置连接
      }
    }
    
    // 创建新的初始化 Promise
    this.initializing = (async () => {
      try {
        console.log('[MediaDB] Opening database connection...')
        this.db = await openDatabase()
        console.log('[MediaDB] Database connection established, version:', this.db!.version)
      } catch (error) {
        console.error('[MediaDB] Failed to initialize database:', error)
        throw error  // Re-throw to allow caller to handle
      }
    })()
    
    try {
      await this.initializing
    } finally {
      this.initializing = null  // 清除锁
    }
  }
  
  // ==================== Records 操作 ====================
  
  /**
   * 保存或更新单条记录
   */
  async saveRecord(record: MediaRecord): Promise<{ success: boolean; hasChange: boolean }> {
    console.log('[MediaDB] saveRecord called:', { provider: record.provider, type: record.type, providerId: record.providerId })
    
    await this.init()
    
    // 自动生成复合主键
    if (!record.id) {
      record.id = MediaDatabase.generateId(record.provider, record.type, record.providerId)
      console.log('[MediaDB] Generated ID:', record.id)
    }
    
    // ✅ 修复：先查询现有记录，判断是否有实质性变化
    const existingRecord = await this.getRecord(record.id)
    const isNewRecord = !existingRecord
    const isStatusChanged = existingRecord ? existingRecord.status !== record.status : false
    const isRatingChanged = existingRecord ? Math.abs(existingRecord.rating - record.rating) > 0.01 : false
    const hasChange = isNewRecord || isStatusChanged || isRatingChanged
    
    console.log('[MediaDB] Change detection:', { isNewRecord, isStatusChanged, isRatingChanged, hasChange })
    
    // 自动维护更新时间
    record.updatedAt = new Date().toISOString()
    
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction('records', 'readwrite')
      const store = tx.objectStore('records')
      console.log('[MediaDB] Putting record to IndexedDB...')
      store.put(record)
      
      tx.oncomplete = () => {
        console.log('[MediaDB] Transaction completed successfully')
        // ✅ 优化：清除缓存
        this.recordsCache = null
        this.cacheTimestamp = 0
        resolve({ success: true, hasChange })
      }
      tx.onerror = () => {
        console.error('[MediaDB] Transaction failed:', tx.error)
        reject(tx.error)
      }
    })
  }
  
  /**
   * 批量保存记录（事务）
   */
  async saveRecords(records: MediaRecord[]): Promise<void> {
    await this.init()
    
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction('records', 'readwrite')
      const store = tx.objectStore('records')
      
      for (const record of records) {
        store.put(record)
      }
      
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }
  
  /**
   * 按复合主键查询单条记录
   * @param idOrKey - 可以是完整 ID 字符串，或者 [provider, type, providerId] 数组
   */
  async getRecord(idOrKey: string | [string, string, string]): Promise<MediaRecord | undefined> {
    await this.init()
    
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction('records', 'readonly')
      const store = tx.objectStore('records')
      
      // 支持两种查询方式：字符串 ID 或数组键
      const key = Array.isArray(idOrKey) ? idOrKey : idOrKey.split(':')
      const request = store.get(key)
      
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }
  
  /**
   * 按 provider + type + providerId 查询记录（便捷方法）
   */
  async getRecordByKey(provider: string, type: string, providerId: string): Promise<MediaRecord | undefined> {
    return this.getRecord([provider, type, providerId])
  }
  
  /**
   * 按 provider + type 查询所有记录
   */
  async getRecordsByProviderType(
    provider: string,
    type: string
  ): Promise<MediaRecord[]> {
    await this.init()
    
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction('records', 'readonly')
      const store = tx.objectStore('records')
      const index = store.index('provider_type')
      const request = index.getAll([provider, type])
      
      request.onsuccess = () => resolve(request.result || [])
      request.onerror = () => reject(request.error)
    })
  }
  
  /**
   * 按 provider 查询所有记录（跨类型）
   */
  async getRecordsByProvider(provider: string): Promise<MediaRecord[]> {
    await this.init()
    
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction('records', 'readonly')
      const store = tx.objectStore('records')
      const index = store.index('provider')
      const request = index.getAll(provider)
      
      request.onsuccess = () => resolve(request.result || [])
      request.onerror = () => reject(request.error)
    })
  }
  
  /**
   * 按状态查询记录
   */
  async getRecordsByStatus(status: number): Promise<MediaRecord[]> {
    await this.init()
    
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction('records', 'readonly')
      const store = tx.objectStore('records')
      const index = store.index('status')
      const request = index.getAll(status)
      
      request.onsuccess = () => resolve(request.result || [])
      request.onerror = () => reject(request.error)
    })
  }
  
  /**
   * 通过关联 ID 查询（跨平台映射）
   */
  async getRecordByLinkedDoubanId(doubanId: string): Promise<MediaRecord | undefined> {
    await this.init()
    
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction('records', 'readonly')
      const store = tx.objectStore('records')
      const index = store.index('linked_douban')
      const request = index.get(doubanId)
      
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }
  
  /**
   * 删除记录
   */
  async deleteRecord(id: string): Promise<void> {
    await this.init()
    
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction('records', 'readwrite')
      const store = tx.objectStore('records')
      store.delete(id)
      
      tx.oncomplete = () => {
        // ✅ 优化：清除缓存
        this.recordsCache = null
        this.cacheTimestamp = 0
        resolve()
      }
      tx.onerror = () => reject(tx.error)
    })
  }
  
  /**
   * 获取记录总数
   */
  async countRecords(): Promise<number> {
    await this.init()
    
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction('records', 'readonly')
      const store = tx.objectStore('records')
      const request = store.count()
      
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }
  
  /**
   * 获取所有记录（用于评分功能）
   */
  async getAllRecords(): Promise<MediaRecord[]> {
    // ✅ 修复：延长缓存时间至 60 秒(Popup 打开期间不需要频繁刷新)
    const now = Date.now()
    if (this.recordsCache && (now - this.cacheTimestamp) < 60000) {
      console.log('[MediaDB] Using cached records (age:', Math.round((now - this.cacheTimestamp) / 1000), 's)')
      return this.recordsCache
    }
    
    await this.init()
    
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction('records', 'readonly')
      const store = tx.objectStore('records')
      const request = store.getAll()
      
      request.onsuccess = () => {
        // ✅ 优化：更新缓存
        this.recordsCache = request.result || []
        this.cacheTimestamp = Date.now()
        console.log('[MediaDB] Cached', this.recordsCache.length, 'records')
        resolve(this.recordsCache)
      }
      request.onerror = () => reject(request.error)
    })
  }
  
  // ==================== TTL Cache 操作 ====================
  
  async setTTLCache(key: string, value: any, ttlMs: number): Promise<void> {
    await this.init()
    
    const expiresAt = Date.now() + ttlMs
    
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction('ttl-cache', 'readwrite')
      const store = tx.objectStore('ttl-cache')
      store.put({ key, value, expiresAt })
      
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }
  
  async getTTLCache(key: string): Promise<any | undefined> {
    await this.init()
    
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction('ttl-cache', 'readonly')
      const store = tx.objectStore('ttl-cache')
      const request = store.get(key)
      
      request.onsuccess = () => {
        const item = request.result
        if (item && item.expiresAt > Date.now()) {
          resolve(item.value)
        } else {
          // 已过期，删除
          if (item) {
            this.deleteTTLCache(key)
          }
          resolve(undefined)
        }
      }
      request.onerror = () => reject(request.error)
    })
  }
  
  async deleteTTLCache(key: string): Promise<void> {
    await this.init()
    
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction('ttl-cache', 'readwrite')
      const store = tx.objectStore('ttl-cache')
      store.delete(key)
      
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }
  
  // ==================== 清理过期数据 ====================
  
  async cleanupExpiredTTL(): Promise<number> {
    await this.init()
    
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction('ttl-cache', 'readwrite')
      const store = tx.objectStore('ttl-cache')
      const index = store.index('expiresAt')
      const now = Date.now()
      
      let deletedCount = 0
      
      const request = index.openCursor(IDBKeyRange.upperBound(now))
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result
        if (cursor) {
          cursor.delete()
          deletedCount++
          cursor.continue()
        } else {
          resolve(deletedCount)
        }
      }
      request.onerror = () => reject(request.error)
    })
  }
  
  // ==================== Quarantine 操作 ====================
  
  /**
   * 保存隔离区记录
   */
  async saveQuarantineEntry(entry: QuarantineEntry): Promise<void> {
    await this.init()
    
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction('quarantine', 'readwrite')
      const store = tx.objectStore('quarantine')
      store.put(entry)
      
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }
  
  /**
   * 批量保存隔离区记录
   */
  async saveQuarantineEntries(entries: QuarantineEntry[]): Promise<void> {
    await this.init()
    
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction('quarantine', 'readwrite')
      const store = tx.objectStore('quarantine')
      
      for (const entry of entries) {
        store.put(entry)
      }
      
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }
  
  /**
   * 获取所有隔离区记录
   */
  async getQuarantineEntries(): Promise<QuarantineEntry[]> {
    await this.init()
    
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction('quarantine', 'readonly')
      const store = tx.objectStore('quarantine')
      const request = store.getAll()
      
      request.onsuccess = () => resolve(request.result || [])
      request.onerror = () => reject(request.error)
    })
  }
  
  /**
   * 按原因查询隔离区记录
   */
  async getQuarantineByReason(reason: string): Promise<QuarantineEntry[]> {
    await this.init()
    
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction('quarantine', 'readonly')
      const store = tx.objectStore('quarantine')
      const index = store.index('quarantineReason')
      const request = index.getAll(reason)
      
      request.onsuccess = () => resolve(request.result || [])
      request.onerror = () => reject(request.error)
    })
  }
  
  /**
   * 删除隔离区记录
   */
  async deleteQuarantineEntry(providerId: string): Promise<void> {
    await this.init()
    
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction('quarantine', 'readwrite')
      const store = tx.objectStore('quarantine')
      store.delete(providerId)
      
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }
  
  /**
   * 清空隔离区
   */
  async clearQuarantine(): Promise<void> {
    await this.init()
    
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction('quarantine', 'readwrite')
      const store = tx.objectStore('quarantine')
      store.clear()
      
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }
  
  /**
   * 获取隔离区记录数量
   */
  async countQuarantineEntries(): Promise<number> {
    await this.init()
    
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction('quarantine', 'readonly')
      const store = tx.objectStore('quarantine')
      const request = store.count()
      
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }
  
  // ==================== NeoDB 关联查询 ====================
  
  /**
   * 通过 NeoDB 作品 UUID 查询记录
   */
  async getRecordByNeoDBUuid(neodbUuid: string): Promise<MediaRecord | undefined> {
    await this.init()
    
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction('records', 'readonly')
      const store = tx.objectStore('records')
      const index = store.index('neodb_uuid')
      const request = index.get(neodbUuid)
      
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }
  
  /**
   * 通过 NeoDB 书架项 UUID 查询记录
   */
  async getRecordByNeoDBShelfUuid(shelfUuid: string): Promise<MediaRecord | undefined> {
    await this.init()
    
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction('records', 'readonly')
      const store = tx.objectStore('records')
      const index = store.index('neodb_shelf_uuid')
      const request = index.get(shelfUuid)
      
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }
  
  /**
   * 查找与指定记录关联的所有其他平台记录
   * @param record - 源记录
   * @returns 关联记录列表（排除源记录本身）
   */
  async findLinkedRecords(record: MediaRecord): Promise<MediaRecord[]> {
    await this.init()
    
    if (!record.linkedIds) {
      return []
    }
    
    const linkedRecords: MediaRecord[] = []
    
    // 通过 doubanId 查找
    if (record.linkedIds.doubanId) {
      const doubanRecord = await this.getRecordByLinkedDoubanId(record.linkedIds.doubanId)
      if (doubanRecord && doubanRecord.id !== record.id) {
        linkedRecords.push(doubanRecord)
      }
    }
    
    // 通过 imdbId 查找
    if (record.linkedIds.imdbId) {
      const tx = this.db!.transaction('records', 'readonly')
      const store = tx.objectStore('records')
      const index = store.index('linked_imdb')
      const imdbId = record.linkedIds.imdbId
      
      const imdbRecord = await new Promise<MediaRecord | undefined>((resolve, reject) => {
        const request = index.get(imdbId)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      
      if (imdbRecord && imdbRecord.id !== record.id) {
        linkedRecords.push(imdbRecord)
      }
    }
    
    // 通过 tmdbId 查找
    if (record.linkedIds.tmdbId) {
      const tx = this.db!.transaction('records', 'readonly')
      const store = tx.objectStore('records')
      const index = store.index('linked_tmdb')
      const tmdbId = record.linkedIds.tmdbId
      
      const tmdbRecord = await new Promise<MediaRecord | undefined>((resolve, reject) => {
        const request = index.get(tmdbId)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      
      if (tmdbRecord && tmdbRecord.id !== record.id) {
        linkedRecords.push(tmdbRecord)
      }
    }
    
    // 通过 neodbId 查找
    if (record.linkedIds.neodbId) {
      const neodbRecord = await this.getRecordByNeoDBUuid(record.linkedIds.neodbId)
      if (neodbRecord && neodbRecord.id !== record.id) {
        linkedRecords.push(neodbRecord)
      }
    }
    
    return linkedRecords
  }
  
  // ==================== 同步日志操作 ====================
  
  /**
   * 记录同步日志
   */
  async saveSyncLog(log: Omit<SyncLog, 'id'>): Promise<void> {
    await this.init()
    
    const syncLog: SyncLog = {
      ...log,
      id: `sync-${Date.now()}`
    }
    
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction('sync-log', 'readwrite')
      const store = tx.objectStore('sync-log')
      store.put(syncLog)
      
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }
  
  /**
   * 获取最近的同步日志
   */
  async getRecentSyncLogs(limit: number = 10): Promise<SyncLog[]> {
    await this.init()
    
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction('sync-log', 'readonly')
      const store = tx.objectStore('sync-log')
      const index = store.index('timestamp')
      const request = index.openCursor(null, 'prev') // 倒序
      
      const logs: SyncLog[] = []
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result
        if (cursor && logs.length < limit) {
          logs.push(cursor.value)
          cursor.continue()
        } else {
          resolve(logs)
        }
      }
      request.onerror = () => reject(request.error)
    })
  }
  
  /**
   * 清理旧日志(保留最近 N 天)
   */
  async cleanupOldLogs(retentionDays: number = 30): Promise<number> {
    await this.init()
    
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays)
    const cutoffTimestamp = cutoffDate.toISOString()
    
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction('sync-log', 'readwrite')
      const store = tx.objectStore('sync-log')
      const index = store.index('timestamp')
      const request = index.openCursor(IDBKeyRange.upperBound(cutoffTimestamp))
      
      let deletedCount = 0
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result
        if (cursor) {
          cursor.delete()
          deletedCount++
          cursor.continue()
        } else {
          resolve(deletedCount)
        }
      }
      request.onerror = () => reject(request.error)
    })
  }
}

// 单例实例
export const mediaDB = new MediaDatabase()
