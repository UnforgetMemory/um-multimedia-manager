/**
 * Legacy 数据迁移器
 * 
 * 功能：
 * 1. 从油猴脚本的 localStorage 格式迁移到 IndexedDB V2 格式
 * 2. 支持多版本 legacy keys（umm:v1:*, um-mmw-*, um-ml-*）
 * 3. 自动识别 domain/provider（从 key 名或记录字段推断）
 * 4. 保留迁移日志，便于追踪数据来源
 * 
 * 油猴脚本数据结构特点：
 * - 按 domain + provider 分表存储（如 umm:v2:movie:douban）
 * - 每个表是一个对象数组，每条记录包含：type, provider, providerId, url, status, rating, updatedAt
 * - 可能缺少某些字段（如 domain/provider），需要从 key 名推断
 * - 旧版本使用 um-mmw-* / um-ml-* 等前缀
 */

import { mediaDB, type MediaRecord } from './database'

/**
 * Legacy 记录接口（兼容油猴脚本的各种变体）
 */
interface LegacyRecord {
  // 标准字段
  domain?: string
  provider?: string
  providerId?: string
  url?: string
  status?: string
  rating10?: number
  rating?: number  // 旧版本可能用 rating 而非 rating10
  updatedAt?: string
  lastUpdated?: string  // 另一种时间戳字段名
  
  // 关联 ID（可能分散在不同字段）
  douban_id?: string
  imdb_id?: string
  tmdb_id?: string
  linkedIds?: {
    doubanId?: string
    imdbId?: string
    tmdbId?: string
  }
}

/**
 * Legacy Key 映射配置
 * 
 * 优先级从高到低：
 * 1. umm:v2:* (最新油猴脚本格式)
 * 2. umm:v1:* (上一代格式)
 * 3. um-mmw-* / um-ml-* (最早期格式，按影视/音乐分类)
 */
export class LegacyMigrator {
  private static LEGACY_KEYS = {
    // 最新格式（油猴脚本 v2）
    v2: {
      movie: {
        douban: ['umm:v2:movie:douban'],
        imdb: ['umm:v2:movie:imdb'],
        neodb: ['umm:v2:movie:neodb'],
        tmdb: ['umm:v2:movie:tmdb'],
      },
      tv: {
        neodb: ['umm:v2:tv:neodb'],
        tmdb: ['umm:v2:tv:tmdb'],
      },
      music: {
        douban: ['umm:v2:music:douban'],
        neodb: ['umm:v2:music:neodb'],
      },
    },
    // 上一代格式（油猴脚本 v1）
    v1: {
      movie: {
        douban: ['umm:v1:movie:douban'],
        imdb: ['umm:v1:movie:imdb'],
        neodb: ['umm:v1:movie:neodb'],
        tmdb: ['umm:v1:movie:tmdb'],
      },
      tv: {
        neodb: ['umm:v1:tv:neodb'],
        tmdb: ['umm:v1:tv:tmdb'],
      },
      music: {
        douban: ['umm:v1:music:douban'],
        neodb: ['umm:v1:music:neodb'],
      },
    },
    // 早期格式（按影视/音乐分类）
    legacy: {
      movie: {
        douban: ['um-mmw-douban'],
        imdb: ['um-mmw-imdb'],
        neodb: ['um-mmw-neodb'],
        tmdb: ['um-mmw-tmdb'],
      },
      music: {
        douban: ['um-ml-douban'],
        neodb: ['um-ml-neodb'],
      },
    },
  }
  
  /**
   * 执行完整迁移流程
   * 
   * @returns 迁移结果统计
   */
  async migrate(): Promise<{
    success: boolean
    migratedCount: number
    errorCount: number
    skippedCount: number
  }> {
    console.log('[Migration] Starting legacy data migration...')
    
    let migratedCount = 0
    let errorCount = 0
    let skippedCount = 0
    
    try {
      // 按优先级遍历所有 legacy keys（v2 -> v1 -> legacy）
      for (const [version, domains] of Object.entries(LegacyMigrator.LEGACY_KEYS)) {
        console.log(`[Migration] Processing version: ${version}`)
        
        for (const [domain, providers] of Object.entries(domains)) {
          for (const [provider, keys] of Object.entries(providers)) {
            for (const key of keys) {
              const result = await this.migrateKey(key, domain, provider, version)
              migratedCount += result.migrated
              errorCount += result.errors
              skippedCount += result.skipped
            }
          }
        }
      }
      
      console.log(`[Migration] Completed: ${migratedCount} records migrated, ${errorCount} errors, ${skippedCount} skipped`)
      
      return {
        success: errorCount === 0,
        migratedCount,
        errorCount,
        skippedCount,
      }
    } catch (error) {
      console.error('[Migration] Fatal error:', error)
      return {
        success: false,
        migratedCount,
        errorCount: errorCount + 1,
        skippedCount,
      }
    }
  }
  
