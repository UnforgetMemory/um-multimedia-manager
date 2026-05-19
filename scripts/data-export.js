/**
 * Data export script - Export IndexedDB data to ZIP archive
 * Features:
 * - Export all media records from IndexedDB
 * - Create ZIP archive with timestamp and version naming
 * - Include metadata (version, export time, record count)
 * - Support selective export by provider/type
 */

import { execSync } from 'child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { createRequire } from 'module'
import { createWriteStream } from 'fs'

const require = createRequire(import.meta.url)
const AdmZip = require('adm-zip')

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const rootDir = join(__dirname, '..')
const packageJsonPath = join(rootDir, 'package.json')
const manifestPath = join(rootDir, 'manifest.json')
const exportsDir = join(rootDir, 'data-exports')

// ==================== 配置 ====================

const CONFIG = {
  // ZIP 文件名格式
  zipFileNamePattern: 'umm-data-export-{version}-{timestamp}.zip',
  
  // 默认导出目录
  defaultExportDir: exportsDir,
  
  // 是否包含元数据文件
  includeMetadata: true,
  
  // 元数据文件名
  metadataFileName: 'export-metadata.json'
}

// ==================== 工具函数 ====================

/**
 * 格式化时间戳
 */
function formatTimestamp(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  
  return `${year}${month}${day}-${hours}${minutes}${seconds}`
}

/**
 * 获取当前版本号
 */
function getCurrentVersion() {
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
    return manifest.version || 'unknown'
  } catch (error) {
    console.warn('⚠ Failed to read version from manifest.json')
    return 'unknown'
  }
}

/**
 * 生成元数据
 */
function generateMetadata(recordCount, filters) {
  const version = getCurrentVersion()
  const timestamp = new Date().toISOString()
  
  return {
    version,
    exportTime: timestamp,
    recordCount,
    filters: filters || {},
    tool: 'umm-data-exporter',
    format: 'v1.0'
  }
}

// ==================== Chrome Extension API 调用 ====================

/**
 * 从 Background 导出数据
 * 注意：这个脚本需要在扩展环境中运行，或通过 chrome.debugging API
 */
async function exportDataFromExtension(filters) {
  console.log('📤 UMM Data Exporter\n')
  console.log('='.repeat(60))
  
  // 1. 读取版本信息
  console.log('\n📋 Step 1: Reading version info...')
  const version = getCurrentVersion()
  console.log(`  Current version: ${version}`)
  
  // 2. 准备导出目录
  console.log('\n📋 Step 2: Preparing export directory...')
  const exportDir = CONFIG.defaultExportDir
  if (!existsSync(exportDir)) {
    mkdirSync(exportDir, { recursive: true })
    console.log(`  ✓ Created directory: ${exportDir}`)
  } else {
    console.log(`  ✓ Using directory: ${exportDir}`)
  }
  
  // 3. 生成 ZIP 文件名
  console.log('\n📋 Step 3: Generating filename...')
  const timestamp = formatTimestamp()
  const zipFileName = CONFIG.zipFileNamePattern
    .replace('{version}', version)
    .replace('{timestamp}', timestamp)
  
  const zipPath = join(exportDir, zipFileName)
  console.log(`  Filename: ${zipFileName}`)
  
  // 4. 提示用户在浏览器中操作
  console.log('\n' + '='.repeat(60))
  console.log('⚠️  IMPORTANT: Manual Steps Required\n')
  console.log('由于安全限制，此脚本无法直接访问 IndexedDB。')
  console.log('请按照以下步骤导出数据：\n')
  console.log('1. 打开 Chrome 并加载 UMM 扩展')
  console.log('2. 打开扩展的 Popup 界面')
  console.log('3. 进入"设置" → "数据管理"')
  console.log('4. 点击"导出数据"按钮')
  console.log('5. 选择导出选项（全量/按平台/按类型）')
  console.log('6. 保存导出的 JSON 文件')
  console.log('7. 将 JSON 文件放入以下目录：')
  console.log(`   ${exportDir}`)
  console.log('8. 运行以下命令创建 ZIP 包：')
  console.log(`   node scripts/pack-export.js ${zipFileName.replace('.zip', '.json')}`)
  console.log('\n' + '='.repeat(60))
  
  return {
    version,
    timestamp,
    zipPath,
    exportDir
  }
}

/**
 * 将导出的 JSON 文件打包为 ZIP
 */
function packExportToJson(jsonFilePath) {
  console.log('📦 Packing exported data to ZIP...\n')
  
  if (!existsSync(jsonFilePath)) {
    console.error(`❌ File not found: ${jsonFilePath}`)
    process.exit(1)
  }
  
  // 读取 JSON 数据
  const jsonData = readFileSync(jsonFilePath, 'utf-8')
  let data
  try {
    data = JSON.parse(jsonData)
  } catch (error) {
    console.error('❌ Invalid JSON file:', error.message)
    process.exit(1)
  }
  
  const recordCount = Array.isArray(data) ? data.length : 
                     (data.records ? data.records.length : 0)
  
  console.log(`  Records found: ${recordCount}`)
  
  // 生成元数据
  if (CONFIG.includeMetadata) {
    const metadata = generateMetadata(recordCount)
    const metadataPath = join(exportsDir, CONFIG.metadataFileName)
    writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8')
    console.log(`  ✓ Metadata saved: ${metadataPath}`)
  }
  
  // 创建 ZIP
  const baseName = jsonFilePath.replace('.json', '')
  const zipPath = baseName + '.zip'
  
  const zip = new AdmZip()
  zip.addLocalFile(jsonFilePath)
  
  if (CONFIG.includeMetadata) {
    zip.addLocalFile(join(exportsDir, CONFIG.metadataFileName))
  }
  
  zip.writeZip(zipPath)
  
  const stats = require('fs').statSync(zipPath)
  const sizeInKB = (stats.size / 1024).toFixed(2)
  
  console.log(`  ✓ ZIP created: ${zipPath}`)
  console.log(`  ✓ Size: ${sizeInKB} KB`)
  console.log('\n✅ Export completed!')
  
  return zipPath
}

// ==================== 主流程 ====================

async function main() {
  const mode = process.argv[2] // 'export' or 'pack'
  const filePath = process.argv[3] // JSON file path for pack mode
  
  if (mode === 'pack' && filePath) {
    // 打包模式：将 JSON 转为 ZIP
    packExportToJson(filePath)
  } else {
    // 导出模式：提示用户手动操作
    await exportDataFromExtension()
  }
}

main().catch((error) => {
  console.error('\n❌ Operation failed:', error.message)
  console.error(error.stack)
  process.exit(1)
})
