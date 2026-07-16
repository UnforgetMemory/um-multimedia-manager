/**
 * Unpack script to extract and verify ZIP packages
 * Features:
 * - Extract ZIP package to target directory
 * - Verify file integrity (manifest.json, version check)
 * - Auto-detect latest release package
 * - Optional Chrome extension loading guidance
 * - Clean extraction with overwrite protection
 */

import { execSync } from 'child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'fs'
import { join, basename } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { createRequire } from 'module'
import { createReadStream } from 'fs'
import { promisify } from 'util'
import { pipeline } from 'stream'

const require = createRequire(import.meta.url)
const AdmZip = require('adm-zip')

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const rootDir = join(__dirname, '..')
const releasesDir = join(rootDir, 'releases')

// ==================== 配置 ====================

const CONFIG = {
  // 默认解压目录
  defaultExtractDir: join(rootDir, 'extracted'),
  
  // 是否覆盖已存在的目录
  forceOverwrite: false,
  
  // 是否验证 manifest.json
  validateManifest: true,
  
  // 自动检测最新的 ZIP 包
  autoDetectLatest: true
}

// ==================== 工具函数 ====================

/**
 * 执行 shell 命令
 */
function execCommand(command, options = {}) {
  try {
    return execSync(command, { 
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
 * 获取 releases 目录中的所有 ZIP 文件
 */
function getAvailablePackages() {
  if (!existsSync(releasesDir)) {
    return []
  }
  
  const files = execCommand(`ls ${releasesDir}`, { ignoreError: true })
    .split('\n')
    .filter(file => file.endsWith('.zip'))
    .sort()
    .reverse() // 最新的在前
  
  return files
}

/**
 * 从文件名中提取版本信息
 */
function extractVersionFromFilename(filename) {
  // 格式: umm-multimedia-manager-{version}-{timestamp}.zip
  const match = filename.match(/umm-multimedia-manager-(\d+\.\d+\.\d+)-(\d{8}-\d{6})\.zip/)
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
 * 选择要解压的 ZIP 文件
 */
function selectPackage(targetFile) {
  const availablePackages = getAvailablePackages()
  
  if (availablePackages.length === 0) {
    console.error('❌ No ZIP packages found in releases directory')
    console.log('💡 Tip: Run "npm run package" first to create a package')
    process.exit(1)
  }
  
  // 如果指定了文件
  if (targetFile) {
    const fullPath = join(releasesDir, targetFile)
    if (!existsSync(fullPath)) {
      console.error(`❌ File not found: ${fullPath}`)
      process.exit(1)
    }
    return fullPath
  }
  
  // 自动选择最新的
  if (CONFIG.autoDetectLatest) {
    const latest = availablePackages[0]
    console.log(`📦 Auto-detected latest package: ${latest}`)
    return join(releasesDir, latest)
  }
  
  // 显示列表让用户选择（简化版，默认选第一个）
  console.log('\n📋 Available packages:')
  availablePackages.forEach((pkg, index) => {
    const info = extractVersionFromFilename(pkg)
    if (info) {
      console.log(`  [${index + 1}] v${info.version} (${info.timestamp})`)
    } else {
      console.log(`  [${index + 1}] ${pkg}`)
    }
  })
  
  const latest = availablePackages[0]
  console.log(`\n✓ Using latest: ${latest}`)
  return join(releasesDir, latest)
}

/**
 * 验证解压后的扩展
 */
function validateExtension(extractDir) {
  console.log('\n🔍 Validating extracted extension...')
  
  const manifestPath = join(extractDir, 'manifest.json')
  if (!existsSync(manifestPath)) {
    console.error('❌ manifest.json not found in extracted directory')
    return false
  }
  
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
    
    console.log(`  ✓ Extension name: ${manifest.name || 'Unknown'}`)
    console.log(`  ✓ Version: ${manifest.version || 'Unknown'}`)
    console.log(`  ✓ Manifest version: ${manifest.manifest_version || 'Unknown'}`)
    
    // 检查必要字段
    const requiredFields = ['manifest_version', 'name', 'version']
    const missingFields = requiredFields.filter(field => !manifest[field])
    
    if (missingFields.length > 0) {
      console.error(`❌ Missing required fields: ${missingFields.join(', ')}`)
      return false
    }
    
    console.log('  ✓ All required fields present')
    return true
  } catch (error) {
    console.error('❌ Failed to parse manifest.json:', error.message)
    return false
  }
}

/**
 * 生成加载说明
 */
function generateLoadInstructions(extractDir) {
  console.log('\n' + '='.repeat(60))
  console.log('📖 How to load the extension in Chrome:\n')
  console.log('1. Open Chrome and navigate to:')
  console.log('   chrome://extensions/')
  console.log('\n2. Enable "Developer mode" (top right corner)')
  console.log('\n3. Click "Load unpacked" button')
  console.log('\n4. Select this directory:')
  console.log(`   ${extractDir}`)
  console.log('\n5. The extension should now be loaded! ✅')
  console.log('='.repeat(60))
}

// ==================== 主流程 ====================

async function main() {
  console.log('📂 UMM Extension Unpacker\n')
  console.log('='.repeat(60))
  
  const targetFile = process.argv[2] // 可选：指定 ZIP 文件名
  const customExtractDir = process.argv[3] // 可选：自定义解压目录
  
  // 1. 选择 ZIP 包
  console.log('\n📋 Step 1: Selecting package...')
  const zipPath = selectPackage(targetFile)
  const zipInfo = extractVersionFromFilename(basename(zipPath))
  
  if (zipInfo) {
    console.log(`  Version: ${zipInfo.version}`)
    console.log(`  Timestamp: ${zipInfo.timestamp}`)
  }
  
  // 2. 确定解压目录
  console.log('\n📋 Step 2: Preparing extraction directory...')
  const extractDir = customExtractDir || CONFIG.defaultExtractDir
  
  if (existsSync(extractDir)) {
    if (CONFIG.forceOverwrite) {
      console.log(`  ⚠ Removing existing directory: ${extractDir}`)
      rmSync(extractDir, { recursive: true, force: true })
    } else {
      console.error(`❌ Directory already exists: ${extractDir}`)
      console.log('💡 Use --force flag to overwrite, or specify a different directory')
      console.log('   Example: node scripts/unpack.js <zip-file> <new-directory>')
      process.exit(1)
    }
  }
  
  mkdirSync(extractDir, { recursive: true })
  console.log(`  ✓ Extraction directory: ${extractDir}`)
  
  // 3. 解压 ZIP 文件
  console.log('\n📋 Step 3: Extracting ZIP package...')
  try {
    const zip = new AdmZip(zipPath)
    zip.extractAllTo(extractDir, true) // true = overwrite
    
    const entryCount = zip.getEntries().length
    console.log(`  ✓ Extracted ${entryCount} files`)
  } catch (error) {
    console.error('❌ Failed to extract ZIP:', error.message)
    process.exit(1)
  }
  
  // 4. 验证扩展
  if (CONFIG.validateManifest) {
    const isValid = validateExtension(extractDir)
    if (!isValid) {
      console.warn('⚠ Extension validation failed, but files are extracted')
    }
  }
  
  // 5. 输出总结
  console.log('\n' + '='.repeat(60))
  console.log('✅ Unpacking completed successfully!\n')
  console.log(`📁 Extracted to: ${extractDir}`)
  if (zipInfo) {
    console.log(`📦 Package version: ${zipInfo.version}`)
  }
  
  // 6. 显示加载说明
  generateLoadInstructions(extractDir)
  
  console.log('\n💡 Tips:')
  console.log('  - To load a different package: node scripts/unpack.js <filename>')
  console.log('  - To use custom directory: node scripts/unpack.js <filename> <directory>')
  console.log('  - To force overwrite: set forceOverwrite = true in config')
  console.log('='.repeat(60))
}

// 运行主流程
main().catch((error) => {
  console.error('\n❌ Unpacking failed:', error.message)
  console.error(error.stack)
  process.exit(1)
})
