/**
 * Runtime-configurable logger for UMM
 *
 * Settings are stored in chrome.storage.local and synced across all contexts
 * (popup, background, content script) via storage.onChanged listeners.
 *
 * Log levels: debug < info < warn < error
 * Only logs at or above the configured level are output.
 */

import type { LogLevel } from '@/types'

// ==================== Internal State ====================

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

interface LogConfig {
  enabled: boolean
  level: LogLevel
}

/** Current runtime config — defaults match production-safe behavior */
let config: LogConfig = {
  enabled: import.meta.env?.DEV ?? false,
  level: 'info',
}

// ==================== Public API ====================

/**
 * Update logger configuration at runtime.
 * Called on startup and whenever settings change in chrome.storage.
 */
export function configureLogging(options: { enabled?: boolean; level?: LogLevel }): void {
  if (options.enabled !== undefined) config.enabled = options.enabled
  if (options.level !== undefined) config.level = options.level
}

/**
 * Read current logger configuration (for UI display).
 */
export function getLogConfig(): Readonly<LogConfig> {
  return { ...config }
}

// ==================== Log Functions ====================

/** Debug — verbose, development only */
export function debugLog(...args: any[]): void {
  if (!config.enabled || LEVEL_PRIORITY[config.level] > LEVEL_PRIORITY.debug) return
  console.log('[UMM Debug]', ...args)
}

/** Info — general operational messages */
export function infoLog(...args: any[]): void {
  if (!config.enabled || LEVEL_PRIORITY[config.level] > LEVEL_PRIORITY.info) return
  console.info('[UMM]', ...args)
}

/** Warning — recoverable issues */
export function warnLog(...args: any[]): void {
  if (!config.enabled || LEVEL_PRIORITY[config.level] > LEVEL_PRIORITY.warn) return
  console.warn('[UMM Warning]', ...args)
}

/** Error — failures that need attention */
export function errorLog(...args: any[]): void {
  if (!config.enabled || LEVEL_PRIORITY[config.level] > LEVEL_PRIORITY.error) return
  console.error('[UMM Error]', ...args)
}