  /**
   * 迁移单个 storage key
   */
  private async migrateKey(
    key: string,
    forcedDomain: string,
    forcedProvider: string,
    version: string
  ): Promise<{ migrated: number; errors: number; skipped: number }> {
    let migrated = 0
    let errors = 0
    let skipped = 0
    
    try {
      // 从 chrome.storage 读取 legacy 数据
      const legacyData = await this.readLegacyData(key)
      
      if (!legacyData || legacyData.length === 0) {
        console.log(`[Migration] No data found for key: ${key}`)
        return { migrated: 0, errors: 0, skipped: 0 }
      }
      
      console.log(`[Migration] Found ${legacyData.length} records in ${key} (version: ${version})`)
      
      // 转换并保存
      const records: MediaRecord[] = []
      
      for (const raw of legacyData) {
        try {
          const record = this.convertToV2(raw, forcedDomain, forcedProvider, version)
          if (record) {
            // 检查是否已存在（避免重复迁移）
            const existing = await mediaDB.getRecord(record.id!)
            if (existing && existing.updatedAt && record.updatedAt) {
              // 如果已存在且更新时间更晚，跳过
              if (new Date(existing.updatedAt) >= new Date(record.updatedAt)) {
                skipped++
                continue
              }
              // 否则覆盖（更新为最新版本）
            }
            
            records.push(record)
            migrated++
          } else {
            errors++
          }
        } catch (error) {
          console.error(`[Migration] Failed to convert record:`, error, raw)
          errors++
        }
      }
      
      // 批量保存到 IndexedDB（事务保证原子性）
      if (records.length > 0) {
        await mediaDB.saveRecords(records)
        console.log(`[Migration] Saved ${records.length} records from ${key}`)
      }
      
      // 记录迁移日志
      if (migrated > 0 || errors > 0) {
        await this.logMigration(key, migrated, errors, skipped, version)
      }
      
    } catch (error) {
      console.error(`[Migration] Failed to migrate key ${key}:`, error)
      errors++
    }
    
    return { migrated, errors, skipped }
  }
  
  /**
   * 读取 legacy 数据（兼容多种存储格式）
   */
  private async readLegacyData(key: string): Promise<LegacyRecord[]> {
    return new Promise((resolve) => {
      chrome.storage.local.get(key, (result) => {
        const data = result[key]
        
        if (!data) {
          resolve([])
          return
        }
        
        // 处理不同的存储格式：
        // 1. JSON 字符串 -> 解析为数组
        // 2. 对象数组 -> 直接使用
        // 3. 单个对象 -> 包装为数组
        // 4. Map-like 对象 -> 转换为数组
        if (typeof data === 'string') {
          try {
            const parsed = JSON.parse(data)
            resolve(Array.isArray(parsed) ? parsed : [parsed])
          } catch {
            resolve([])
          }
        } else if (Array.isArray(data)) {
          resolve(data)
        } else if (data && typeof data === 'object') {
          // 可能是 Map-like 对象 { "id": record, ... }
          resolve(Object.values(data))
        } else {
          resolve([])
        }
      })
    })
  }
  
