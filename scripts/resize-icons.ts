/**
 * 图标尺寸调整脚本
 * 将原始图标调整为 Chrome 扩展需要的 16px, 48px, 128px 尺寸
 */

import sharp from 'sharp'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const sizes = [16, 48, 128]
const inputFile = join(__dirname, '..', 'icons', 'icon-original.png')
const outputDir = join(__dirname, '..', 'icons')

async function resizeIcons() {
  console.log('📐 开始调整图标尺寸...\n')
  
  for (const size of sizes) {
    const outputFile = join(outputDir, `icon-${size}.png`)
    
    await sharp(inputFile)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 } // 透明背景
      })
      .png()
      .toFile(outputFile)
    
    const stats = await sharp(outputFile).metadata()
    console.log(`✅ icon-${size}.png: ${stats.width}x${stats.height}`)
  }
  
  console.log('\n✨ 所有图标生成完成！')
}

resizeIcons().catch(error => {
  console.error('❌ 图标生成失败:', error)
  process.exit(1)
})
