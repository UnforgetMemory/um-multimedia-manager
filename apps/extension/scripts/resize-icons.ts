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
  
  const fs = await import('fs')
  const path = await import('path')
  
  // 验证输入文件存在
  if (!fs.existsSync(inputFile)) {
    throw new Error(`输入文件不存在: ${inputFile}\n请确保 icons/icon-original.png 存在`)
  }
  
  // 确保输出目录存在
  if (!fs.existsSync(outputDir)) {
    console.log(`创建输出目录: ${outputDir}`)
    fs.mkdirSync(outputDir, { recursive: true })
  }
  
  for (const size of sizes) {
    const outputFile = join(outputDir, `icon-${size}.png`)
    
    try {
      await sharp(inputFile)
        .resize(size, size, {
          fit: 'cover',  // 使用 cover 模式，裁剪多余部分以填满目标尺寸
          position: 'center'  // 从中心裁剪
        })
        .png()
        .toFile(outputFile)
      
      const stats = await sharp(outputFile).metadata()
      console.log(`✅ icon-${size}.png: ${stats.width}x${stats.height}`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error(`❌ 生成 icon-${size}.png 失败: ${errorMessage}`)
      console.error('提示：检查文件权限和磁盘空间')
      throw error
    }
  }
  
  console.log('\n✨ 所有图标生成完成！')
}

resizeIcons().catch(error => {
  console.error('❌ 图标生成失败:', error)
  process.exit(1)
})
