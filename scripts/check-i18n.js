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
const CONTENT_LOCALES = join(__dirname, '../src/entrypoints/content/i18n/locales.ts')

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

// Extract keys from content script locales
function extractContentKeys() {
  const content = readFileSync(CONTENT_LOCALES, 'utf-8')
  const keys = new Set()
  
  // Match 'key': pattern in all locale blocks
  const regex = /['"]([^'"]+)['"]\s*:/g
  let match
  while ((match = regex.exec(content)) !== null) {
    const key = match[1]
    // Skip locale identifiers and non-key patterns
    if (!['en-US', 'zh-CN', 'zh-TW', 'zh-HK'].includes(key)) {
      keys.add(key)
    }
  }
  
  return keys
}

// Per-locale block-aware key extraction: split the file by locale block markers
// and check every locale carries the identical key set (union == intersection).
function extractContentBlocks() {
  const content = readFileSync(CONTENT_LOCALES, 'utf-8')
  const LOCALES = ['en-US', 'zh-CN', 'zh-HK', 'zh-TW']
  const blocks = new Map()
  const markers = LOCALES.map((l) => ({ locale: l, at: content.indexOf(`'${l}': {`) }))
    .filter((m) => m.at >= 0)
    .sort((a, b) => a.at - b.at)
  for (let i = 0; i < markers.length; i++) {
    const start = markers[i].at
    const end = i + 1 < markers.length ? markers[i + 1].at : content.length
    const slice = content.slice(start, end)
    const keys = new Set()
    const regex = /['"]([^'"]+)['"]\s*:/g
    let match
    while ((match = regex.exec(slice)) !== null) {
      if (!LOCALES.includes(match[1])) keys.add(match[1])
    }
    blocks.set(markers[i].locale, keys)
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
