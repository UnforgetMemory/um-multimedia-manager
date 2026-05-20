/**
 * NeoDB API 客户端
 * 
 * 负责与 NeoDB 平台交互，获取元数据和封面图片
 * - 搜索作品
 * - 获取详细信息
 * - 获取封面图片
 * - 用户认证
 */

import type { MediaRecord } from '../types'
import Store from '../adapters/indexeddb-store'
import { debugLog, infoLog, warnLog, errorLog } from '../utils/logger'

// ==================== 类型定义 ====================

interface NeoDBSearchResult {
  id: string
  title: string
  original_title?: string
  year?: number
  rating?: number
  cover_image_url?: string
  type: 'movie' | 'tv' | 'music' | 'book' | 'game'
}

interface NeoDBDetail {
  id: string
  title: string
  original_title?: string
  summary?: string
  year?: number
  rating?: number
  rating_count?: number
  cover_image_url?: string
  genres?: string[]
  directors?: Array<{ name: string }>
  actors?: Array<{ name: string }>
  duration?: number
  release_date?: string
  type: 'movie' | 'tv' | 'music' | 'book' | 'game'
}

// ✅ 新增：书架项响应接口
export interface ShelfItemResponse {
  uuid: string          // shelf_item 的唯一 ID
  item: string          // 作品 UUID
  shelf_type: string    // complete/progress/wishlist
  rating: number        // 评分
  created_time: string  // 创建时间
  updated_time: string  // 更新时间
}

// ==================== 常量定义 ====================

const NEOBASE_URL = 'https://neodb.social/api'

// ==================== 重试配置 ====================

const NEO_DB_MAX_RETRIES = 3
const NEO_DB_RETRY_DELAY = 1000

/**
 * 带重试的 fetch 请求（针对 5xx 服务器错误）
 */
async function fetchWithRetry(url: string, options: RequestInit, retries = NEO_DB_MAX_RETRIES): Promise<Response> {
  try {
    const response = await fetch(url, options)
    if (!response.ok && retries > 0 && response.status >= 500) {
      debugLog(`NeoDB request failed with ${response.status}, retrying... (${retries} attempts left)`)
      await new Promise(resolve => setTimeout(resolve, NEO_DB_RETRY_DELAY))
      return fetchWithRetry(url, options, retries - 1)
    }
    return response
  } catch (error) {
    if (retries > 0) {
      debugLog(`NeoDB request error, retrying... (${retries} attempts left)`, error)
      await new Promise(resolve => setTimeout(resolve, NEO_DB_RETRY_DELAY))
      return fetchWithRetry(url, options, retries - 1)
    }
    throw error
  }
}

// ==================== 辅助函数 ====================

/**
 * 构建请求头
 */
function buildHeaders(token?: string): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  }

  if (token) {
    // ✅ 修复：仅移除首尾空白和不可见控制字符，保留所有可打印字符
    // \x00-\x1F: 控制字符, \x7F: DEL 字符
    const cleanToken = token.trim().replace(/[\x00-\x1F\x7F]/g, '')
    
    infoLog('Token length:', token.length, 'Cleaned length:', cleanToken.length)
    infoLog('Token preview:', cleanToken.substring(0, 10) + '...')
    
    if (cleanToken) {
      headers['Authorization'] = `Bearer ${cleanToken}`
    } else {
      warnLog('Token is empty after cleaning, skipping Authorization header')
    }
  } else {
    warnLog('No token provided')
  }

  return headers
}

/**
 * 发送 GET 请求
 */
async function getRequest<T>(url: string, token?: string): Promise<T> {
  const response = await fetchWithRetry(url, {
    method: 'GET',
    headers: buildHeaders(token),
  })

  if (!response.ok) {
    throw new Error(`NeoDB API error: ${response.status} ${response.statusText}`)
  }

  return response.json() as Promise<T>
}

// ==================== 核心功能 ====================

/**
 * 搜索作品
 */
export async function searchWorks(
  query: string,
  type?: 'movie' | 'tv' | 'music',
  token?: string
): Promise<NeoDBSearchResult[]> {
  try {
    const params = new URLSearchParams({
      q: query,
      page: '1',
      page_size: '10',
    })

    if (type) {
      params.append('category', type)
    }

    const url = `${NEOBASE_URL}/catalog/search/?${params.toString()}`
    const data = await getRequest<any>(url, token)

    // 解析搜索结果
    return (data.items || []).map((item: any) => ({
      id: item.id || '',
      title: item.title || '',
      original_title: item.original_title,
      year: item.year,
      rating: item.rating,
      cover_image_url: item.cover_image_url,
      type: item.category || 'movie',
    }))
  } catch (error) {
    errorLog('Search failed:', error)
    return []
  }
}

