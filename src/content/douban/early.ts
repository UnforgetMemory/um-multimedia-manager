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

function isAlbumsPage(url: string): boolean {
  return /^https?:\/\/music\.douban\.com\/albums\/\d+/.test(url)
}

function isDetailPage(url: string): boolean {
  return /^https?:\/\/(movie|music)\.douban\.com\/subject\//.test(url)
}

function isMusicHomepage(url: string): boolean {
  return /^https?:\/\/music\.douban\.com\/?(\?.*)?$/.test(url)
}

function isGenrePage(url: string): boolean {
  return /^https?:\/\/music\.douban\.com\/artists\/genre_page\/\d+/.test(url)
}

function isArtistsOverview(url: string): boolean {
  return /^https?:\/\/music\.douban\.com\/artists\/?(\?.*)?$/.test(url)
}

function isPhotosPage(url: string): boolean {
  return /^https?:\/\/movie\.douban\.com\/subject\/\d+\/(photos|all_photos)/.test(url)
}

function isSearchPage(url: string): boolean {
  return /^https?:\/\/search\.douban\.com\/(movie|music)\/subject_search/.test(url)
}

function isCelebritiesPage(url: string): boolean {
  return /^https?:\/\/movie\.douban\.com\/subject\/\d+\/celebrities/.test(url)
}

function isPersonagePage(url: string): boolean {
  return /^https?:\/\/www\.douban\.com\/personage\/\d+/.test(url)
}

function isTrailerPage(url: string): boolean {
  return /^https?:\/\/movie\.douban\.com\/(subject\/\d+\/trailer|trailer\/\d+)/.test(url)
}

function isVideoPage(url: string): boolean {
  return /^https?:\/\/movie\.douban\.com\/video\/\d+/.test(url)
}

function getOverlayConfig(): OverlayOptions | null {
  const url = location.href
  if (isPhotosPage(url)) {
    return {
      overlayId: 'umm-photos-overlay',
      subtitle: '加载照片...',
      exposeDismiss: true,
    }
  }
  if (isTrailerPage(url) || isVideoPage(url)) {
    return {
      overlayId: 'umm-trailer-overlay',
      subtitle: '加载预告片...',
    }
  }
  if (isCelebritiesPage(url)) {
    return {
      overlayId: 'umm-celebrities-overlay',
      subtitle: '加载演职员...',
    }
  }
  if (isAlbumsPage(url)) {
    return {
      overlayId: 'umm-douban-overlay',
      subtitle: '专辑版本 · 加载中',
    }
  }
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
  if (isPersonagePage(url)) {
    return {
      overlayId: 'umm-personage-overlay',
      subtitle: '加载影人资料...',
    }
  }
  if (isMusicHomepage(url)) {
    return {
      overlayId: 'umm-douban-overlay',
      subtitle: '音乐首页 · 加载中',
    }
  }
  if (isGenrePage(url)) {
    return {
      overlayId: 'umm-douban-overlay',
      subtitle: '音乐人分类 · 加载中',
    }
  }
  if (isArtistsOverview(url)) {
    return {
      overlayId: 'umm-douban-overlay',
      subtitle: '音乐人概览 · 加载中',
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
 * Returns null if the page type does not need an overlay.
 */
export function createDoubanEarlyOverlay(): HTMLElement | null {
  const config = getOverlayConfig()
  if (!config) return null
  return createOverlay(config)
}
