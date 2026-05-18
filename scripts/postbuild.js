/**
 * Post-build script to fix CRXJS path issues
 * Converts absolute paths to relative paths in popup.html
 * Fixes Background Service Worker loader to point to correct chunk
 * Copies icon files to dist/icons directory
 */

import { readFileSync, writeFileSync, readdirSync, statSync, copyFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const distDir = join(__dirname, '..', 'dist')
const popupHtmlPath = join(distDir, 'popup.html')
const manifestPath = join(distDir, 'manifest.json')

try {
  console.log('[PostBuild] Copying icon files...')
  
  // 确保 icons 目录存在
  const iconsDir = join(distDir, 'icons')
  if (!existsSync(iconsDir)) {
    mkdirSync(iconsDir, { recursive: true })
  }
  
  // 复制图标文件
  const iconFiles = ['icon-16.png', 'icon-48.png', 'icon-128.png']
  const srcIconsDir = join(__dirname, '..', 'icons')
  
  for (const iconFile of iconFiles) {
    const srcPath = join(srcIconsDir, iconFile)
    const destPath = join(iconsDir, iconFile)
    
    if (existsSync(srcPath)) {
      try {
        copyFileSync(srcPath, destPath)
        console.log(`[PostBuild] ✓ Copied ${iconFile}`)
      } catch (error) {
        console.error(`[PostBuild] ✗ Failed to copy ${iconFile}:`, error.message)
        throw error
      }
    } else {
      console.warn(`[PostBuild] ⚠ Icon file not found: ${iconFile}`)
    }
  }
  
  console.log('[PostBuild] Fixing popup.html paths...')
  
  let content = readFileSync(popupHtmlPath, 'utf-8')
  
  // Replace absolute paths with relative paths
  content = content.replace(/src="\/chunks\//g, 'src="./chunks/')
  content = content.replace(/href="\/assets\//g, 'href="./assets/')
  content = content.replace(/href="\/icons\//g, 'href="./icons/')
  
  writeFileSync(popupHtmlPath, content, 'utf-8')
  
  console.log('[PostBuild] ✓ popup.html paths fixed successfully')
  
  // ✅ 修复：修正 Background Service Worker loader
  console.log('[PostBuild] Fixing Background Service Worker loader...')
  
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
  const chunksDir = join(distDir, 'chunks')
  
  // 验证 chunks 目录存在
  if (!existsSync(chunksDir)) {
    console.error('[PostBuild] ✗ Chunks directory not found:', chunksDir)
    console.error('[PostBuild] Please run "npm run build" first')
    process.exit(1)
  }
  
  const chunkFiles = readdirSync(chunksDir).filter(f => f.endsWith('.js'))
  
  // 通过检查文件内容来识别 Background 和 Content Script chunk
  let backgroundChunk = null
  let contentChunk = null
  
  for (const file of chunkFiles) {
    const filePath = join(chunksDir, file)
    const fileContent = readFileSync(filePath, 'utf-8')
    
    // Background script 包含 chrome.runtime 或特定的初始化代码
    if (fileContent.includes('chrome.runtime.onMessage') || 
        fileContent.includes('chrome.storage') ||
        fileContent.includes('service-worker')) {
      backgroundChunk = file
    }
    // Content script 包含 DOM 操作
    else if (fileContent.includes('document.') || 
             fileContent.includes('querySelector') ||
             fileContent.includes('content-script')) {
      contentChunk = file
    }
  }
  
  // 如果基于内容的识别失败，回退到文件大小判断
  if (!backgroundChunk || !contentChunk) {
    console.warn('[PostBuild] ⚠ Content-based identification failed, falling back to size-based detection')
    
    for (const file of chunkFiles) {
      const filePath = join(chunksDir, file)
      const stats = statSync(filePath)
      const size = stats.size
      
      // Background 大约 41KB，Content Script 大约 47KB
      if (!backgroundChunk && size > 35000 && size < 50000) {
        backgroundChunk = file
      } else if (!contentChunk && size > 45000 && size < 55000) {
        contentChunk = file
      }
    }
  }
  
  if (backgroundChunk) {
    // 修改 service-worker-loader.js
    const loaderPath = join(distDir, 'service-worker-loader.js')
    const loaderContent = `import './chunks/${backgroundChunk}';\n`
    writeFileSync(loaderPath, loaderContent, 'utf-8')
    console.log(`[PostBuild] ✓ Background loader fixed: ${backgroundChunk}`)
  } else {
    console.error('[PostBuild] ✗ Could not find Background chunk')
    console.error('[PostBuild] Available chunks:', chunkFiles)
    process.exit(1)
  }
  
} catch (error) {
  console.error('[PostBuild] ✗ Failed to fix paths:', error.message)
  process.exit(1)
}
