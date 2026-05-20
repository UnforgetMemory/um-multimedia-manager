/**
 * 运行时消息通信类型定义
 * 
 * 用于 Chrome Extension 消息传递的类型安全封装
 */

/**
 * 运行时消息接口
 */
export interface RuntimeMessage {
  type: string
  payload?: Record<string, unknown>
}

/**
 * 消息响应接口
 */
export interface MessageResponse {
  success: boolean
  data?: unknown
  error?: string
}

/**
 * 发送响应函数类型
 */
export type SendResponseFn = (response: MessageResponse) => void
