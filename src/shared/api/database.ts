/**
 * 统一的数据库 API 封装层
 * 
 * 所有数据库操作都通过 Background Service Worker 进行,确保 Content Script 和 Popup
 * 共享同一个 IndexedDB 数据源。
 */

import { MediaRecord, AppSettings, ExportData } from '../types'
import { CACHE_CONFIG } from '../config'

// ✅ 优化：添加请求缓存，避免短时间内重复请求
interface CacheEntry<T> {
  data: T
  timestamp: number
}

const requestCache = new Map<string, CacheEntry<any>>()
const CACHE_TTL = CACHE_CONFIG.API_REQUEST_TTL // 5秒缓存有效期

/**
 * ✅ 优化：带缓存的消息发送函数
 */
function sendMessageWithCache<T>(
  message: any,
  cacheKey?: string,
  forceRefresh = false
): Promise<T> {
  return new Promise((resolve, reject) => {
    // 检查缓存
    if (cacheKey && !forceRefresh) {
      const cached = requestCache.get(cacheKey)
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        console.log(`[Database API] Using cached response for: ${cacheKey}`)
        resolve(cached.data)
        return
      }
    }
    
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[Database API] sendMessage failed:', chrome.runtime.lastError)
        reject(chrome.runtime.lastError)
      } else {
        // 更新缓存
        if (cacheKey) {
          requestCache.set(cacheKey, {
            data: response,
            timestamp: Date.now()
          })
        }
        resolve(response)
      }
    })
  })
}

/**
 * ✅ 优化：清除所有缓存
 */
export function clearAllCache(): void {
  requestCache.clear()
}

/**
 * 通过 Background 获取单条记录
 */
export async function getRecord(id: string): Promise<MediaRecord | null> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'GET_RECORD', payload: { id } },
      (response) => resolve(response?.record || null)
    )
  })
}

/**
 * 通过 Background 保存或更新记录
 */
export async function upsertRecord(record: MediaRecord): Promise<boolean> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'SAVE_RECORD', payload: record },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error('[Database API] sendMessage failed:', chrome.runtime.lastError)
          reject(chrome.runtime.lastError)
        } else {
          // ✅ 修复：保存成功后清除缓存，确保下次获取最新数据
          clearAllCache()
          resolve(response?.success || false)
        }
      }
    )
  })
}

/**
 * 通过 Background 获取指定 Provider 和 Type 的记录列表
 */
export async function getRecordsByProviderType(
  provider: string,
  type: string
): Promise<MediaRecord[]> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'GET_RECORDS_BY_PROVIDER_TYPE', payload: { provider, type } },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error('[Database API] sendMessage failed:', chrome.runtime.lastError)
          reject(chrome.runtime.lastError)
        } else {
          resolve(response?.records || [])
        }
      }
    )
  })
}

/**
 * 通过 Background 删除记录
 */
export async function deleteRecord(id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'DELETE_RECORD', payload: { id } },
      () => {
        if (chrome.runtime.lastError) {
          console.error('[Database API] sendMessage failed:', chrome.runtime.lastError)
          reject(chrome.runtime.lastError)
        } else {
          resolve()
        }
      }
    )
  })
}

/**
 * 通过 Background 获取所有记录
 */
export async function getAllRecords(): Promise<MediaRecord[]> {
  const response = await sendMessageWithCache(
    { type: 'GET_ALL_RECORDS' },
    'getAllRecords'
  ) as any
  return response?.records || []
}

/**
 * 通过 Background 批量保存记录
 */
export async function bulkUpsertRecords(records: MediaRecord[]): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'BULK_UPSERT_RECORDS', payload: { records } },
      () => {
        if (chrome.runtime.lastError) {
          console.error('[Database API] sendMessage failed:', chrome.runtime.lastError)
          reject(chrome.runtime.lastError)
        } else {
          resolve()
        }
      }
    )
  })
}

/**
 * 通过 Background 获取设置
 */
export async function getSettings(): Promise<AppSettings> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'GET_SETTINGS' },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error('[Database API] sendMessage failed:', chrome.runtime.lastError)
          reject(chrome.runtime.lastError)
        } else {
          resolve(response?.settings || {})
        }
      }
    )
  })
}

/**
 * 通过 Background 更新设置
 */
export async function updateSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
  const response = await sendMessageWithCache(
    { type: 'UPDATE_SETTINGS', payload: partial },
    undefined,
    true // ✅ 优化：强制刷新，不使用缓存
  ) as any
  
  // ✅ 优化：清除所有缓存，因为数据可能已变化
  clearAllCache()
  
  return response?.settings || {}
}

/**
 * 通过 Background 导出结构化数据
 */
export async function exportStructuredData(): Promise<ExportData> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'EXPORT_STRUCTURED_DATA' },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error('[Database API] sendMessage failed:', chrome.runtime.lastError)
          reject(chrome.runtime.lastError)
        } else {
          resolve(response?.data || {})
        }
      }
    )
  })
}

/**
 * 通过 Background 导入结构化数据
 */
