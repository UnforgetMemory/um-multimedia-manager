/**
 * Chrome Extension 上下文有效性检测和安全的消息发送工具
 * 
 * 用于解决 "Extension context invalidated" 错误
 */

/**
 * 检查扩展上下文是否有效
 */
export function isContextValid(): boolean {
  return !!(chrome.runtime?.id && chrome.runtime?.sendMessage)
}

/**
 * 安全地发送消息到 Background
 * 包含上下文检查和错误处理
 */
export async function safeSendMessage<T = any>(
  message: any,
  options?: {
    timeout?: number
    retries?: number
    fallback?: () => void
  }
): Promise<T | null> {
  // ✅ 修复：降低默认超时和重试次数，更快反馈错误
  const { timeout = 15000, retries = 2, fallback } = options || {}
  
  let lastError: Error | null = null
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // 检查上下文有效性（每次重试前都检查）
      if (!chrome.runtime?.id) {
        throw new Error('Extension context invalidated')
      }
      
      // 发送消息并设置超时
      const response = await sendMessageWithTimeout(message, timeout)
      return response as T
      
    } catch (error) {
      lastError = error as Error
      
      // 如果是上下文失效错误，不再重试
      if (error instanceof Error && 
          error.message.includes('context invalidated')) {
        console.error('[UMM] Context invalidated, cannot retry')
        break
      }
      
      // 如果不是最后一次尝试，等待后重试（指数退避）
      if (attempt < retries) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        console.warn(`[UMM] Retry ${attempt}/${retries} after error:`, errorMsg)
        // 指数退避：1s, 2s, 4s...
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)))
      }
    }
  }
  
  // 所有尝试都失败
  console.error('[UMM] All retries exhausted:', lastError)
  fallback?.()
  return null
}

/**
 * 带超时的消息发送
 */
function sendMessageWithTimeout(message: any, timeout: number): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Message timeout after ${timeout}ms`))
    }, timeout)
    
    chrome.runtime.sendMessage(message, (response) => {
      clearTimeout(timer)
      
      // 检查运行时错误
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
        return
      }
      
      resolve(response)
    })
  })
}

// ✅ 开发模式下的调试工具
if (import.meta.env.DEV) {
  window.__UMM_DEBUG__ = {
    checkContext: () => {
      console.log('Extension ID:', chrome.runtime?.id)
      console.log('sendMessage available:', !!chrome.runtime?.sendMessage)
      console.log('Context valid:', isContextValid())
    },
    
    simulateInvalidation: () => {
      console.warn('Simulating context invalidation...')
      // 仅用于测试，不实际执行
    }
  }
  
  console.log('[UMM] Debug tools available: window.__UMM_DEBUG__')
}
