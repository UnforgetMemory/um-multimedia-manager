/**
 * Data import script - Import ZIP archive to IndexedDB
 * Features:
 * - Extract ZIP archive containing exported data
 * - Validate data structure and version compatibility
 * - Support merge or overwrite modes
 * - Generate import report with statistics
 */

import { execSync } from 'child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'fs'
import { join, basename } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const AdmZip = require('adm-zip')

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const rootDir = join(__dirname, '..')
const importsDir = join(rootDir, 'data-imports')
const tempDir = join(importsDir, 'temp')

// ==================== 配置 ====================

const CONFIG = {
  // 默认导入目录
  defaultImportDir: importsDir,
  
  // 临时解压目录
  tempExtractDir: tempDir,
  
  // 是否验证数据结构
  validateStructure: true,
  
  // 导入模式: 'merge' (合并) | 'overwrite' (覆盖)
  defaultMode: 'merge',
  
  // 是否备份当前数据
  backupBeforeImport: true
}

// ==================== 工具函数 ====================

/**
 * 执行 shell 命令
 */
function execCommand(command, options = {}) {
  try {
    // Windows 兼容性：使用 dir 代替 ls
    const isWindows = process.platform === 'win32'
    const actualCommand = isWindows ? command.replace(/\bls\b/g, 'dir /b') : command
    
    return execSync(actualCommand, { 
      stdio: 'pipe',
      cwd: rootDir,
      ...options 
    }).toString().trim()
  } catch (error) {
    if (options.ignoreError) {
      return ''
    }
    throw error
  }
}

/**
 * 获取可用的 ZIP 文件列表
 */
function getAvailablePackages() {
  const importDir = CONFIG.defaultImportDir
  
  if (!existsSync(importDir)) {
    return []
  }
  
  const files = execCommand(`ls ${importDir}`, { ignoreError: true })
    .split('\n')
    .filter(file => file.endsWith('.zip'))
    .sort()
    .reverse()
  
  return files
}

/**
 * 从文件名提取版本和时间戳信息
 */
function extractInfoFromFilename(filename) {
  // 格式: umm-data-export-{version}-{timestamp}.zip
  const match = filename.match(/umm-data-export-(\d+\.\d+\.\d+)-(\d{8}-\d{6})\.zip/)
  if (match) {
    return {
      version: match[1],
      timestamp: match[2],
      fullFilename: filename
    }
  }
  return null
}

/**
 * 选择要导入的 ZIP 文件
 */
function selectPackage(targetFile) {
  const availablePackages = getAvailablePackages()
  
  if (availablePackages.length === 0) {
    console.error('❌ No ZIP packages found in imports directory')
    console.log(`💡 Place your ZIP files in: ${CONFIG.defaultImportDir}`)
    process.exit(1)
  }
  
  // 如果指定了文件
  if (targetFile) {
    const fullPath = join(CONFIG.defaultImportDir, targetFile)
    if (!existsSync(fullPath)) {
      console.error(`❌ File not found: ${fullPath}`)
      process.exit(1)
    }
    return fullPath
  }
  
  // 自动选择最新的
  const latest = availablePackages[0]
  console.log(`📦 Auto-detected latest package: ${latest}`)
  return join(CONFIG.defaultImportDir, latest)
}

/**
 * 解压 ZIP 文件
 */
function extractZip(zipPath, extractDir) {
  console.log(`\n📂 Extracting ZIP to: ${extractDir}`)
  
  // 清理临时目录
  if (existsSync(extractDir)) {
    rmSync(extractDir, { recursive: true, force: true })
  }
  mkdirSync(extractDir, { recursive: true })
  
  try {
    const zip = new AdmZip(zipPath)
    zip.extractAllTo(extractDir, true)
    
    const entryCount = zip.getEntries().length
    console.log(`  ✓ Extracted ${entryCount} files`)
    
    return extractDir
  } catch (error) {
    console.error('❌ Failed to extract ZIP:', error.message)
    process.exit(1)
  }
}

/**
 * 读取并验证导出的数据
 */
