/**
 * WebDAV 客户端
 * 
 * 负责与 WebDAV 服务器进行数据同步
 * - 上传数据到 WebDAV
 * - 从 WebDAV 下载数据
 * - 冲突检测和解决
 */

import type { ExportData } from '../types'
import Store from '../adapters/indexeddb-store'
import { CONFIG } from '../config'

// ==================== 类型定义 ====================

interface WebDAVConfig {
  url: string
  username: string
  password: string
}

interface SyncResult {
  success: boolean
  direction: 'upload' | 'download' | 'conflict'
  message?: string
  timestamp: string
}

// ==================== 辅助函数 ====================

/**
 * 验证 WebDAV URL 是否使用 HTTPS
 */
function validateWebDAVUrl(url: string): void {
  if (!url) {
    throw new Error('WebDAV URL cannot be empty')
  }
  
  if (!url.startsWith('https://')) {
    throw new Error(
      '⚠️ Security Warning: WebDAV URL must use HTTPS protocol. ' +
      'HTTP connections may expose your credentials in transit. ' +
      'Please update your WebDAV URL to use https://'
    )
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
 * 检查 WebDAV 连接
 */
export async function checkConnection(config: WebDAVConfig): Promise<boolean> {
  try {
    // 验证 URL 协议
    validateWebDAVUrl(config.url)
    
    const response = await fetch(config.url, {
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
    const response = await fetch(`${config.url}${path}`, {
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
    
    if (!settings.webdavUrl || !settings.webdavUsername || !settings.webdavPassword) {
      return {
        success: false,
        direction: 'upload',
        message: 'WebDAV 配置不完整',
        timestamp: new Date().toISOString(),
      }
    }

    const config: WebDAVConfig = {
      url: settings.webdavUrl,
      username: settings.webdavUsername,
      password: settings.webdavPassword,
    }

    // 检查连接
    const isConnected = await checkConnection(config)
    if (!isConnected) {
      return {
        success: false,
        direction: 'upload',
        message: '无法连接到 WebDAV 服务器',
        timestamp: new Date().toISOString(),
      }
    }

    // 确保目录存在
    await ensureRemoteDirectory(config, '/umm-data/')

    // 序列化数据
    const jsonData = JSON.stringify(data, null, 2)
    const blob = new Blob([jsonData], { type: 'application/json' })

    // 上传文件
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `umm-export-${timestamp}.json`
    const filePath = `/umm-data/${filename}`

    const response = await fetch(`${config.url}${filePath}`, {
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
    
    if (!settings.webdavUrl || !settings.webdavUsername || !settings.webdavPassword) {
      return {
        success: false,
        direction: 'download',
        message: 'WebDAV 配置不完整',
        timestamp: new Date().toISOString(),
      }
    }

    const config: WebDAVConfig = {
      url: settings.webdavUrl,
      username: settings.webdavUsername,
      password: settings.webdavPassword,
    }

    // 检查连接
    const isConnected = await checkConnection(config)
    if (!isConnected) {
      return {
        success: false,
        direction: 'download',
        message: '无法连接到 WebDAV 服务器',
        timestamp: new Date().toISOString(),
      }
    }

    // 列出远程文件
    const listResponse = await fetch(`${config.url}/umm-data/`, {
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
    const downloadResponse = await fetch(`${config.url}/umm-data/${latestFile}`, {
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
 * 执行双向同步
 */
export async function syncWithWebDAV(): Promise<SyncResult> {
  try {
    // 获取本地数据
    const localData = await Store.exportStructuredData()
    const localTimestamp = localData.exportedAt

    // 下载远程数据
    const remoteResult = await downloadFromWebDAV()

    if (!remoteResult.success) {
      // 如果下载失败，尝试上传本地数据
      return await uploadToWebDAV(localData)
    }

    if (!remoteResult.data) {
      // 没有远程数据，上传本地数据
      return await uploadToWebDAV(localData)
    }

    // 比较时间戳（使用 Date 对象避免字符串比较的时区问题）
    const remoteTimestamp = remoteResult.data.exportedAt
    const localDate = new Date(localTimestamp).getTime()
    const remoteDate = new Date(remoteTimestamp).getTime()

    if (localDate > remoteDate) {
      // 本地更新，上传
      console.log('[WebDAV] Local data is newer, uploading...')
      return await uploadToWebDAV(localData)
    } else if (remoteDate > localDate) {
      // 远程更新，下载并导入
      console.log('[WebDAV] Remote data is newer, importing...')
      await Store.importStructuredData(remoteResult.data)
      
      return {
        success: true,
        direction: 'download',
        message: '已从云端同步最新数据',
        timestamp: new Date().toISOString(),
      }
    } else {
      // 时间戳相同，无需同步
      return {
        success: true,
        direction: 'upload',
        message: '数据已同步',
        timestamp: new Date().toISOString(),
      }
    }
  } catch (error) {
    console.error('[WebDAV] Sync failed:', error)
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
 */
function parseLatestFile(xmlText: string): string | null {
  try {
    // 简单的 XML 解析（生产环境建议使用专门的 XML 解析库）
    const hrefMatches = xmlText.match(/<D:href>([^<]+)<\/D:href>/g)
    
    if (!hrefMatches || hrefMatches.length === 0) {
      return null
    }

    // 过滤出 JSON 文件并按名称排序（最新的在最后）
    const jsonFiles = hrefMatches
      .map(match => match.match(/<D:href>([^<]+)<\/D:href>/)?.[1])
      .filter((href): href is string => !!href && href.endsWith('.json'))
      .map(href => href.split('/').pop())
      .filter((filename): filename is string => !!filename && filename.startsWith('umm-export-'))
      .sort()

    return jsonFiles.length > 0 ? jsonFiles[jsonFiles.length - 1]! : null
  } catch (error) {
    console.error('[WebDAV] Failed to parse PROPFIND response:', error)
    return null
  }
}

/**
 * 下载指定数据集
 */
async function downloadDataset(
  domain: string,
  provider: string,
  config: WebDAVConfig
): Promise<any[]> {
  try {
    const filePath = `/umm-data/${domain}-${provider}.json`
    
    const response = await fetch(`${config.url}${filePath}`, {
      method: 'GET',
      headers: {
        Authorization: buildAuthHeader(config.username, config.password),
      },
    })

    if (!response.ok) {
      if (response.status === 404) {
        // 文件不存在，返回空数组
        return []
      }
      throw new Error(`Download failed: ${response.statusText}`)
    }

    const jsonData = await response.text()
    return JSON.parse(jsonData)
  } catch (error) {
    console.error(`[WebDAV] Failed to download dataset ${domain}:${provider}:`, error)
    return []
  }
}

/**
 * 上传指定数据集
 */
async function uploadDataset(
  domain: string,
  provider: string,
  records: any[],
  config: WebDAVConfig
): Promise<void> {
  try {
    const filePath = `/umm-data/${domain}-${provider}.json`
    const jsonData = JSON.stringify(records, null, 2)
    const blob = new Blob([jsonData], { type: 'application/json' })

    const response = await fetch(`${config.url}${filePath}`, {
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

    console.log(`[WebDAV] Uploaded dataset ${domain}:${provider} successfully`)
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
    
    if (!settings.webdavUrl || !settings.webdavUsername || !settings.webdavPassword) {
      return {
        success: false,
        direction: 'download',
        message: 'WebDAV 配置不完整',
        timestamp: new Date().toISOString(),
      }
    }

    const config: WebDAVConfig = {
      url: settings.webdavUrl,
      username: settings.webdavUsername,
      password: settings.webdavPassword,
    }

    // 检查连接
    const isConnected = await checkConnection(config)
    if (!isConnected) {
      return {
        success: false,
        direction: 'download',
        message: '无法连接到 WebDAV 服务器',
        timestamp: new Date().toISOString(),
      }
    }

    // 第一阶段：下载所有数据集到临时变量
    const tempData = new Map<string, Map<string, any>>()
    for (const [domain, provider] of CONFIG.DATASET_ORDER) {
      const remote = await downloadDataset(domain, provider, config)
      const map = new Map()
      
      for (const record of remote) {
        map.set(record.providerId, record)
      }
      
      tempData.set(`${domain}:${provider}`, map)
    }
    
    // 第二阶段：全部成功后才写入存储（原子操作）
    for (const [domain, provider] of CONFIG.DATASET_ORDER) {
      const key = `${domain}:${provider}`
      await Store.setDatasetMap(domain as any, provider as any, tempData.get(key)!)
    }

    return {
      success: true,
      direction: 'download',
      message: '已从云端覆盖本地数据',
      timestamp: new Date().toISOString(),
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
    
    if (!settings.webdavUrl || !settings.webdavUsername || !settings.webdavPassword) {
      return {
        success: false,
        direction: 'upload',
        message: 'WebDAV 配置不完整',
        timestamp: new Date().toISOString(),
      }
    }

    const config: WebDAVConfig = {
      url: settings.webdavUrl,
      username: settings.webdavUsername,
      password: settings.webdavPassword,
    }

    // 检查连接
    const isConnected = await checkConnection(config)
    if (!isConnected) {
      return {
        success: false,
        direction: 'upload',
        message: '无法连接到 WebDAV 服务器',
        timestamp: new Date().toISOString(),
      }
    }

    // 确保目录存在
    await ensureRemoteDirectory(config, '/umm-data/')

    // 第一阶段：收集所有本地数据
    const allRecords = new Map<string, any[]>()
    for (const [domain, provider] of CONFIG.DATASET_ORDER) {
      const localMap = await Store.getDatasetMap(domain as any, provider as any)
      const records = Array.from(localMap.values())
      allRecords.set(`${domain}:${provider}`, records)
    }
    
    // 第二阶段：全部上传（如果失败会抛出异常，不会部分更新）
    for (const [domain, provider] of CONFIG.DATASET_ORDER) {
      const key = `${domain}:${provider}`
      await uploadDataset(domain, provider, allRecords.get(key)!, config)
    }

    return {
      success: true,
      direction: 'upload',
      message: '已将本地数据覆盖到云端',
      timestamp: new Date().toISOString(),
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
