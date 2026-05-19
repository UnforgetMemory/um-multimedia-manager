/**
 * WebDAV Meta 哈希计算工具
 * 
 * 用于计算数据集的 SHA-256 哈希值，实现增量同步
 */

import type { MediaRecord, WebDAVMeta, DatasetMeta } from '../types'
import { CONFIG } from '../config'
import Store from '../adapters/indexeddb-store'

/**
 * 计算数据集的 SHA-256 哈希值
 * 
 * @param records - 媒体记录数组
 * @returns SHA-256 哈希字符串
 */
export async function calculateDatasetHash(records: MediaRecord[]): Promise<string> {
  if (records.length === 0) {
    return 'empty-dataset'
  }
  
  // 按 providerId 排序确保一致性
  const sorted = [...records].sort((a, b) => a.providerId.localeCompare(b.providerId))
  
  // 提取关键数据（排除自动维护字段如 updatedAt）
  const dataToHash = sorted.map(r => ({
    provider: r.provider,
    type: r.type,
    providerId: r.providerId,
    status: r.status,
    rating: r.rating,
    linkedIds: r.linkedIds,
    neodbUuid: r.neodbUuid,
    neodbShelfUuid: r.neodbShelfUuid
  }))
  
  // 使用 Web Crypto API 计算 SHA-256
  const encoder = new TextEncoder()
  const data = encoder.encode(JSON.stringify(dataToHash))
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * 从本地数据库构建完整的 WebDAV Meta
 * 
 * @returns WebDAV Meta 对象
 */
export async function buildWebDAVMeta(): Promise<WebDAVMeta> {
  const datasets: DatasetMeta[] = []
  
  for (const [domain, provider] of CONFIG.DATASET_ORDER) {
    const records = await Store.getRecordsByProviderType(provider as any, domain)
    const hash = await calculateDatasetHash(records)
    
    datasets.push({
      key: `${domain}:${provider}`,
      version: 1,
      timestamp: records.length > 0 
        ? records[records.length - 1].updatedAt || new Date().toISOString()
        : new Date().toISOString(),
      recordCount: records.length,
      hash
    })
  }
  
  return {
    schema: 'umm-webdav-meta',
    version: 1,
    generatedAt: new Date().toISOString(),
    datasets
  }
}
