/**
 * PT 站点配置 API
 */

import { SITE_CONFIGS } from './sites'
import type { SiteScannerConfig } from '../types'

/** 通用 NexusPHP 行选择器 */
const DEFAULT_ROW_SELECTOR = 'tbody > tr'
const DEFAULT_SKIP_SELECTOR = 'td.colhead'

/**
 * 通用 extractDetailUrl：查找行内 details.php 链接
 */
function defaultExtractDetailUrl(row: Element): string | null {
  const link = row.querySelector('a[href*="details.php"]') as HTMLAnchorElement | null
  if (!link) return null
  try {
    const url = new URL(link.href, location.origin)
    return `${url.origin}${url.pathname}${url.search}`
  } catch {
    return link.href
  }
}

/**
 * 通用 extractIdsFromDetail：扫描详情页所有链接提取豆瓣/IMDb ID
 */
function defaultExtractIdsFromDetail(doc: Document): { doubanId?: string; imdbId?: string } {
  let doubanId: string | null = null
  let imdbId: string | null = null

  for (const a of doc.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    const href = a.href
    if (!doubanId) {
      const m = href.match(/douban\.com\/subject\/(\d+)/)
      if (m) doubanId = m[1]
    }
    if (!imdbId) {
      const m = href.match(/imdb\.com\/title\/(tt\d+)/)
      if (m) imdbId = m[1]
    }
    if (doubanId && imdbId) break
  }

  return {
    doubanId: doubanId ?? undefined,
    imdbId: imdbId ?? undefined,
  }
}

/**
 * 检测 URL 是否为 NexusPHP 列表页（通用模式）
 * 匹配 torrents.php / videos.php / officialgroup.php 等
 */
function isNexusPHPListPage(url: string): boolean {
  try {
    const u = new URL(url)
    const path = u.pathname
    return (
      path.endsWith('/torrents.php') ||
      path.endsWith('/videos.php') ||
      path.endsWith('/officialgroup.php')
    )
  } catch {
    return false
  }
}

/**
 * 获取列表页配置
 * 优先匹配 SITE_CONFIGS 中的精确配置，找不到则回退到通用 NexusPHP 配置
 */
export function getListPageConfig(url: string): SiteScannerConfig | null {
  const exact = SITE_CONFIGS.find((config) => config.isListPage(url))
  if (exact) return exact

  // Generic NexusPHP fallback: URL matches common list page patterns
  if (isNexusPHPListPage(url)) {
    return {
      domain: extractDomain(url),
      isListPage: (u) => isNexusPHPListPage(u),
      isDetailPage: (u) => u.includes('details.php'),
      extractDetailUrl: defaultExtractDetailUrl,
      extractIdsFromDetail: defaultExtractIdsFromDetail,
      rowSelector: DEFAULT_ROW_SELECTOR,
      skipRowSelector: DEFAULT_SKIP_SELECTOR,
      enableBackgroundScan: false, // Generic fallback defaults to no background scan
      scanConcurrency: 3,
      scanDelayRange: [1000, 2000],
    }
  }

  return null
}

/** 从 URL 中提取域名 */
function extractDomain(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return 'unknown'
  }
}

/** 根据 URL 获取站点配置（列表页或详情页） */
export function getSiteConfig(url: string): SiteScannerConfig | null {
  return SITE_CONFIGS.find((config) =>
    config.isListPage(url) || config.isDetailPage(url)
  ) ?? getListPageConfig(url)
}

/** 检查 URL 是否为支持的详情页 */
export function isSupportedDetailPage(url: string): boolean {
  return SITE_CONFIGS.some((config) => config.isDetailPage(url))
}

/** 获取所有启用后台扫描的站点域名 */
export function getScannableDomains(): string[] {
  return SITE_CONFIGS
    .filter((config) => config.enableBackgroundScan)
    .map((config) => config.domain)
}
