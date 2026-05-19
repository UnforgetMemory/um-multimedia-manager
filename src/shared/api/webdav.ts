/**
 * WebDAV 客户端
 * 
 * 负责与 WebDAV 服务器进行数据同步
 * - 上传数据到 WebDAV
 * - 从 WebDAV 下载数据
 * - 冲突检测和解决
 */

import type { ExportData, MediaRecord, WebDAVSettings } from '../types'
import Store, { checkFormatCompatibility } from '../adapters/indexeddb-store'
import { CONFIG } from '../config'
import { objectToZipBlob, zipBlobToObject, validateZipStructure } from '../utils/zip-utils'
import { buildWebDAVMeta } from '../utils/hash-utils'
import type { WebDAVMeta } from '../types'

// ==================== 类型定义 ====================

interface WebDAVConfig {
  url: string
  username: string
  password: string
}

interface SyncResult {
  success: boolean
  direction: 'upload' | 'download' | 'conflict' | 'merge'
  message?: string
  timestamp: string
  // ✅ 新增: 同步统计
  stats?: {
    totalRecords: number
    uploadedCount?: number
    downloadedCount?: number
    conflictCount?: number
    mergedCount?: number
  }
}

// ==================== 辅助函数 ====================

/**
 * 标准化 WebDAV URL
 * - 去除末尾斜杠
 * - 确保以 https:// 开头
 */
function normalizeWebDAVUrl(url: string): string {
  // 去除首尾空白
  let normalized = url.trim()
  
  // 去除末尾斜杠
  if (normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1)
  }
  
  return normalized
}

/**
 * 验证 WebDAV URL 是否使用 HTTPS
 */
function validateWebDAVUrl(url: string): void {
  if (!url || !url.trim()) {
    throw new Error('WebDAV URL cannot be empty')
  }
  
  const trimmed = url.trim()
  
  if (!trimmed.startsWith('https://')) {
    throw new Error(
      '⚠️ Security Warning: WebDAV URL must use HTTPS protocol. ' +
      'HTTP connections may expose your credentials in transit. ' +
      'Please update your WebDAV URL to use https://'
    )
  }
  
  // 验证 URL 格式
  try {
    new URL(trimmed)
  } catch {
    throw new Error('Invalid WebDAV URL format')
  }
}

/**
 * 构建 Basic Auth 头
 * 
 * WARNING: Basic Auth uses Base64 encoding, NOT encryption.
 * Ensure WebDAV server uses HTTPS to protect credentials in transit.
 * Consider using token-based auth if supported by your WebDAV provider.
 */
function buildAuthHeader(username: string, password: string): string {
  const credentials = btoa(`${username}:${password}`)
  return `Basic ${credentials}`
}

/**
 * ✅ 验证 WebDAV 配置完整性，返回详细的缺失字段信息
 */
function validateWebDAVSettings(settings: WebDAVSettings): { valid: boolean; missingFields: string[] } {
  const missingFields: string[] = []
  
  if (!settings.webdavUrl || !settings.webdavUrl.trim()) {
    missingFields.push('URL')
  }
  if (!settings.webdavUsername || !settings.webdavUsername.trim()) {
    missingFields.push('用户名')
  }
  if (!settings.webdavPassword || !settings.webdavPassword.trim()) {
    missingFields.push('密码')
  }
  
  return {
    valid: missingFields.length === 0,
    missingFields
  }
}

/**
 * 检查 WebDAV 连接
 */
export async function checkConnection(config: WebDAVConfig): Promise<boolean> {
  try {
    // 验证 URL 协议
    validateWebDAVUrl(config.url)
    
    const normalizedUrl = normalizeWebDAVUrl(config.url)
    const response = await fetch(normalizedUrl, {
      method: 'PROPFIND',
      headers: {
        Authorization: buildAuthHeader(config.username, config.password),
        Depth: '0',
      },
    })

    return response.ok || response.status === 207 // 207 Multi-Status is also OK for PROPFIND
  } catch (error) {
    console.error('[WebDAV] Connection check failed:', error)
    return false
  }
}