export async function importStructuredData(data: ExportData): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'IMPORT_STRUCTURED_DATA', payload: data },
      () => {
        if (chrome.runtime.lastError) {
          console.error('[Database API] sendMessage failed:', chrome.runtime.lastError)
          reject(chrome.runtime.lastError)
        } else {
          resolve()
        }
      }
    )
  })
}

/**
 * 通过 Background 清空隔离区
 */
export async function clearQuarantine(): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'CLEAR_QUARANTINE' },
      () => {
        if (chrome.runtime.lastError) {
          console.error('[Database API] sendMessage failed:', chrome.runtime.lastError)
          reject(chrome.runtime.lastError)
        } else {
          resolve()
        }
      }
    )
  })
}

/**
 * 通过 Background 获取统计数据
 */
export async function getStatistics(): Promise<any> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'GET_STATISTICS' },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error('[Database API] sendMessage failed:', chrome.runtime.lastError)
          reject(chrome.runtime.lastError)
        } else {
          resolve(response?.stats || {})
        }
      }
    )
  })
}

/**
 * 兼容旧 API: 获取 Map 格式的记录集
 * @deprecated 请使用 getRecordsByProviderType
 */
export async function getDatasetMap(
  type: string,
  provider: string
): Promise<Map<string, MediaRecord>> {
  const records = await getRecordsByProviderType(provider, type)
  const map = new Map<string, MediaRecord>()
  records.forEach(record => {
    map.set(record.providerId, record)
  })
  return map
}

/**
 * 兼容旧 API: 初始化(空操作,仅用于兼容)
 * @deprecated 无需手动初始化
 */
export async function initialize(): Promise<void> {
  return Promise.resolve()
}

/**
 * 兼容旧 API: 获取 ID 集合
 * @deprecated 请使用 getRecordsByProviderType
 */
export async function getIdSet(
  type: string,
  provider: string
): Promise<Set<string>> {
  const records = await getRecordsByProviderType(provider, type)
  return new Set(records.map(r => r.providerId))
}

/**
 * 兼容旧 API: 设置数据集
 * @deprecated 请使用 upsertRecord 或 bulkUpsertRecords
 */
export async function setDatasetMap(
  type: string,
  provider: string,
  records: Map<string, any>
): Promise<void> {
  const v2Records: MediaRecord[] = []
  for (const [providerId, record] of records) {
    v2Records.push({
      provider: provider as any,
      type,
      providerId,
      id: `${provider}:${type}:${providerId}`,
      url: record.url || '',
      status: record.status || 0,
      rating: record.rating || 0,
      updatedAt: record.updatedAt || new Date().toISOString(),
    })
  }
  await bulkUpsertRecords(v2Records)
}

/**
 * 兼容旧 API: setSettings 是 updateSettings 的别名
 */
export async function setSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
  return updateSettings(partial)
}

/**
 * 兼容旧 API: 添加 ID 到集合(已废弃)
 * @deprecated
 */
export async function addIdToSet(_key: string, _id: string): Promise<void> {
  console.warn('[Database API] addIdToSet is deprecated')
  return Promise.resolve()
}

/**
 * 兼容旧 API: 删除过期 ID(已废弃)
 * @deprecated
 */
export async function deleteExpiringId(_key: string, _id: string): Promise<void> {
  console.warn('[Database API] deleteExpiringId is deprecated')
  return Promise.resolve()
}

/**
 * 兼容旧 API: 添加过期 ID(已废弃)
 * @deprecated
 */
export async function addExpiringId(_key: string, _id: string, _ttl: number): Promise<void> {
  console.warn('[Database API] addExpiringId is deprecated')
  return Promise.resolve()
}

/**
 * 兼容旧 API: 获取 ID 集合(已废弃)
 * @deprecated
 */
export async function getIdSetByKey(_key: string): Promise<Set<string>> {
  console.warn('[Database API] getIdSetByKey is deprecated')
  return Promise.resolve(new Set())
}

/**
 * 兼容旧 API: 获取过期映射(已废弃)
 * @deprecated
 */
export async function getExpiringMap(_key?: string): Promise<Map<string, number>> {
  console.warn('[Database API] getExpiringMap is deprecated')
  return Promise.resolve(new Map())
}

/**
 * 兼容旧 API: 更新记录评分(已废弃)
 * @deprecated 请直接使用 upsertRecord
 */
export async function updateRecordRating(
  _type: string,
  _provider: string,
  providerId: string,
  rating: number
): Promise<void> {
  console.warn('[Database API] updateRecordRating is deprecated, use upsertRecord instead')
  // 构造 ID 并更新
  const id = `${_provider}:${_type}:${providerId}`
  const record = await getRecord(id)
  if (record) {
    record.rating = rating
    await upsertRecord(record)
  } else {
    // 如果记录不存在,创建新记录
    const newRecord: MediaRecord = {
      provider: _provider as any,
      type: _type,
      providerId,
      id,
      url: '',
      status: 0,
      rating,
      updatedAt: new Date().toISOString(),
    }
    await upsertRecord(newRecord)
  }
}
