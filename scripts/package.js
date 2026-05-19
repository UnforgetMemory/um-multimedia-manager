/**
 * Package script to create distributable ZIP file with version control
 * Features:
 * - Automatic version bumping (major/minor/patch)
 * - Git tag creation
 * - Changelog generation
 * - ZIP packaging with timestamp
 * - Build verification before packaging
 */

import { execSync } from 'child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync, createWriteStream } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { ZipArchive } = require('archiver')

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const rootDir = join(__dirname, '..')
const distDir = join(rootDir, 'dist')
const packageJsonPath = join(rootDir, 'package.json')
const manifestPath = join(rootDir, 'manifest.json')
const releasesDir = join(rootDir, 'releases')

// ==================== 配置 ====================

const CONFIG = {
  // 版本号递增策略
  versionBump: process.argv[2] || 'patch', // 'major' | 'minor' | 'patch' | 'none'
  
  // 是否创建 Git tag
  createGitTag: true,
  
  // 是否生成 changelog
  generateChangelog: true,
  
  // ZIP 文件名格式
  zipFileNamePattern: 'umm-multimedia-manager-{version}-{timestamp}.zip',
  
  // 需要排除的文件/目录
  excludePatterns: [
    '**/node_modules/**',
    '**/.git/**',
    '**/tests/**',
    '**/*.spec.ts',
    '**/*.test.ts',
    '**/.env*',
    '**/README.md',
    '**/LICENSE',
    '**/scripts/**',
    '**/src/**',
    '**/public/**',
    '**/*.config.*',
    '**/tsconfig*.json',
    '**/package-lock.json',
    '**/.agents/**',
  ]
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
 * 获取当前 Git 分支
 */
function getCurrentBranch() {
  return execCommand('git branch --show-current')
}

/**
 * 检查是否有未提交的更改
 */
function hasUncommittedChanges() {
  const status = execCommand('git status --porcelain', { ignoreError: true })
  return status.length > 0
}

/**
 * 获取最近的 commit 信息
 */
function getRecentCommits(count = 10) {
  return execCommand(`git log --oneline -${count}`)
}

/**
 * 递增版本号
 */
function bumpVersion(currentVersion, type) {
  const [major, minor, patch] = currentVersion.split('.').map(Number)
  
  switch (type) {
    case 'major':
      return `${major + 1}.0.0`
    case 'minor':
      return `${major}.${minor + 1}.0`
    case 'patch':
      return `${major}.${minor}.${patch + 1}`
    case 'none':
    default:
      return currentVersion
  }
}

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
 * 生成 changelog
 */
function generateChangelog(newVersion, oldVersion) {
  const commits = getRecentCommits(20)
  const timestamp = new Date().toISOString()
  
  const changelog = `# Changelog\n\n## [${newVersion}] - ${new Date().toLocaleDateString('zh-CN')}\n\n### Changes\n\n${commits.split('\n').map(commit => `- ${commit}`).join('\n')}\n\n---\n\nPrevious version: ${oldVersion}\nGenerated at: ${timestamp}\n`
  
  return changelog
}

// ==================== 主流程 ====================

async function main() {
  console.log('📦 UMM Extension Packager\n')
  console.log('='.repeat(60))
  
  // 1. 验证构建产物
  console.log('\n📋 Step 1: Verifying build artifacts...')
  if (!existsSync(distDir)) {
    console.error('❌ Error: dist directory not found. Please run "npm run build" first.')
    process.exit(1)
  }
  
  const distFiles = execCommand('ls dist', { ignoreError: true }).split('\n').filter(Boolean)
  console.log(`✓ Found ${distFiles.length} files in dist directory`)
  
  // 2. 读取当前版本
  console.log('\n📋 Step 2: Reading current version...')
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
  
  const currentVersion = packageJson.version
  console.log(`Current version: ${currentVersion}`)
  console.log(`Version bump strategy: ${CONFIG.versionBump}`)
  
  // 3. 计算新版本号
  let newVersion = currentVersion
  if (CONFIG.versionBump !== 'none') {
    newVersion = bumpVersion(currentVersion, CONFIG.versionBump)
    console.log(`New version: ${newVersion}`)
    
    // 更新 package.json
    packageJson.version = newVersion
    writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf-8')
    console.log('✓ Updated package.json')
    
    // 更新 manifest.json
    manifest.version = newVersion
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8')
    console.log('✓ Updated manifest.json')
  } else {
    console.log('⚠ Skipping version bump (strategy: none)')
  }
  
  // 4. 检查 Git 状态
  console.log('\n📋 Step 3: Checking Git status...')
  const branch = getCurrentBranch()
  console.log(`Current branch: ${branch}`)
  
  if (hasUncommittedChanges()) {
    console.warn('⚠ Warning: You have uncommitted changes!')
    const shouldContinue = true // 可以改为交互式确认
    if (!shouldContinue) {
      console.log('Aborted by user')
      process.exit(0)
    }
  }
  
  // 5. 生成 changelog
  if (CONFIG.generateChangelog && newVersion !== currentVersion) {
    console.log('\n📋 Step 4: Generating changelog...')
    const changelog = generateChangelog(newVersion, currentVersion)
    const changelogPath = join(releasesDir, `CHANGELOG-${newVersion}.md`)
    
    if (!existsSync(releasesDir)) {
      mkdirSync(releasesDir, { recursive: true })
    }
    
    writeFileSync(changelogPath, changelog, 'utf-8')
    console.log(`✓ Changelog saved to: ${changelogPath}`)
  }
  
  // 6. 创建 ZIP 文件
  console.log('\n📋 Step 5: Creating ZIP package...')
  const timestamp = formatTimestamp()
  const zipFileName = CONFIG.zipFileNamePattern
    .replace('{version}', newVersion)
    .replace('{timestamp}', timestamp)
  
  const zipPath = join(releasesDir, zipFileName)
  
  if (!existsSync(releasesDir)) {
    mkdirSync(releasesDir, { recursive: true })
  }
  
  await createZip(distDir, zipPath)
  console.log(`✓ ZIP package created: ${zipPath}`)
  
  // 7. 创建 Git tag（可选）
  if (CONFIG.createGitTag && newVersion !== currentVersion) {
    console.log('\n📋 Step 6: Creating Git tag...')
    try {
      execCommand(`git add package.json manifest.json`)
      execCommand(`git commit -m "chore: bump version to ${newVersion}"`)
      execCommand(`git tag -a v${newVersion} -m "Release version ${newVersion}"`)
      console.log(`✓ Git tag v${newVersion} created`)
      console.log('💡 Tip: Run "git push origin main --tags" to push the tag')
    } catch (error) {
      console.warn('⚠ Failed to create Git tag (this is optional)')
    }
  }
  
  // 8. 输出总结
  console.log('\n' + '='.repeat(60))
  console.log('✅ Packaging completed successfully!\n')
  console.log(`📦 Version: ${currentVersion} → ${newVersion}`)
  console.log(`📁 Package: ${zipPath}`)
  console.log(`🌿 Branch: ${branch}`)
  console.log('\nNext steps:')
  console.log('  1. Test the extension by loading the ZIP contents in Chrome')
  console.log('  2. Submit to Chrome Web Store (if applicable)')
  if (CONFIG.createGitTag && newVersion !== currentVersion) {
    console.log('  3. Push git changes and tags: git push origin main --tags')
  }
  console.log('='.repeat(60))
}

/**
 * 创建 ZIP 文件
 */
function createZip(sourceDir, outputPath) {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(outputPath)
    const archive = new ZipArchive({
      zlib: { level: 9 } // 最高压缩级别
    })
    
    output.on('close', () => {
      const sizeInMB = (archive.pointer() / 1024 / 1024).toFixed(2)
      console.log(`  Archive size: ${sizeInMB} MB`)
      console.log(`  Total entries: ${archive.pointer()} bytes`)
      resolve()
    })
    
    archive.on('error', (err) => {
      reject(err)
    })
    
    archive.pipe(output)
    
    // 添加 dist 目录的所有文件
    archive.directory(sourceDir, false, (entry) => {
      // 过滤不需要的文件
      const shouldExclude = CONFIG.excludePatterns.some(pattern => {
        // 简单的 glob 匹配
        if (pattern.endsWith('/**')) {
          const dirName = pattern.replace('/**', '')
          return entry.name.startsWith(dirName + '/')
        }
        return false
      })
      
      if (shouldExclude) {
        return false
      }
      return entry
    })
    
    archive.finalize()
  })
}

// 运行主流程
main().catch((error) => {
  console.error('\n❌ Packaging failed:', error.message)
  console.error(error.stack)
  process.exit(1)
})
