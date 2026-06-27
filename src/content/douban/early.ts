/**
 * Unified early overlay factory for Douban pages.
 *
 * Determines the correct overlayId and subtitle based on URL,
 * then creates the shadow DOM overlay with loading spinner.
 *
 * Usage:
 *   import { createDoubanEarlyOverlay } from '@/content/douban/early'
 *   createDoubanEarlyOverlay()
 */

import { createOverlay } from './overlay'
import type { OverlayOptions } from './overlay'

interface OverlayConfig {
  overlayId: string
  subtitle: string
  exposeDismiss?: boolean
}

function isDetailPage(url: string): boolean {
  return /^https?:\/\/(movie|music)\.douban\.com\/subject\//.test(url)
}

function isSearchPage(url: string): boolean {
  return /^https?:\/\/search\.douban\.com\/(movie|music)\/subject_search/.test(url)
}

function getOverlayConfig(): OverlayConfig {
  const url = location.href
  if (isDetailPage(url)) {
    return {
      overlayId: 'umm-detail-mask',
      subtitle: '加载中...',
      exposeDismiss: true,
    }
  }
  if (isSearchPage(url)) {
    return {
      overlayId: 'umm-search-overlay',
      subtitle: '加载搜索结果...',
    }
  }
  // Homepage (movie.douban.com/) or fallback
  return {
    overlayId: 'umm-douban-overlay',
    subtitle: '多媒体管理器 · 加载中',
  }
}

/**
 * Create early shadow DOM overlay for the current Douban page.
 * Must be called at document_start.
 */
export function createDoubanEarlyOverlay(): HTMLElement {
  const config = getOverlayConfig()
  return createOverlay(config as OverlayOptions)
}
