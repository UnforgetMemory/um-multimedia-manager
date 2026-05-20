import type { MediaRecord } from '../types'
import type { Provider } from '../config'
import { DATASETS } from '../config'

/**
 * 验证媒体记录数据结构
 */
export function validateMediaRecord(data: unknown): data is MediaRecord {
  if (typeof data !== 'object' || data === null) return false
  
  const record = data as Record<string, unknown>
  
  // 必需字段检查
  if (
    typeof record.provider !== 'string' ||
    typeof record.type !== 'string' ||
    typeof record.providerId !== 'string' ||
    typeof record.url !== 'string' ||
    typeof record.status !== 'number' ||
    typeof record.rating !== 'number'
  ) {
    return false
  }
  
  // provider 有效性检查
  const validProviders = Object.keys(DATASETS) as Provider[]
  if (!validProviders.includes(record.provider as Provider)) {
    return false
  }
  
  // rating 范围检查
  if (record.rating < 0 || record.rating > 10) {
    return false
  }
  
  // status 范围检查
  if (record.status < 0 || record.status > 2) {
    return false
  }
  
  return true
}

/**
 * 规范化 URL
 */
export function normalizeUrl(url: string): string {
  try {
    const urlObj = new URL(url)
    // 移除 hash 和 search，确保以 / 结尾
    return `${urlObj.origin}${urlObj.pathname.replace(/\/$/, '')}/`
  } catch {
    return url
  }
}

/**
 * 限制 status 在有效范围内
 */
export function clampStatus(status: number): number {
  return Math.max(0, Math.min(2, status))
}

/**
 * 限制 rating 在有效范围内
 */
export function clampRating(rating: number): number {
  return Math.max(0, Math.min(10, rating))
}

/**
 * 清理和规范化记录数据
 */
export function sanitizeRecord(input: Partial<MediaRecord>): MediaRecord {
  return {
    provider: (input.provider ?? 'douban') as Provider,
    type: input.type ?? 'movie',
    providerId: input.providerId ?? '',
    url: normalizeUrl(input.url ?? ''),
    status: clampStatus(input.status ?? 0),
    rating: clampRating(input.rating ?? 0),
    updatedAt: new Date().toISOString(),
    ...(input.linkedIds && { linkedIds: input.linkedIds }),
    ...(input.neodbUuid && { neodbUuid: input.neodbUuid }),
    ...(input.neodbShelfUuid && { neodbShelfUuid: input.neodbShelfUuid }),
  }
}

/**
 * 批量验证记录数组
 */
export function validateMediaRecords(records: unknown[]): MediaRecord[] {
  return records.filter(validateMediaRecord)
}

/**
 * 生成记录的唯一 ID
 */
export function generateRecordId(
  provider: Provider,
  type: string,
  providerId: string
): string {
  return `${provider}:${type}:${providerId}`
}