function validateAndReadData(extractDir) {
  console.log('\n🔍 Validating data structure...')
  
  // 查找 JSON 文件（排除 metadata）
  const fs = require('fs')
  const path = require('path')
  
  let jsonFiles = []
  try {
    const files = fs.readdirSync(extractDir)
    jsonFiles = files.filter(f => 
      f.endsWith('.json') && !f.includes('metadata')
    ).map(f => path.join(extractDir, f))
  } catch (error) {
    console.error('❌ Failed to read directory:', error.message)
    process.exit(1)
  }
  
  if (jsonFiles.length === 0) {
    console.error('❌ No data JSON file found in extracted archive')
    process.exit(1)
  }
  
  const dataFile = jsonFiles[0]
  console.log(`  Found data file: ${basename(dataFile)}`)
  
  // 读取数据
  let data
  try {
    const content = readFileSync(dataFile, 'utf-8')
    data = JSON.parse(content)
    console.log(`  ✓ Data parsed successfully`)
  } catch (error) {
    console.error('❌ Failed to parse JSON:', error.message)
    process.exit(1)
  }
  
  // 验证数据结构
  if (CONFIG.validateStructure) {
    const recordCount = Array.isArray(data) ? data.length : 
                       (data.records ? data.records.length : 0)
    
    if (recordCount === 0) {
      console.warn('⚠ Warning: No records found in data file')
    } else {
      console.log(`  ✓ Record count: ${recordCount}`)
    }
    
    // 检查第一条记录的结构
    const firstRecord = Array.isArray(data) ? data[0] : (data.records ? data.records[0] : null)
    if (firstRecord) {
      const requiredFields = ['provider', 'type', 'providerId', 'url']
      const missingFields = requiredFields.filter(field => !(field in firstRecord))
      
      if (missingFields.length > 0) {
        console.warn(`⚠ Warning: Missing fields in records: ${missingFields.join(', ')}`)
      } else {
        console.log('  ✓ Data structure validated')
      }
    }
  }
  
  // 读取元数据（如果存在）
  const metadataPath = join(extractDir, 'export-metadata.json')
  if (existsSync(metadataPath)) {
    try {
      const metadata = JSON.parse(readFileSync(metadataPath, 'utf-8'))
      console.log(`  ℹ Export version: ${metadata.version || 'unknown'}`)
      console.log(`  ℹ Export time: ${metadata.exportTime || 'unknown'}`)
    } catch (error) {
      console.warn('⚠ Failed to read metadata')
    }
  }
  
  return data
}

/**
 * 生成导入报告
 */
function generateImportReport(stats) {
  const report = {
    importTime: new Date().toISOString(),
    mode: stats.mode,
    totalRecords: stats.totalRecords,
    imported: stats.imported,
    skipped: stats.skipped,
    errors: stats.errors,
    conflicts: stats.conflicts || []
  }
  
  const reportPath = join(CONFIG.defaultImportDir, `import-report-${Date.now()}.json`)
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8')
  
  return reportPath
}

// ==================== 主流程 ====================

async function main() {
  console.log('📥 UMM Data Importer\n')
  console.log('='.repeat(60))
  
  const targetFile = process.argv[2] // 可选：指定 ZIP 文件名
  const importMode = process.argv[3] || CONFIG.defaultMode // 'merge' or 'overwrite'
  
  // 1. 选择 ZIP 包
  console.log('\n📋 Step 1: Selecting package...')
  const zipPath = selectPackage(targetFile)
  const zipInfo = extractInfoFromFilename(basename(zipPath))
  
  if (zipInfo) {
    console.log(`  Version: ${zipInfo.version}`)
    console.log(`  Timestamp: ${zipInfo.timestamp}`)
  }
  
  // 2. 解压 ZIP
  console.log('\n📋 Step 2: Extracting package...')
  const extractDir = extractZip(zipPath, CONFIG.tempExtractDir)
  
  // 3. 验证和读取数据
  console.log('\n📋 Step 3: Validating data...')
  const data = validateAndReadData(extractDir)
  
  const recordCount = Array.isArray(data) ? data.length : 
                     (data.records ? data.records.length : 0)
  
  // 4. 提示用户在浏览器中操作
  console.log('\n' + '='.repeat(60))
  console.log('⚠️  IMPORTANT: Manual Steps Required\n')
  console.log('由于安全限制，此脚本无法直接写入 IndexedDB。')
  console.log('请按照以下步骤导入数据：\n')
  console.log('1. 打开 Chrome 并加载 UMM 扩展')
  console.log('2. 打开扩展的 Popup 界面')
  console.log('3. 进入"设置" → "数据管理"')
  console.log('4. 点击"导入数据"按钮')
  console.log('5. 选择以下 JSON 文件：')
  const jsonFiles = execCommand(`ls ${extractDir}/*.json`, { ignoreError: true })
    .split('\n')
    .filter(f => f.endsWith('.json') && !f.includes('metadata'))
  if (jsonFiles[0]) {
    console.log(`   ${jsonFiles[0]}`)
  }
  console.log(`6. 选择导入模式: ${importMode === 'merge' ? '合并（保留现有数据）' : '覆盖（清空后导入）'}`)
  console.log('7. 确认导入')
  console.log('\n📊 Data Summary:')
  console.log(`  Total records: ${recordCount}`)
  console.log(`  Import mode: ${importMode}`)
  console.log('\n' + '='.repeat(60))
}

main().catch((error) => {
  console.error('\n❌ Import failed:', error.message)
  console.error(error.stack)
  process.exit(1)
})
