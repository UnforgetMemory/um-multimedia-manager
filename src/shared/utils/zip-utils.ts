/**
 * ZIP 工具模块
 * 
 * 使用浏览器原生 Compression Streams API 进行数据压缩和解压
 * 用于 WebDAV 同步时的数据打包和解包
 * 
 * ZIP 结构:
 * - data.json: 主要数据文件
 * - metadata.json: 元数据文件（包含格式版本、导出时间等）
 */

// ==================== 类型定义 ====================

export interface ZipContent {
  data: any
  metadata: any
}

// ==================== 核心函数 ====================

/**
 * 将对象序列化为 ZIP Blob
 * 
 * @param data - 要打包的主要数据对象
 * @param metadata - 元数据对象（可选）
 * @returns ZIP 格式的 Blob 对象
 */
export async function objectToZipBlob(data: any, metadata?: any): Promise<Blob> {
  try {
    // 1. 序列化数据为 JSON
    const dataJson = JSON.stringify(data, null, 2)
    const metadataJson = metadata ? JSON.stringify(metadata, null, 2) : '{}'
    
    // 2. 创建简单的 ZIP 结构（手动构建 ZIP 文件）
    // 注意：Compression Streams API 只支持 gzip/deflate，不支持完整 ZIP 格式
    // 因此我们创建一个简化的归档格式：两个 gzip 文件拼接
    
    const dataBlob = new Blob([dataJson], { type: 'application/json' })
    const metadataBlob = new Blob([metadataJson], { type: 'application/json' })
    
    // 3. 分别压缩两个文件
    const compressedData = await compressBlob(dataBlob)
    const compressedMetadata = await compressBlob(metadataBlob)
    
    // 4. 创建自定义归档格式
    // 格式：[header][metadata_size][metadata_data][data_size][data_data]
    const header = new TextEncoder().encode('UMM-ZIP-v1')
    const metadataSize = new Uint32Array([compressedMetadata.byteLength])
    const dataSize = new Uint32Array([compressedData.byteLength])
    
    // 合并所有部分
    const totalSize = header.byteLength + 
                     metadataSize.byteLength + 
                     compressedMetadata.byteLength + 
                     dataSize.byteLength + 
                     compressedData.byteLength
    
    const result = new Uint8Array(totalSize)
    let offset = 0
    
    // 写入头部
    result.set(new Uint8Array(header), offset)
    offset += header.byteLength
    
    // 写入元数据大小
    result.set(new Uint8Array(metadataSize.buffer), offset)
    offset += metadataSize.byteLength
    
    // 写入元数据
    result.set(new Uint8Array(compressedMetadata), offset)
    offset += compressedMetadata.byteLength
    
    // 写入数据大小
    result.set(new Uint8Array(dataSize.buffer), offset)
    offset += dataSize.byteLength
    
    // 写入数据
    result.set(new Uint8Array(compressedData), offset)
    
    return new Blob([result], { type: 'application/x-umm-zip' })
  } catch (error) {
    console.error('[ZIP Utils] Failed to create ZIP blob:', error)
    throw new Error(`Failed to create ZIP: ${String(error)}`)
  }
}

/**
 * 从 ZIP Blob 反序列化为对象
 * 
 * @param blob - ZIP 格式的 Blob 对象
 * @returns 包含 data 和 metadata 的对象
 */
export async function zipBlobToObject(blob: Blob): Promise<ZipContent> {
  try {
    // 1. 读取整个 Blob
    const buffer = await blob.arrayBuffer()
    const data = new Uint8Array(buffer)
    
    // 2. 验证头部
    const headerBytes = data.slice(0, 10)
    const header = new TextDecoder().decode(headerBytes)
    
    if (header !== 'UMM-ZIP-v1') {
      throw new Error('Invalid ZIP format: missing or incorrect header')
    }
    
    let offset = 10
    
    // 3. 读取元数据大小
    const metadataSizeBytes = data.slice(offset, offset + 4)
    const metadataSize = new Uint32Array(metadataSizeBytes.buffer)[0]
    offset += 4
    
    // 4. 读取元数据
    const compressedMetadata = data.slice(offset, offset + metadataSize)
    offset += metadataSize
    
    // 5. 读取数据大小
    const dataSizeBytes = data.slice(offset, offset + 4)
    const dataSize = new Uint32Array(dataSizeBytes.buffer)[0]
    offset += 4
    
    // 6. 读取数据
    const compressedData = data.slice(offset, offset + dataSize)
    
    // 7. 解压缩
    const metadataBlob = new Blob([compressedMetadata])
    const dataBlob = new Blob([compressedData])
    
    const metadataJson = await decompressBlob(metadataBlob)
    const dataJson = await decompressBlob(dataBlob)
    
    // 8. 解析 JSON
    const metadata = JSON.parse(metadataJson)
    const dataObj = JSON.parse(dataJson)
    
    return {
      data: dataObj,
      metadata
    }
  } catch (error) {
    console.error('[ZIP Utils] Failed to parse ZIP blob:', error)
    throw new Error(`Failed to parse ZIP: ${String(error)}`)
  }
}

/**
 * 验证 ZIP 结构完整性
 * 
 * @param blob - ZIP 格式的 Blob 对象
 * @returns 是否有效
 */
export async function validateZipStructure(blob: Blob): Promise<boolean> {
  try {
    // 检查文件大小
    if (blob.size < 20) {
      return false
    }
    
    // 读取头部
    const buffer = await blob.slice(0, 10).arrayBuffer()
    const header = new TextDecoder().decode(new Uint8Array(buffer))
    
    // 验证头部标识
    return header === 'UMM-ZIP-v1'
  } catch (error) {
    console.error('[ZIP Utils] Failed to validate ZIP structure:', error)
    return false
  }
}

// ==================== 辅助函数 ====================

/**
 * 使用 CompressionStream 压缩 Blob
 */
async function compressBlob(blob: Blob): Promise<ArrayBuffer> {
  const stream = blob.stream()
  const compressedStream = stream.pipeThrough(new CompressionStream('gzip'))
  
  const reader = compressedStream.getReader()
  const chunks: Uint8Array[] = []
  
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  
  return result.buffer
}

/**
 * 使用 DecompressionStream 解压 Blob
 */
async function decompressBlob(blob: Blob): Promise<string> {
  const stream = blob.stream()
  const decompressedStream = stream.pipeThrough(new DecompressionStream('gzip'))
  
  const reader = decompressedStream.getReader()
  const chunks: Uint8Array[] = []
  
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  
  return new TextDecoder().decode(result)
}
