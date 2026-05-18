/**
 * 数据迁移工具：将旧版油猴脚本导出格式转换为新版 Chrome 扩展格式
 * 
 * 主要变更：
 * 1. datasets 结构从 domain->provider 改为 provider->type
 * 2. status 从字符串 ('done'/'wish'/'none') 转为数字 (2/1/0)
 * 3. rating10 字段重命名为 rating
 * 4. 移除 domain 字段，添加 type 字段
 */

import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// ==================== 类型定义 ====================

interface OldMediaRecord {
  domain: string
  provider: string
  providerId: string
  url: string
  status: string  // 'done' | 'wish' | 'none'
  rating10?: number
  updatedAt?: string
}

interface NewMediaRecord {
  provider: string
  type: string
  providerId: string
  url: string
  status: number  // 0 | 1 | 2
  rating: number
  updatedAt?: string
}

interface OldExportData {
  schema: string
  version: number
  exportedAt: string
  datasets: {
    [domain: string]: {
      [provider: string]: OldMediaRecord[]
    }
  }
  quarantine?: any[]
  settings?: any
}

interface NewExportData {
  schema: string
  version: number
  exportedAt: string
  datasets: {
    [provider: string]: {
      [type: string]: NewMediaRecord[]
    }
  }
  quarantine?: any[]
  settings?: any
}

// ==================== 转换逻辑 ====================

/**
 * 状态映射：字符串 -> 数字
 */
function mapStatus(oldStatus: string): number {
  const statusMap: Record<string, number> = {
    'done': 2,   // 已看/已听
    'wish': 1,   // 在看/想听
    'none': 0,   // 未看/未听
  }
  return statusMap[oldStatus] ?? 0
}

/**
 * 转换单条记录
 */
function convertRecord(oldRecord: OldMediaRecord): NewMediaRecord {
  return {
    provider: oldRecord.provider,
    type: oldRecord.domain,  // domain -> type
    providerId: oldRecord.providerId,
    url: oldRecord.url,
    status: mapStatus(oldRecord.status),
    rating: oldRecord.rating10 ?? 0,  // rating10 -> rating
    updatedAt: oldRecord.updatedAt,
  }
}

/**
 * 转换整个数据集
 */
function convertDatasets(
  oldDatasets: OldExportData['datasets']
): NewExportData['datasets'] {
  const newDatasets: NewExportData['datasets'] = {}

  // 遍历旧结构：domain -> provider -> records
  for (const [domain, providers] of Object.entries(oldDatasets)) {
    for (const [provider, records] of Object.entries(providers)) {
      // 初始化新结构
      if (!newDatasets[provider]) {
        newDatasets[provider] = {}
      }
      if (!newDatasets[provider][domain]) {
        newDatasets[provider][domain] = []
      }

      // 转换每条记录
      for (const oldRecord of records) {
        const newRecord = convertRecord(oldRecord)
        newDatasets[provider][domain].push(newRecord)
      }
    }
  }

  return newDatasets
}

/**
 * 主转换函数
 */
function migrateData(inputFile: string, outputFile: string): void {
  console.log(`📖 读取旧版数据: ${inputFile}`)
  
  const rawData = readFileSync(inputFile, 'utf-8')
  const oldData: OldExportData = JSON.parse(rawData)

  console.log(`📊 旧版数据统计:`)
  console.log(`   - Schema: ${oldData.schema}`)
  console.log(`   - Version: ${oldData.version}`)
  console.log(`   - Exported At: ${oldData.exportedAt}`)
  
  // 统计旧版记录数
  let oldRecordCount = 0
  for (const domain in oldData.datasets) {
    for (const provider in oldData.datasets[domain]) {
      oldRecordCount += oldData.datasets[domain][provider].length
    }
  }
  console.log(`   - Total Records: ${oldRecordCount}`)

  // 执行转换
  console.log(`\n🔄 开始转换...`)
  const newData: NewExportData = {
    schema: oldData.schema,
    version: 3,  // 升级到 v3
    exportedAt: new Date().toISOString(),
    datasets: convertDatasets(oldData.datasets),
    quarantine: oldData.quarantine || [],
    settings: oldData.settings || {},
  }

  // 统计新版记录数
  let newRecordCount = 0
  for (const provider in newData.datasets) {
    for (const type in newData.datasets[provider]) {
      newRecordCount += newData.datasets[provider][type].length
    }
  }
  console.log(`✅ 转换完成!`)
  console.log(`📊 新版数据统计:`)
  console.log(`   - Schema: ${newData.schema}`)
  console.log(`   - Version: ${newData.version}`)
  console.log(`   - Total Records: ${newRecordCount}`)

  // 验证数据完整性
  if (oldRecordCount !== newRecordCount) {
    console.warn(`⚠️  警告: 记录数不匹配! 旧版=${oldRecordCount}, 新版=${newRecordCount}`)
  } else {
    console.log(`✅ 数据完整性验证通过`)
  }

  // 写入新文件
  console.log(`\n💾 写入新版数据: ${outputFile}`)
  writeFileSync(outputFile, JSON.stringify(newData, null, 2), 'utf-8')
  
  const fileSize = Buffer.byteLength(JSON.stringify(newData), 'utf-8')
  console.log(`📦 文件大小: ${(fileSize / 1024 / 1024).toFixed(2)} MB`)
  console.log(`\n✨ 迁移完成！`)
}

// ==================== 执行 ====================

const inputFile = join(__dirname, '..', '.agents', '0acdb0d9-ea59-42df-bf6b-d198c89a6348.json')
const outputFile = join(__dirname, '..', '.agents', 'migrated-export-v3.json')

try {
  migrateData(inputFile, outputFile)
} catch (error) {
  console.error('❌ 迁移失败:', error)
  process.exit(1)
}
