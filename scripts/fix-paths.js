/**
 * Post-build script to fix asset paths in generated HTML files
 * Chrome Extensions require relative paths for assets
 *
 * Usage: node scripts/fix-paths.js [--dir <dist-dir>]
 *   --dir  build output directory (default: dist/chrome-mv3).
 *          Pass dist-dev/chrome-mv3 for `npm run build:dev` artifacts.
 */

import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/** Resolve --dir <path> / --dir=<path> from argv; default to the production output. Paths are resolved against the project root. */
function resolveDistDir() {
  const projectRoot = join(__dirname, '..')
  const argv = process.argv.slice(2)
  const flagIdx = argv.indexOf('--dir')
  const inline = argv.find(a => a.startsWith('--dir='))
  const raw = flagIdx !== -1 && argv[flagIdx + 1]
    ? argv[flagIdx + 1]
    : inline
      ? inline.slice('--dir='.length)
      : join('dist', 'chrome-mv3')
  return join(projectRoot, raw)
}

const distDir = resolveDistDir()
const htmlFiles = ['popup.html', 'options.html']

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

// ==================== Fix manifest: set options_ui.open_in_tab = true ====================
// WXT 0.20.26 defaults open_in_tab to false regardless of config.
// Fix: patch the built manifest.json after build.

const manifestPath = join(distDir, 'manifest.json')
try {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
  if (manifest.options_ui && manifest.options_ui.open_in_tab === false) {
    manifest.options_ui.open_in_tab = true
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8')
    console.log('[PostBuild] ✓ Fixed options_ui.open_in_tab = true')
  }
} catch (error) {
  console.error('[PostBuild] ✗ Failed to fix manifest:', error.message)
}
