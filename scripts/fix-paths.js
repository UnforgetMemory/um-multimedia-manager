/**
 * Post-build script to fix asset paths in generated HTML files
 * Chrome Extensions require relative paths for assets
 */

import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const distDir = join(__dirname, '..', 'dist', 'chrome-mv3')
const htmlFiles = ['popup.html']

console.log('[PostBuild] Fixing asset paths in HTML files...')

htmlFiles.forEach(file => {
  const filePath = join(distDir, file)
  
  try {
    let content = readFileSync(filePath, 'utf-8')
    
    // Replace absolute or relative paths with correct relative paths
    // ../../../chunks/ -> ./chunks/
    // ../../../assets/ -> ./assets/
    // /chunks/ -> ./chunks/
    // /assets/ -> ./assets/
    content = content.replace(/src="\.\.\/\.\.\/\.\.\/chunks\//g, 'src="./chunks/')
    content = content.replace(/href="\.\.\/\.\.\/\.\.\/chunks\//g, 'href="./chunks/')
    content = content.replace(/href="\.\.\/\.\.\/\.\.\/assets\//g, 'href="./assets/')
    content = content.replace(/src="\/chunks\//g, 'src="./chunks/')
    content = content.replace(/href="\/chunks\//g, 'href="./chunks/')
    content = content.replace(/href="\/assets\//g, 'href="./assets/')
    // Remove crossorigin attributes — Chrome extensions don't support CORS for extension pages
    content = content.replace(/\s+crossorigin/g, '')

    writeFileSync(filePath, content, 'utf-8')
    console.log(`[PostBuild] ✓ Fixed paths in ${file}`)
  } catch (error) {
    console.error(`[PostBuild] ✗ Failed to process ${file}:`, error.message)
  }
})

console.log('[PostBuild] Done!')