  /**
   * 转换为 V2 格式（IndexedDB 结构）
   * 
   * 转换规则：
   * 1. 生成复合主键 id = `${domain}:${provider}:${providerId}`
   * 2. 标准化 URL（去除 hash/search，确保以 / 结尾）
   * 3. 规范化状态（done/wish/none）
   * 4. 评分范围限制（0-10）
   * 5. 提取关联 ID（优先从 linkedIds 对象，其次从独立字段）
   * 6. 标记数据来源（source = version）
   */
  private convertToV2(
    raw: LegacyRecord,
    domain: string,
    provider: string,
    version: string
  ): MediaRecord | null {
    // 验证必要字段
    if (!raw.providerId) {
      console.warn('[Migration] Missing providerId, skipping record:', raw)
      return null
    }
    
    // 优先使用记录中的 type/provider，否则使用强制值
    const finalType = raw.domain || domain
    const finalProvider = raw.provider || provider
    
    // 构建复合主键
    const id = `${finalProvider}:${finalType}:${raw.providerId}`
    
    // 标准化 URL
    const url = raw.url ? this.canonicalizeUrl(raw.url) : this.buildUrl(finalType, finalProvider, raw.providerId)
    
    if (!url) {
      console.warn('[Migration] Cannot build URL, skipping record:', raw)
      return null
    }
    
    // 提取关联 ID（支持两种格式）
    const linkedIds = raw.linkedIds || {
      doubanId: raw.douban_id,
      imdbId: raw.imdb_id,
      tmdbId: raw.tmdb_id,
    }
    
    // 清理空值
    const cleanLinkedIds: MediaRecord['linkedIds'] = {}
    if (linkedIds.doubanId) cleanLinkedIds.doubanId = linkedIds.doubanId
    if (linkedIds.imdbId) cleanLinkedIds.imdbId = linkedIds.imdbId
    if (linkedIds.tmdbId) cleanLinkedIds.tmdbId = linkedIds.tmdbId
    
    const now = new Date().toISOString()
    
    return {
      provider: finalProvider,
      type: finalType,
      providerId: raw.providerId,
      id,
      url,
      status: this.normalizeStatus(raw.status),
      rating: this.clampRating(raw.rating10 ?? raw.rating ?? 0),
      linkedIds: Object.keys(cleanLinkedIds).length > 0 ? cleanLinkedIds : undefined,
      updatedAt: raw.updatedAt || raw.lastUpdated || now,
      source: `legacy-${version}` as any,
    }
  }
  
  /**
   * 标准化 URL（与油猴脚本保持一致）
   */
  private canonicalizeUrl(rawUrl: string): string {
    try {
      const url = new URL(rawUrl)
      url.hash = ''
      url.search = ''
      url.pathname = url.pathname.replace(/\/{2,}/g, '/')
      if (!url.pathname.endsWith('/')) {
        url.pathname += '/'
      }
      return url.toString()
    } catch {
      return rawUrl
    }
  }
  
  /**
   * 规范化状态值
   */
  private normalizeStatus(status?: string): number {
    if (status === 'done') return 2
    if (status === 'wish') return 1
    return 0  // none
  }
  
  /**
   * 限制评分范围（0-10）
   */
  private clampRating(rating: number): number {
    if (typeof rating !== 'number' || !isFinite(rating)) {
      return 0
    }
    return Math.max(0, Math.min(10, rating))
  }
  
  /**
   * 根据 domain/provider/providerId 构建 URL
   */
  private buildUrl(domain: string, provider: string, providerId: string): string {
    const urls: Record<string, string> = {
      'movie:douban': `https://movie.douban.com/subject/${providerId}/`,
      'music:douban': `https://music.douban.com/subject/${providerId}/`,
      'movie:imdb': `https://www.imdb.com/title/${providerId}/`,
      'movie:neodb': `https://neodb.social/movie/${providerId}/`,
      'tv:neodb': `https://neodb.social/tv/show/${providerId}/`,
      'music:neodb': `https://neodb.social/album/${providerId}/`,
      'movie:tmdb': `https://www.themoviedb.org/movie/${providerId}/`,
      'tv:tmdb': `https://www.themoviedb.org/tv/${providerId}/`,
    }
    
    const key = `${domain}:${provider}`
    return urls[key] || ''
  }
  
  /**
   * 记录迁移日志（用于审计和调试）
   */
  private async logMigration(
    key: string,
    migrated: number,
    errors: number,
    skipped: number,
    version: string
  ): Promise<void> {
    await mediaDB.init()
    
    return new Promise((resolve, reject) => {
      const tx = mediaDB['db']!.transaction('migration-log', 'readwrite')
      const store = tx.objectStore('migration-log')
      
      store.put({
        id: `${key}:${Date.now()}`,
        key,
        timestamp: new Date().toISOString(),
        migrated,
        errors,
        skipped,
        version,
        source: `legacy-${version}`,
      })
      
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }
}

export const migrator = new LegacyMigrator()
