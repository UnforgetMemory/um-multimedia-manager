/**
 * 日志工具函数
 * 
 * 根据环境变量控制日志输出级别
 * - 开发环境: 输出所有日志
 * - 生产环境: 仅输出错误和警告
 */

const DEBUG = process.env.NODE_ENV === 'development' || import.meta.env?.DEV

/**
 * 调试日志（仅开发环境）
 */
export function debugLog(...args: any[]): void {
  if (DEBUG) {
    console.log('[UMM Debug]', ...args)
  }
}

/**
 * 信息日志（始终输出）
 */
export function infoLog(...args: any[]): void {
  console.info('[UMM]', ...args)
}

/**
 * 警告日志（始终输出）
 */
export function warnLog(...args: any[]): void {
  console.warn('[UMM Warning]', ...args)
}

/**
 * 错误日志（始终输出）
 */
export function errorLog(...args: any[]): void {
  console.error('[UMM Error]', ...args)
}
