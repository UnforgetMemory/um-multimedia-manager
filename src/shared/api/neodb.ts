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

// ==================== 常量定义 ====================

const NEOBASE_URL = 'https://neodb.social/api'

// ==================== 辅助函数 ====================

/**
 * 构建请求头
 */
function buildHeaders(token?: string): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  return headers
}

/**
 * 发送 GET 请求
 */
async function getRequest<T>(url: string, token?: string): Promise<T> {
  const response = await fetch(url, {
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
    console.error('[NeoDB] Search failed:', error)
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
    console.error('[NeoDB] Get detail failed:', error)
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
    console.error('[NeoDB] Get work by URL failed:', error)
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

      console.log('[NeoDB] Enriched rating for:', record.providerId)
      return updatedRecord
    }

    return record
  } catch (error) {
    console.error('[NeoDB] Enrich metadata failed:', error)
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
      console.error('[NeoDB] Failed to enrich record:', record.providerId, error)
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
    console.error('[NeoDB] Token validation failed:', error)
    return false
  }
}

// ==================== 工具函数 ====================

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