/**
 * 确保远程目录存在
 */
async function ensureRemoteDirectory(config: WebDAVConfig, path: string): Promise<void> {
  try {
    const normalizedUrl = normalizeWebDAVUrl(config.url)
    const response = await fetch(`${normalizedUrl}${path}`, {
      method: 'MKCOL',
      headers: {
        Authorization: buildAuthHeader(config.username, config.password),
      },
    })

    // 405 Method Not Allowed means directory already exists
    if (!response.ok && response.status !== 405) {
      throw new Error(`Failed to create directory: ${response.statusText}`)
    }
  } catch (error) {
    console.error('[WebDAV] Failed to ensure directory:', error)
    throw error
  }
}

// ==================== 核心功能 ====================

/**
 * 上传数据到 WebDAV
 */
export async function uploadToWebDAV(data: ExportData): Promise<SyncResult> {
  try {
    const settings = await Store.getSettings()
    
    // ✅ 使用详细验证
    const validation = validateWebDAVSettings(settings)
    if (!validation.valid) {
      return {
        success: false,
        direction: 'upload',
        message: `WebDAV 配置不完整，缺少: ${validation.missingFields.join('、')}`,
        timestamp: new Date().toISOString(),
      }
    }

    const config: WebDAVConfig = {
      url: settings.webdavUrl,
      username: settings.webdavUsername,
      password: settings.webdavPassword,
    }

    // ✅ 在上传前先测试连接
    console.log('[WebDAV] Testing connection before upload...')
    const isConnected = await checkConnection(config)
    if (!isConnected) {
      return {
        success: false,
        direction: 'upload',
        message: '无法连接到 WebDAV 服务器，请检查网络和配置',
        timestamp: new Date().toISOString(),
      }
    }
    console.log('[WebDAV] Connection test passed')

    // 确保目录存在
    await ensureRemoteDirectory(config, '/umm-data/')

    // 序列化数据
    const jsonData = JSON.stringify(data, null, 2)
    const blob = new Blob([jsonData], { type: 'application/json' })

    // 上传文件
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `umm-export-${timestamp}.json`
    const filePath = `/umm-data/${filename}`

    const normalizedUrl = normalizeWebDAVUrl(config.url)
    const response = await fetch(`${normalizedUrl}${filePath}`, {
      method: 'PUT',
      headers: {
        Authorization: buildAuthHeader(config.username, config.password),
        'Content-Type': 'application/json',
      },
      body: blob,
    })

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`)
    }

    console.log('[WebDAV] Upload successful:', filePath)

    return {
      success: true,
      direction: 'upload',
      message: `已上传到 ${filename}`,
      timestamp: new Date().toISOString(),
    }
  } catch (error) {
    console.error('[WebDAV] Upload failed:', error)
    return {
      success: false,
      direction: 'upload',
      message: `上传失败: ${String(error)}`,
      timestamp: new Date().toISOString(),
    }
  }
}

/**
 * 从 WebDAV 下载最新数据
 */
export async function downloadFromWebDAV(): Promise<SyncResult & { data?: ExportData }> {
  try {
    const settings = await Store.getSettings()
    
    // ✅ 使用详细验证
    const validation = validateWebDAVSettings(settings)
    if (!validation.valid) {
      return {
        success: false,
        direction: 'download',
        message: `WebDAV 配置不完整，缺少: ${validation.missingFields.join('、')}`,
        timestamp: new Date().toISOString(),
      }
    }

    const config: WebDAVConfig = {
      url: settings.webdavUrl,
      username: settings.webdavUsername,
      password: settings.webdavPassword,
    }

    // ✅ 在下载前先测试连接
    console.log('[WebDAV] Testing connection before download...')
    const isConnected = await checkConnection(config)
    if (!isConnected) {
      return {
        success: false,
        direction: 'download',
        message: '无法连接到 WebDAV 服务器，请检查网络和配置',
        timestamp: new Date().toISOString(),
      }
    }
    console.log('[WebDAV] Connection test passed')

    // 列出远程文件
    const normalizedUrl = normalizeWebDAVUrl(config.url)
    const listResponse = await fetch(`${normalizedUrl}/umm-data/`, {
      method: 'PROPFIND',
      headers: {
        Authorization: buildAuthHeader(config.username, config.password),
        Depth: '1',
      },
    })

    if (!listResponse.ok) {
      // 如果目录不存在，说明没有远程数据
      if (listResponse.status === 404) {
        return {
          success: true,
          direction: 'download',
          message: '没有远程数据',
          timestamp: new Date().toISOString(),
        }
      }
      throw new Error(`Failed to list files: ${listResponse.statusText}`)
    }

    // 解析响应获取最新文件
    const text = await listResponse.text()
    const latestFile = parseLatestFile(text)

    if (!latestFile) {
      return {
        success: true,
        direction: 'download',
        message: '没有远程数据',
        timestamp: new Date().toISOString(),
      }
    }

    // 下载最新文件
    const downloadResponse = await fetch(`${normalizedUrl}/umm-data/${latestFile}`, {
      method: 'GET',
      headers: {
        Authorization: buildAuthHeader(config.username, config.password),
      },
    })

    if (!downloadResponse.ok) {
      throw new Error(`Download failed: ${downloadResponse.statusText}`)
    }

    const jsonData = await downloadResponse.text()
    const data = JSON.parse(jsonData) as ExportData

    console.log('[WebDAV] Download successful:', latestFile)

    return {
      success: true,
      direction: 'download',
      message: `已下载 ${latestFile}`,
      timestamp: new Date().toISOString(),
      data,
    }
  } catch (error) {
    console.error('[WebDAV] Download failed:', error)
    return {
      success: false,
      direction: 'download',
      message: `下载失败: ${String(error)}`,
      timestamp: new Date().toISOString(),
    }
  }
}

/**
 * 执行智能增量同步（基于 Meta 和哈希）
 */
export async function syncWithWebDAV(): Promise<SyncResult> {
  try {
    const settings = await Store.getSettings()
    
    const validation = validateWebDAVSettings(settings)
    if (!validation.valid) {
      return {
        success: false,
        direction: 'merge',
        message: `WebDAV 配置不完整，缺少: ${validation.missingFields.join('、')}`,
        timestamp: new Date().toISOString(),
      }
    }

    const config: WebDAVConfig = {
      url: settings.webdavUrl,
      username: settings.webdavUsername,
      password: settings.webdavPassword,
    }

    // 测试连接
    console.log('[WebDAV] Testing connection...')
    const isConnected = await checkConnection(config)
    if (!isConnected) {
      return {
        success: false,
        direction: 'merge',
        message: '无法连接到 WebDAV 服务器，请检查网络和配置',
        timestamp: new Date().toISOString(),
      }
    }

    // 第一阶段：下载或创建 Meta
    console.log('[WebDAV] Downloading meta.json...')
    const remoteMeta = await downloadMeta(config)
    
    // 构建本地 Meta
    console.log('[WebDAV] Building local meta...')
    const localMeta = await buildWebDAVMeta()

    // 如果云端没有 Meta，直接全量上传
    if (!remoteMeta) {
      console.log('[WebDAV] No remote meta found, performing full upload')
      return await uploadAndOverwrite()
    }

    // 第二阶段：对比 Meta，确定同步策略
    console.log('[WebDAV] Comparing meta...')
    const comparison = compareMeta(localMeta, remoteMeta)
    
    console.log(`[WebDAV] Sync plan: upload=${comparison.needUpload.length}, download=${comparison.needDownload.length}, unchanged=${comparison.unchanged.length}`)

    // 如果没有任何变化
    if (comparison.needUpload.length === 0 && comparison.needDownload.length === 0) {
      return {
        success: true,
        direction: 'merge',
        message: '数据已同步，无需操作',
        timestamp: new Date().toISOString(),
        stats: {
          totalRecords: localMeta.datasets.reduce((sum, d) => sum + d.recordCount, 0),
          mergedCount: 0
        }
      }
    }

    // 第三阶段：执行增量同步
    let uploadedCount = 0
    let downloadedCount = 0
    let totalRecords = 0

    // 上传本地变更的数据集
    for (const key of comparison.needUpload) {
      const [domain, provider] = key.split(':')
      console.log(`[WebDAV] Uploading ${key}...`)
      
      const records = await Store.getRecordsByProviderType(provider as any, domain)
      await uploadDataset(domain, provider, records, config)
      
      uploadedCount += records.length
      totalRecords += records.length
    }

    // 下载云端变更的数据集
    for (const key of comparison.needDownload) {
      const [domain, provider] = key.split(':')
      console.log(`[WebDAV] Downloading ${key}...`)
      
      const remoteRecords = await downloadDataset(domain, provider, config)
      
      // 转换为 MediaRecord 格式
      const mediaRecords: MediaRecord[] = remoteRecords.map(record => ({
        provider: provider as any,
        type: domain,
        providerId: record.providerId,
        id: `${provider}:${domain}:${record.providerId}`,
        url: record.url || '',
        status: record.status || 0,
        rating: record.rating || 0,
        updatedAt: record.updatedAt || new Date().toISOString(),
      }))
      
      // 批量写入本地数据库
      await Store.bulkUpsertRecords(mediaRecords)
      
      downloadedCount += mediaRecords.length
      totalRecords += mediaRecords.length
    }

    // 第四阶段：更新云端 Meta
    console.log('[WebDAV] Updating remote meta...')
    const updatedLocalMeta = await buildWebDAVMeta()
    await uploadMeta(updatedLocalMeta, config)

    const message = `增量同步完成: 上传 ${uploadedCount} 条，下载 ${downloadedCount} 条`
    
    return {
      success: true,
      direction: 'merge',
      message,
      timestamp: new Date().toISOString(),
      stats: {
        totalRecords,
        uploadedCount,
        downloadedCount,
        mergedCount: uploadedCount + downloadedCount
      }
    }
  } catch (error) {
    console.error('[WebDAV] Incremental sync failed:', error)
    return {
      success: false,
      direction: 'conflict',
      message: `同步失败: ${String(error)}`,
      timestamp: new Date().toISOString(),
    }
  }
}

// ==================== 工具函数 ====================

/**
 * 从 PROPFIND 响应中解析最新文件
 * 使用 DOMParser 替代正则表达式，提高兼容性
 */
function parseLatestFile(xmlText: string): string | null {
  try {
    const parser = new DOMParser()
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml')
    
    // 检查解析错误
    const parseError = xmlDoc.querySelector('parsererror')
    if (parseError) {
      console.error('[WebDAV] XML parse error:', parseError.textContent)
      return null
    }
    
    // 查找所有 href 元素
    const hrefElements = xmlDoc.getElementsByTagNameNS('*', 'href')
    
    if (hrefElements.length === 0) {
      return null
    }
    
    // 提取文件名并过滤
    const jsonFiles: string[] = []
    for (let i = 0; i < hrefElements.length; i++) {
      const href = hrefElements[i].textContent
      if (!href) continue
      
      // 提取文件名
      const filename = href.split('/').pop()
      if (!filename) continue
      
      // 只保留 umm-export-*.json 文件
      if (filename.startsWith('umm-export-') && filename.endsWith('.json')) {
        jsonFiles.push(filename)
      }
    }
    
    if (jsonFiles.length === 0) {
      return null
    }
    
    // 按名称排序（最新的在最后）
    jsonFiles.sort()
    return jsonFiles[jsonFiles.length - 1]
  } catch (error) {
    console.error('[WebDAV] Failed to parse PROPFIND response:', error)
    return null
  }
}

/**
 * 下载指定数据集（支持 ZIP 和 JSON 格式）
 */
async function downloadDataset(
  domain: string,
  provider: string,
  config: WebDAVConfig
): Promise<any[]> {
  try {
    const normalizedUrl = normalizeWebDAVUrl(config.url)
    
    // 尝试下载 ZIP 文件
    const zipFileName = `${domain}-${provider}.zip`
    const zipFilePath = `/umm-data/${zipFileName}`
    
    const response = await fetch(`${normalizedUrl}${zipFilePath}`, {
      method: 'GET',
      headers: {
        Authorization: buildAuthHeader(config.username, config.password),
      },
    })

    if (!response.ok) {
      if (response.status === 404) {
        // ZIP 不存在，回退到 JSON 格式（向后兼容）
        console.log(`[WebDAV] ZIP not found for ${domain}:${provider}, trying legacy JSON format`)
        return await downloadDatasetLegacy(domain, provider, config)
      }
      throw new Error(`Download failed with status ${response.status}: ${response.statusText}`)
    }

    const zipBlob = await response.blob()
    
    // 验证 ZIP 完整性
    const isValid = await validateZipStructure(zipBlob)
    if (!isValid) {
      throw new Error(`ZIP file corrupted: ${zipFileName}`)
    }
    
    // 解压并提取数据
    const { data, metadata } = await zipBlobToObject(zipBlob)
    
    // 验证版本兼容性
    const compatibility = await checkFormatCompatibility(metadata)
    if (!compatibility.compatible) {
      throw new Error(
        `Incompatible data format: cloud is ${metadata.format}, local supports up to v1.0. ` +
        `Please update the extension.`
      )
    }
    
    // 如果需要迁移，执行迁移（预留接口）
    if (compatibility.needsMigration) {
      console.log(`[WebDAV] Migrating from format ${metadata.format} to v1.0`)
      // TODO: 实现迁移逻辑
    }
    
    return data.records
  } catch (error) {
    console.error(`[WebDAV] Failed to download dataset ${domain}:${provider}:`, error)
    throw error  // 抛出错误而非返回空数组
  }
}

/**
 * 下载指定数据集（旧 JSON 格式，用于向后兼容）
 */
async function downloadDatasetLegacy(
  domain: string,
  provider: string,
  config: WebDAVConfig
): Promise<any[]> {
  try {
    const normalizedUrl = normalizeWebDAVUrl(config.url)
    const filePath = `/umm-data/${domain}-${provider}.json`
    
    const response = await fetch(`${normalizedUrl}${filePath}`, {
      method: 'GET',
      headers: {
        Authorization: buildAuthHeader(config.username, config.password),
      },
    })

    if (!response.ok) {
      if (response.status === 404) {
        console.log(`[WebDAV] Dataset ${domain}:${provider} not found on server`)
        return []
      }
      throw new Error(`Download failed with status ${response.status}: ${response.statusText}`)
    }

    const jsonData = await response.text()
    return JSON.parse(jsonData)
  } catch (error) {
    console.error(`[WebDAV] Failed to download legacy dataset ${domain}:${provider}:`, error)
    throw error
  }
}

/**
 * 上传指定数据集（使用 ZIP 格式）
 */
async function uploadDataset(
  domain: string,
  provider: string,
  records: any[],
  config: WebDAVConfig
): Promise<void> {
  try {
    const normalizedUrl = normalizeWebDAVUrl(config.url)
    
    // 新逻辑：打包为 ZIP
    const metadata = {
      format: 'v1.0',
      exportedAt: new Date().toISOString(),
      recordCount: records.length,
      domain,
      provider
    }
    
    const zipBlob = await objectToZipBlob({ records }, metadata)
    
    // 上传 ZIP 文件（文件名改为 .zip）
    const fileName = `${domain}-${provider}.zip`
    const filePath = `/umm-data/${fileName}`
    
    const response = await fetch(`${normalizedUrl}${filePath}`, {
      method: 'PUT',
      headers: {
        Authorization: buildAuthHeader(config.username, config.password),
        'Content-Type': 'application/x-umm-zip',
      },
      body: zipBlob,
    })

    if (!response.ok) {
      throw new Error(`Upload failed with status ${response.status}: ${response.statusText}`)
    }

    console.log(`[WebDAV] Uploaded dataset ${domain}:${provider} successfully (${records.length} records)`)
  } catch (error) {
    console.error(`[WebDAV] Failed to upload dataset ${domain}:${provider}:`, error)
    throw error
  }
}

/**
 * 合并本地和远程数据集（远程优先策略）
 * @deprecated 当前使用简单时间戳比较策略，此函数保留供未来使用
 */
void mergeDatasets
function mergeDatasets(
  localMap: Map<string, any>,
  remoteRecords: any[]
): Map<string, any> {
  const merged = new Map(localMap)
  
  for (const remote of remoteRecords) {
    const local = merged.get(remote.providerId)
    
    if (!local) {
      // 本地不存在，直接添加
      merged.set(remote.providerId, remote)
    } else {
      // 冲突解决：比较 updatedAt，较新的优先
      if (new Date(remote.updatedAt) > new Date(local.updatedAt)) {
        merged.set(remote.providerId, remote)
      }
    }
  }
  
  return merged
}

/**
 * 云覆盖本：下载云端数据并覆盖本地
 */
export async function downloadAndOverwrite(): Promise<SyncResult> {
  try {
    const settings = await Store.getSettings()
    
    // ✅ 使用详细验证
    const validation = validateWebDAVSettings(settings)
    if (!validation.valid) {
      return {
        success: false,
        direction: 'download',
        message: `WebDAV 配置不完整，缺少: ${validation.missingFields.join('、')}`,
        timestamp: new Date().toISOString(),
      }
    }

    const config: WebDAVConfig = {
      url: settings.webdavUrl,
      username: settings.webdavUsername,
      password: settings.webdavPassword,
    }

    // ✅ 在下载前先测试连接
    console.log('[WebDAV] Testing connection before download...')
    const isConnected = await checkConnection(config)
    if (!isConnected) {
      return {
        success: false,
        direction: 'download',
        message: '无法连接到 WebDAV 服务器，请检查网络和配置',
        timestamp: new Date().toISOString(),
      }
    }
    console.log('[WebDAV] Connection test passed')

    // ✅ 新增：先下载 metadata 检查版本
    console.log('[WebDAV] Checking cloud data version...')
    const metadataCheck = await checkCloudMetadata(config)
    
    if (!metadataCheck.compatible) {
      return {
        success: false,
        direction: 'download',
        message: metadataCheck.message || '云端数据版本不兼容',
        timestamp: new Date().toISOString(),
      }
    }

    // 第一阶段：下载所有数据集到临时变量
    console.log('[WebDAV] Starting download phase...')
    const tempRecords: MediaRecord[] = []
    
    for (const [domain, provider] of CONFIG.DATASET_ORDER) {
      console.log(`[WebDAV] Downloading ${domain}:${provider}...`)
      const remote = await downloadDataset(domain, provider, config)
      
      // 转换为 MediaRecord 格式
      for (const record of remote) {
        tempRecords.push({
          provider: provider as any,
          type: domain,
          providerId: record.providerId,
          id: `${provider}:${domain}:${record.providerId}`,
          url: record.url || '',
          status: record.status || 0,
          rating: record.rating || 0,
          updatedAt: record.updatedAt || new Date().toISOString(),
        })
      }
    }
    
    console.log(`[WebDAV] Download phase complete, got ${tempRecords.length} records`)
    
    // 第二阶段：全部成功后才写入存储（原子操作）
    console.log('[WebDAV] Starting write phase...')
    await Store.bulkUpsertRecords(tempRecords)
    console.log('[WebDAV] Write phase complete')

    // ✅ 新增：下载成功后更新本地 meta 并上传到云端
    console.log('[WebDAV] Updating meta.json after download...')
    const updatedMeta = await buildWebDAVMeta()
    await uploadMeta(updatedMeta, config)

    return {
      success: true,
      direction: 'download',
      message: `已从云端覆盖本地数据(${tempRecords.length} 条记录)`,
      timestamp: new Date().toISOString(),
      stats: {
        totalRecords: tempRecords.length,
        downloadedCount: tempRecords.length
      }
    }
  } catch (error) {
    console.error('[WebDAV] Download and overwrite failed:', error)
    return {
      success: false,
      direction: 'download',
      message: `下载失败: ${String(error)}`,
      timestamp: new Date().toISOString(),
    }
  }
}

/**
 * 本覆盖云：上传本地数据并覆盖云端
 */
export async function uploadAndOverwrite(): Promise<SyncResult> {
  try {
    const settings = await Store.getSettings()
    
    // ✅ 使用详细验证
    const validation = validateWebDAVSettings(settings)
    if (!validation.valid) {
      return {
        success: false,
        direction: 'upload',
        message: `WebDAV 配置不完整，缺少: ${validation.missingFields.join('、')}`,
        timestamp: new Date().toISOString(),
      }
    }

    const config: WebDAVConfig = {
      url: settings.webdavUrl,
      username: settings.webdavUsername,
      password: settings.webdavPassword,
    }

    // ✅ 在上传前先测试连接
    console.log('[WebDAV] Testing connection before upload...')
    const isConnected = await checkConnection(config)
    if (!isConnected) {
      return {
        success: false,
        direction: 'upload',
        message: '无法连接到 WebDAV 服务器，请检查网络和配置',
        timestamp: new Date().toISOString(),
      }
    }
    console.log('[WebDAV] Connection test passed')

    // 确保目录存在
    await ensureRemoteDirectory(config, '/umm-data/')

    // 第一阶段：收集所有本地数据
    console.log('[WebDAV] Starting upload phase...')
    const allRecords = new Map<string, MediaRecord[]>()
    let totalRecords = 0
    
    for (const [domain, provider] of CONFIG.DATASET_ORDER) {
      const records = await Store.getRecordsByProviderType(provider as any, domain)
      allRecords.set(`${domain}:${provider}`, records)
      totalRecords += records.length
      console.log(`[WebDAV] Collected ${records.length} records for ${domain}:${provider}`)
    }
    
    console.log(`[WebDAV] Upload phase complete, total ${totalRecords} records`)
    
    // 第二阶段：全部上传（如果失败会抛出异常，不会部分更新）
    for (const [domain, provider] of CONFIG.DATASET_ORDER) {
      const key = `${domain}:${provider}`
      const records = allRecords.get(key)!
      await uploadDataset(domain, provider, records, config)
    }

    // ✅ 新增：上传成功后更新 meta.json
    console.log('[WebDAV] Updating meta.json after upload...')
    const updatedMeta = await buildWebDAVMeta()
    await uploadMeta(updatedMeta, config)

    return {
      success: true,
      direction: 'upload',
      message: `已将本地数据覆盖到云端(${totalRecords} 条记录)`,
      timestamp: new Date().toISOString(),
      stats: {
        totalRecords: totalRecords,
        uploadedCount: totalRecords
      }
    }
  } catch (error) {
    console.error('[WebDAV] Upload and overwrite failed:', error)
    return {
      success: false,
      direction: 'upload',
      message: `上传失败: ${String(error)}`,
      timestamp: new Date().toISOString(),
    }
  }
}

// ==================== 辅助函数 ====================

/**
 * 下载 meta.json
 */
export async function downloadMeta(config: WebDAVConfig): Promise<WebDAVMeta | null> {
  try {
    const normalizedUrl = normalizeWebDAVUrl(config.url)
    const response = await fetch(`${normalizedUrl}/umm-data/meta.json`, {
      method: 'GET',
      headers: {
        Authorization: buildAuthHeader(config.username, config.password),
      },
    })

    if (!response.ok) {
      if (response.status === 404) {
        console.log('[WebDAV] meta.json not found, will create new one')
        return null
      }
      throw new Error(`Failed to download meta: ${response.statusText}`)
    }

    const jsonData = await response.text()
    return JSON.parse(jsonData) as WebDAVMeta
  } catch (error) {
    console.error('[WebDAV] Failed to download meta:', error)
    return null
  }
}

/**
 * 上传 meta.json
 */
export async function uploadMeta(meta: WebDAVMeta, config: WebDAVConfig): Promise<void> {
  try {
    const normalizedUrl = normalizeWebDAVUrl(config.url)
    const jsonData = JSON.stringify(meta, null, 2)
    const blob = new Blob([jsonData], { type: 'application/json' })

    const response = await fetch(`${normalizedUrl}/umm-data/meta.json`, {
      method: 'PUT',
      headers: {
        Authorization: buildAuthHeader(config.username, config.password),
        'Content-Type': 'application/json',
      },
      body: blob,
    })

    if (!response.ok) {
      throw new Error(`Failed to upload meta: ${response.statusText}`)
    }

    console.log('[WebDAV] meta.json uploaded successfully')
  } catch (error) {
    console.error('[WebDAV] Failed to upload meta:', error)
    throw error
  }
}

/**
 * 对比本地和云端 Meta，返回需要同步的数据集列表
 */
export function compareMeta(
  localMeta: WebDAVMeta,
  remoteMeta: WebDAVMeta
): {
  needUpload: string[]    // 需要上传的数据集 key 列表
  needDownload: string[]  // 需要下载的数据集 key 列表
  unchanged: string[]     // 无需同步的数据集 key 列表
} {
  const needUpload: string[] = []
  const needDownload: string[] = []
  const unchanged: string[] = []

  // 构建远程数据集映射
  const remoteMap = new Map(remoteMeta.datasets.map(d => [d.key, d]))

  // 遍历本地数据集
  for (const local of localMeta.datasets) {
    const remote = remoteMap.get(local.key)

    if (!remote) {
      // 云端不存在，需要上传
      needUpload.push(local.key)
    } else if (local.hash !== remote.hash) {
      // 哈希不同，比较时间戳决定方向
      const localTime = new Date(local.timestamp).getTime()
      const remoteTime = new Date(remote.timestamp).getTime()

      if (localTime > remoteTime) {
        needUpload.push(local.key)
      } else if (remoteTime > localTime) {
        needDownload.push(local.key)
      } else {
        // 时间戳相同但哈希不同，标记为冲突（保守策略：跳过）
        console.warn(`[WebDAV] Conflict detected for ${local.key}, skipping`)
        unchanged.push(local.key)
      }
    } else {
      // 哈希相同，无需同步
      unchanged.push(local.key)
    }
  }

  // 检查云端有但本地没有的数据集
  const localKeys = new Set(localMeta.datasets.map(d => d.key))
  for (const remote of remoteMeta.datasets) {
    if (!localKeys.has(remote.key)) {
      needDownload.push(remote.key)
    }
  }

  return { needUpload, needDownload, unchanged }
}

/**
 * 检查云端元数据版本
 */
async function checkCloudMetadata(config: WebDAVConfig): Promise<{ compatible: boolean; message?: string }> {
  // 下载任意一个数据集的 ZIP 文件来检查 metadata
  const [domain, provider] = CONFIG.DATASET_ORDER[0]
  const fileName = `${domain}-${provider}.zip`
  const normalizedUrl = normalizeWebDAVUrl(config.url)
  const url = `${normalizedUrl}/umm-data/${fileName}`
  
  try {
    const response = await fetch(url, {
      headers: { Authorization: buildAuthHeader(config.username, config.password) }
    })
    
    if (!response.ok) {
      // 如果文件不存在，可能是旧格式或没有数据
      return { compatible: true, message: 'No cloud data found, will upload local data' }
    }
    
    const zipBlob = await response.blob()
    const { metadata } = await zipBlobToObject(zipBlob)
    
    const compatibility = await checkFormatCompatibility(metadata)
    
    if (!compatibility.compatible) {
      return { 
        compatible: false, 
        message: `云端数据格式版本 ${metadata.format} 高于本地支持的最高版本，请更新扩展` 
      }
    }
    
    return { compatible: true }
  } catch (error) {
    console.error('[WebDAV] Failed to check cloud metadata:', error)
    return { compatible: true, message: 'Could not verify cloud version, proceeding with caution' }
  }
}
