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
import { detectPageType } from './shared/url-detector'

const SUBTITLE: Record<string, string> = {
  photos: '加载照片...',
  trailer: '加载预告片...',
  video: '加载预告片...',
  celebrities: '加载演职员...',
  albums: '专辑版本 · 加载中',
  detail: '加载中...',
  'book-homepage': '读书首页 · 加载中',
  'book-profile': '读书主页 · 加载中',
  search: '加载搜索结果...',
  personage: '加载影人资料...',
  'user-profile': '用户主页 · 加载中',
'movie-profile': '电影主页 · 加载中',
'user-celebrities': '收藏的影人 · 加载中',
'user-reviews': '我的影评 · 加载中',
  'review-detail': '影评详情 · 加载中',
  doulists: '豆列 · 加载中',
  'doulist-detail': '片单 · 加载中',
  'user-media': '影音收藏 · 加载中',
  'music-homepage': '音乐首页 · 加载中',
  genre: '音乐人分类 · 加载中',
  'artists-overview': '音乐人概览 · 加载中',
}

function getOverlayConfig(): OverlayOptions | null {
  const pageType = detectPageType()
  if (!pageType) return null

  const exposeTypes = new Set(['photos', 'detail'])
  const trailerTypes = new Set(['trailer', 'video'])
  const overlayId =
    pageType.type === 'photos' ? 'umm-photos-overlay'
    : trailerTypes.has(pageType.type) ? 'umm-trailer-overlay'
    : pageType.type === 'celebrities' ? 'umm-celebrities-overlay'
    : pageType.type === 'detail' ? 'umm-detail-mask'
    : pageType.type === 'search' ? 'umm-search-overlay'
    : pageType.type === 'personage' ? 'umm-personage-overlay'
    : pageType.type === 'doulist-detail' ? 'umm-douban-overlay'
    : 'umm-douban-overlay'

  return {
    overlayId,
    subtitle: SUBTITLE[pageType.type] || '多媒体管理器 · 加载中',
    exposeDismiss: exposeTypes.has(pageType.type) || undefined,
  }
}

/**
 * Create early shadow DOM overlay for the current Douban page.
 * Must be called at document_start.
 * Returns null if the page type does not need an overlay.
 */
export function createDoubanEarlyOverlay(): HTMLElement | null {
  const config = getOverlayConfig()
  if (!config) return null
  return createOverlay(config)
}
