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

// ==================== Fix dynamic import paths in popup chunk ====================
// Chrome extensions resolve ES module dynamic imports relative to the document URL,
// not the importing script's URL. popup chunk is at chunks/popup-*.js but document
// is popup.html at root. So import("./RecordsPage-*.js") resolves to root instead of chunks/.
// Fix: add chunks/ prefix to dynamic import paths in the popup chunk JS.

import { readdirSync } from 'fs'

console.log('[PostBuild] Fixing dynamic import paths in popup chunk...')

try {
  const chunksDir = join(distDir, 'chunks')
  const popupChunk = readdirSync(chunksDir).find(f => f.startsWith('popup-') && f.endsWith('.js'))

  if (popupChunk) {
    const chunkPath = join(chunksDir, popupChunk)
    let content = readFileSync(chunkPath, 'utf-8')

    // Fix Vite's __vite__mapDeps lazy import paths: "./X.js" -> "./chunks/X.js"
    // Only fix DYNAMIC imports (import("./X.js")) — these resolve relative to document URL (popup.html at root).
    // Do NOT fix static imports (from"./X.js") — these resolve relative to the importing script (chunks/popup.js).
    content = content.replace(/import\(`\.\/(.*?)\.js`\)/g, (match, name) => {
      if (name.startsWith('chunks/')) return match
      return `import(\`./chunks/${name}.js\`)`
    })

    writeFileSync(chunkPath, content, 'utf-8')
    console.log(`[PostBuild] ✓ Fixed dynamic imports in ${popupChunk}`)
  }
} catch (error) {
  console.error(`[PostBuild] ✗ Failed to fix dynamic imports:`, error.message)
}

console.log('[PostBuild] Done!')