/**
 * 获取作品详情
 */
export async function getWorkDetail(
  workId: string,
  token?: string
): Promise<NeoDBDetail | null> {
  try {
    const url = `${NEOBASE_URL}/catalog/item/${workId}/`
    const data = await getRequest<any>(url, token)

    return {
      id: data.id || '',
      title: data.title || '',
      original_title: data.original_title,
      summary: data.brief,
      year: data.year,
      rating: data.rating,
      rating_count: data.rating_count,
      cover_image_url: data.cover_image_url,
      genres: data.genres,
      directors: data.directors,
      actors: data.actors,
      duration: data.duration,
      release_date: data.release_date,
      type: data.category || 'movie',
    }
  } catch (error) {
    errorLog('Get detail failed:', error)
    return null
  }
}

/**
 * 根据 URL 获取作品信息
 */
export async function getWorkByUrl(
  url: string,
  token?: string
): Promise<NeoDBDetail | null> {
  try {
    // 从 URL 提取 ID
    const match = url.match(/neodb\.social\/(?:movie|tv|music|book|game)\/([^/]+)/)
    if (!match) {
      return null
    }

    const workId = match[1]
    return await getWorkDetail(workId, token)
  } catch (error) {
    errorLog('Get work by URL failed:', error)
    return null
  }
}

/**
 * 更新记录元数据
 */
export async function enrichRecordMetadata(
  record: MediaRecord,
  token?: string
): Promise<MediaRecord> {
  try {
    // 仅处理 NeoDB 平台的记录
    if (record.provider !== 'neodb') {
      return record
    }

    // 获取详细信息
    const detail = await getWorkDetail(record.providerId, token)

    if (!detail) {
      return record
    }

    // 注意: MediaRecord 当前只包含基本字段
    // 元数据可以存储在额外的字段中，或者通过其他方式管理
    // 这里我们只更新评分（如果 NeoDB 有评分且本地没有）
    if (detail.rating && record.rating === 0) {
      const updatedRecord: MediaRecord = {
        ...record,
        rating: detail.rating,
        updatedAt: new Date().toISOString(),
      }

      // 保存到存储
      await Store.upsertRecord(updatedRecord)

      infoLog('Enriched rating for:', record.providerId)
      return updatedRecord
    }

    return record
  } catch (error) {
    errorLog('Enrich metadata failed:', error)
    return record
  }
}

/**
 * 批量更新记录元数据
 */
export async function enrichBatchMetadata(
  records: MediaRecord[],
  token?: string
): Promise<MediaRecord[]> {
  const enrichedRecords: MediaRecord[] = []

  for (const record of records) {
    try {
      const enriched = await enrichRecordMetadata(record, token)
      enrichedRecords.push(enriched)

      // 添加延迟以避免速率限制
      await new Promise(resolve => setTimeout(resolve, 500))
    } catch (error) {
      errorLog('Failed to enrich record:', record.providerId, error)
      enrichedRecords.push(record)
    }
  }

  return enrichedRecords
}

/**
 * 验证 Token
 */
export async function validateToken(token: string): Promise<boolean> {
  try {
    const url = `${NEOBASE_URL}/me/`
    await getRequest<any>(url, token)
    return true
  } catch (error) {
    errorLog('Token validation failed:', error)
    return false
  }
}

/**
 * 通过 URL 抓取 NeoDB 作品信息
 * @param url - 外部平台 URL（如豆瓣链接）
 * @param token - NeoDB Token
 * @returns 作品 UUID 和详细信息
 */
