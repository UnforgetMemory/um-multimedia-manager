#!/usr/bin/env node

/**
 * i18n Translation Completeness Checker
 * 
 * Checks translation completeness across all locale files.
 * Outputs percentage and missing keys for each locale.
 * 
 * Usage: node scripts/check-i18n.js [--strict]
 *   --strict: Exit with error if any locale is below 100%
 */

import { readFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const LOCALES_DIR = join(__dirname, '../src/shared/locales')
const CONTENT_LOCALES_DIR = join(__dirname, '../src/entrypoints/content/i18n/locales')

const isStrict = process.argv.includes('--strict')

// Extract keys from TypeScript locale file
function extractKeys(filePath) {
  const content = readFileSync(filePath, 'utf-8')
  const keys = new Set()
  
  // Match 'key': or "key": patterns
  const regex = /['"]([^'"]+)['"]\s*:/g
  let match
  while ((match = regex.exec(content)) !== null) {
    const key = match[1]
    // Skip non-key patterns (e.g., 'en-US', 'zh-CN')
    if (!key.includes('-') || key.includes('.')) {
      keys.add(key)
    }
  }
  
  return keys
}

/**
 * 内容脚本 locale 文件（聚合目录：一文件一语言；index.ts 为聚合入口，跳过）。
 * 2026-09-25 起由单一 646 行 locales.ts 拆为目录，故这里改为逐文件读取——
 * 原先「按 `'<locale>': {` 块标记切分单文件」的脆弱逻辑随之退役。
 */
function getContentLocaleFiles() {
  return readdirSync(CONTENT_LOCALES_DIR)
    .filter(f => f.endsWith('.ts') && f !== 'index.ts')
    .map(f => join(CONTENT_LOCALES_DIR, f))
}

/** 单文件键集。locale 文件内部已无 locale 标识符，故无需排除名单。 */
function extractKeysFromContentFile(filePath) {
  const content = readFileSync(filePath, 'utf-8')
  const keys = new Set()
  const regex = /['"]([^'"]+)['"]\s*:/g
  let match
  while ((match = regex.exec(content)) !== null) {
    keys.add(match[1])
  }
  return keys
}

// Extract keys from content script locales (union across per-locale files)
function extractContentKeys() {
  const keys = new Set()
  for (const file of getContentLocaleFiles()) {
    for (const k of extractKeysFromContentFile(file)) keys.add(k)
  }
  return keys
}

// Per-locale block-aware key extraction: every locale file must carry the
// identical key set (union == intersection).
function extractContentBlocks() {
  const blocks = new Map()
  for (const file of getContentLocaleFiles()) {
    const locale = file.split(/[\\/]/).pop().replace(/\.ts$/, '')
    blocks.set(locale, extractKeysFromContentFile(file))
  }
  return blocks
}

// Get all locale files
function getLocaleFiles() {
  const files = readdirSync(LOCALES_DIR)
    .filter(f => f.endsWith('.ts') && f !== 'index.ts')
    .map(f => join(LOCALES_DIR, f))
  return files
}

// Check if a key exists in a file
function hasKey(filePath, key) {
  const content = readFileSync(filePath, 'utf-8')
  const regex = new RegExp(`['"]${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]\\s*:`)
  return regex.test(content)
}

// Main check
function check() {
  console.log('\n📊 i18n Translation Completeness Report\n')
  console.log('─'.repeat(60))
  
  const localeFiles = getLocaleFiles()
  const allKeys = new Set()
  const results = []
  
  // Collect all keys from all files
  for (const file of localeFiles) {
    const keys = extractKeys(file)
    keys.forEach(k => allKeys.add(k))
  }
  
  // Check each locale
  for (const file of localeFiles) {
    const fileName = file.split('/').pop().replace('.ts', '')
    const keys = extractKeys(file)
    const missing = []
    
    for (const key of allKeys) {
      if (!keys.has(key)) {
        missing.push(key)
      }
    }
    
    const total = allKeys.size
    const translated = total - missing.length
    const percentage = ((translated / total) * 100).toFixed(1)
    
    results.push({
      locale: fileName,
      total,
      translated,
      missing: missing.length,
      percentage: parseFloat(percentage),
      missingKeys: missing
    })
  }
  
  // Output results
  for (const result of results) {
    const bar = '█'.repeat(Math.floor(result.percentage / 5)) + '░'.repeat(20 - Math.floor(result.percentage / 5))
    const emoji = result.percentage === 100 ? '✅' : result.percentage >= 90 ? '🟡' : '🔴'
    
    console.log(`\n${emoji} ${result.locale}`)
    console.log(`   ${bar} ${result.percentage}%`)
    console.log(`   Translated: ${result.translated}/${result.total} (${result.missing} missing)`)
    
    if (result.missingKeys.length > 0) {
      console.log(`   Missing keys:`)
      result.missingKeys.slice(0, 10).forEach(key => {
        console.log(`     - ${key}`)
      })
      if (result.missingKeys.length > 10) {
        console.log(`     ... and ${result.missingKeys.length - 10} more`)
      }
    }
  }
  
  // Content script check
  console.log('\n' + '─'.repeat(60))
  console.log('\n📝 Content Script i18n')
  const contentKeys = extractContentKeys()
  console.log(`   Keys: ${contentKeys.size}`)
  const blocks = extractContentBlocks()
  let contentMismatch = false
  for (const [locale, keys] of blocks) {
    const missing = [...contentKeys].filter((k) => !keys.has(k))
    const status = missing.length === 0 ? '✅' : '❌'
    console.log(`   ${status} ${locale}: ${keys.size}/${contentKeys.size}`)
    if (missing.length > 0) {
      contentMismatch = true
      console.log(`     Missing: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? ' …' : ''}`)
    }
  }
  if (contentMismatch) {
    console.log('\n❌ Content locales are NOT symmetric (every locale must carry the same key set).')
    process.exit(1)
  }
  console.log('   Status: Block-wise complete (symmetric key sets) ✓')
  
  // Summary
  console.log('\n' + '─'.repeat(60))
  console.log('\n📈 Summary')
  const avgPercentage = results.reduce((sum, r) => sum + r.percentage, 0) / results.length
  console.log(`   Average completeness: ${avgPercentage.toFixed(1)}%`)
  console.log(`   Total keys: ${allKeys.size}`)
  console.log(`   Locales: ${results.length}`)
  
  const allComplete = results.every(r => r.percentage === 100)
  if (allComplete) {
    console.log('\n✅ All locales are 100% complete!')
  } else {
    console.log('\n⚠️  Some locales have missing translations.')
    if (isStrict) {
      console.log('\n❌ Strict mode: Exiting with error.')
      process.exit(1)
    }
  }
  
  console.log('')
}

check()
