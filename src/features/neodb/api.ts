/**
 * NeoDB API 客户端
 * 
 * 负责与 NeoDB 平台交互，获取元数据和封面图片
 * - 搜索作品
 * - 获取详细信息
 * - 获取封面图片
 * - 用户认证
 */

import { debugLog, infoLog, warnLog } from '@/utils/logger'
import { sleep } from '@/utils'

// ==================== 错误类型 ====================

/** Structured error with HTTP status + business message */
export class NeoDBError extends Error {
  readonly status: number
  readonly statusText: string
  readonly businessMsg?: string

  constructor(status: number, statusText: string, businessMsg?: string) {
    const parts = [`[${status}]`]
    if (businessMsg) parts.push(businessMsg)
    else parts.push(statusText || 'Unknown error')
    super(parts.join(' '))
    this.name = 'NeoDBError'
    this.status = status
    this.statusText = statusText
    this.businessMsg = businessMsg
  }
}

// ==================== 类型定义 ====================

// ✅ 新增：书架项响应接口
export interface ShelfItemResponse {
  uuid: string          // shelf_item 的唯一 ID
  item: string          // 作品 UUID
  shelf_type: string    // complete/progress/wishlist
  rating: number        // 评分
  comment_text?: string // 短评文字
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
      await sleep(NEO_DB_RETRY_DELAY)
      return fetchWithRetry(url, options, retries - 1)
    }
    return response
  } catch (error: unknown) {
    if (retries > 0) {
      debugLog(`NeoDB request error, retrying... (${retries} attempts left)`, error)
      await sleep(NEO_DB_RETRY_DELAY)
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

// ==================== 核心功能 ====================

/**
 * 通过 URL 抓取 NeoDB 作品信息
 * @param url - 外部平台 URL（如豆瓣链接）
 * @param token - NeoDB Token
 * @returns 作品 UUID 和详细信息
 */
export async function fetchCatalogByUrl(
  url: string,
  token?: string
): Promise<{ uuid: string; [key: string]: any }> {
  const params = new URLSearchParams({ url })
  const apiUrl = `${NEOBASE_URL}/catalog/fetch?${params.toString()}`

  infoLog('Fetching catalog:', apiUrl)

  const response = await fetchWithRetry(apiUrl, {
    method: 'GET',
    headers: buildHeaders(token),
  })

  infoLog('Catalog fetch response status:', response.status)

  if (!response.ok) {
    let businessMsg = ''
    try {
      const body = await response.json()
      // NeoDB returns { detail: "..." } or { error: "..." } on failure
      businessMsg = body.detail || body.error || body.message || ''
    } catch { /* non-JSON error body */ }
    throw new NeoDBError(response.status, response.statusText, businessMsg)
  }

  const data = await response.json()
  infoLog('Catalog fetch success, UUID:', data.uuid)

  return {
    uuid: data.uuid || '',
    ...data,
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
  comment_text?: string,
  token?: string
): Promise<ShelfItemResponse> {
  const url = `${NEOBASE_URL}/me/shelf/item/${itemUuid}`

  const payload: any = {
    shelf_type: shelfType,
    visibility: 0,
  }

  if (rating && rating > 0) {
    payload.rating_grade = rating
  }

  if (comment_text) {
    payload.comment_text = comment_text
  }

  const response = await fetchWithRetry(url, {
    method: 'POST',
    headers: buildHeaders(token),
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    let businessMsg = ''
    try {
      const body = await response.json()
      businessMsg = body.detail || body.error || body.message || ''
    } catch { /* non-JSON error body */ }
    throw new NeoDBError(response.status, response.statusText, businessMsg)
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
}

/**
 * 获取用户的书架项 UUID（用于更新）
 */

// ==================== 工具函数 ====================

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