export async function fetchCatalogByUrl(
  url: string,
  token?: string
): Promise<{ uuid: string; [key: string]: any } | null> {
  try {
    const params = new URLSearchParams({ url })
    const apiUrl = `${NEOBASE_URL}/catalog/fetch?${params.toString()}`
    
    infoLog('Fetching catalog:', apiUrl)
    
    const response = await fetchWithRetry(apiUrl, {
      method: 'GET',
      headers: buildHeaders(token),
    })

    infoLog('Catalog fetch response status:', response.status)
    
    if (!response.ok) {
      const errorText = await response.text()
      errorLog('Catalog fetch failed:', response.status, errorText)
      throw new Error(`NeoDB catalog fetch error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    infoLog('Catalog fetch success, UUID:', data.uuid)
    
    return {
      uuid: data.uuid || '',
      ...data,
    }
  } catch (error) {
    errorLog('Fetch catalog by URL failed:', error)
    return null
  }
}

/**
 * 标记作品到书架（正确方式：通过 item UUID）
 * @param itemUuid - 作品 UUID（从 catalog/fetch 或 search 获取）
 * @param shelfType - 书架类型：complete=已完成, progress=进行中, wishlist=想看
 * @param rating - 评分（0-10）
 * @param token - NeoDB Token
 * @returns ShelfItemResponse 或 null
 */
export async function markItem(
  itemUuid: string,
  shelfType: 'complete' | 'progress' | 'wishlist',
  rating?: number,
  token?: string
): Promise<ShelfItemResponse | null> {
  try {
    // ✅ 正确：POST /me/shelf/item/{item_uuid}
    const url = `${NEOBASE_URL}/me/shelf/item/${itemUuid}`
    
    const payload: any = {
      shelf_type: shelfType,
      visibility: 0,  // 0=公开
    }
    
    // ✅ 正确：评分字段是 rating_grade，不是 rating
    if (rating && rating > 0) {
      payload.rating_grade = rating
    }
    
    const response = await fetchWithRetry(url, {
      method: 'POST',
      headers: buildHeaders(token),
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      throw new Error(`NeoDB API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    return {
      uuid: data.uuid,
      item: data.item,
      shelf_type: data.shelf_type,
      rating: data.rating,
      created_time: data.created_time,
      updated_time: data.updated_time,
    }
  } catch (error) {
    errorLog('Mark item failed:', error)
    return null
  }
}

/**
 * 更新作品标记信息（评分、状态等）
 */
export async function updateShelfItem(
  shelfItemUuid: string,
  updates: {
    rating?: number
    shelf_type?: 'complete' | 'progress' | 'wishlist'
  },
  token?: string
): Promise<ShelfItemResponse | null> {
  try {
    const url = `${NEOBASE_URL}/me/shelf/item/${shelfItemUuid}/`
    
    // ✅ 正确：评分字段是 rating_grade，不是 rating
    const payload: any = {}
    if (updates.rating !== undefined && updates.rating > 0) {
      payload.rating_grade = updates.rating
    }
    if (updates.shelf_type) {
      payload.shelf_type = updates.shelf_type
    }
    
    const response = await fetchWithRetry(url, {
      method: 'PATCH',
      headers: buildHeaders(token),
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      throw new Error(`NeoDB API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    return {
      uuid: data.uuid,
      item: data.item,
      shelf_type: data.shelf_type,
      rating: data.rating,
      created_time: data.created_time,
      updated_time: data.updated_time,
    }
  } catch (error) {
    errorLog('Update shelf item failed:', error)
    return null
  }
}

/**
 * 获取用户的书架项 UUID（用于更新）
 */
export async function getShelfItemUuid(
  itemUuid: string,
  token?: string
): Promise<string | null> {
  // ✅ P0: 检查缓存
  const cached = shelfCache.get(itemUuid)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    infoLog(`Using cached shelf item uuid for ${itemUuid}`)
    return cached.uuid
  }
  
  try {
    // 尝试直接查询单个作品（如果 API 支持）
    const directUrl = `${NEOBASE_URL}/me/shelf/item/?item=${itemUuid}`
    const directData = await getRequest<any>(directUrl, token)
    
    if (directData.results?.length > 0) {
      const uuid = directData.results[0].uuid
      // 更新缓存
      shelfCache.set(itemUuid, { uuid, timestamp: Date.now() })
      return uuid
    }
    
    // 降级方案：获取完整书架并搜索
    warnLog('Direct query failed, falling back to full shelf scan')
    const url = `${NEOBASE_URL}/me/shelf/complete/?page=1&page_size=100`
    const data = await getRequest<any>(url, token)
    
    // 在 results 中查找匹配的作品
    const shelfItem = data.results?.find((item: any) => item.item === itemUuid)
    const result = shelfItem?.uuid || null
    
    if (result) {
      shelfCache.set(itemUuid, { uuid: result, timestamp: Date.now() })
    }
    
    return result
  } catch (error) {
    errorLog('Get shelf item uuid failed:', error)
    return null
  }
}

// ==================== 工具函数 ====================

// ✅ P0: 书架项 UUID 缓存（优化性能）
const shelfCache = new Map<string, { uuid: string; timestamp: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5分钟缓存

/**
 * 清理过期缓存
 */
export function cleanupShelfCache() {
  const now = Date.now()
  for (const [key, value] of shelfCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      shelfCache.delete(key)
    }
  }
}

/**
 * 格式化评分
 */
export function formatRating(rating?: number): string {
  if (!rating) return '-'
  return `${rating.toFixed(1)}/10`
}

/**
 * 格式化年份
 */
export function formatYear(year?: number): string {
  if (!year) return '-'
  return String(year)
}

/**
 * 格式化类型
 */
export function formatType(type: string): string {
  const types: Record<string, string> = {
    movie: '电影',
    tv: '剧集',
    music: '音乐',
    book: '图书',
    game: '游戏',
  }
  return types[type] || type
}
