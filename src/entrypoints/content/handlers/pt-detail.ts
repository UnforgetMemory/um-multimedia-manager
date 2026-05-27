/**
 * PT 站点详情页处理器
 *
 * 功能：
 * - 从 PT 详情页提取豆瓣/IMDb ID
 * - 缓存到 IndexedDB pt_id_cache store
 * - 供列表页 Dimmer 做 fallback 匹配
 *
 * 支持站点：
 * - M-Team: kp.m-team.cc/detail/{id}, next.m-team.cc/detail/{id}
 * - NexusPHP: details.php?id={id} (audiences, hdhome, hdarea, ourbits, pterclub)
 */

import { Store } from '@/features/database'

/** Extract douban ID from a URL like https://movie.douban.com/subject/12345/ */
function extractDoubanId(url: string): string | null {
  const m = url.match(/movie\.douban\.com\/subject\/(\d+)/)
    ?? url.match(/music\.douban\.com\/subject\/(\d+)/)
  return m?.[1] ?? null
}

/** Extract IMDb ID from a URL like https://www.imdb.com/title/tt1234567/ */
function extractImdbId(url: string): string | null {
  const m = url.match(/imdb\.com\/title\/(tt\d+)/)
  return m?.[1] ?? null
}

/** Build a normalized cache key from the current page URL */
function buildCacheKey(url: string): string {
  try {
    const u = new URL(url)
    // Strip tracking params, keep path + id
    return `${u.origin}${u.pathname}${u.search}`
  } catch {
    return url
  }
}

/**
 * Extract platform IDs from an M-Team detail page.
 * M-Team uses React SPA; links may be in <a[href]> or data attributes.
 */
function extractMTeamDetailIds(): { doubanId: string | null; imdbId: string | null } {
  let doubanId: string | null = null
  let imdbId: string | null = null

  // Scan all links on the page
  for (const a of document.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    const href = a.href
    if (!doubanId) doubanId = extractDoubanId(href)
    if (!imdbId) imdbId = extractImdbId(href)
    if (doubanId && imdbId) break
  }

  // Also check query params in the current URL (some M-Team pages embed IDs)
  if (!doubanId || !imdbId) {
    const params = new URLSearchParams(location.search)
    if (!doubanId) {
      const d = params.get('douban')
      if (d && /^\d+$/.test(d)) doubanId = d
    }
    if (!imdbId) {
      const i = params.get('imdb')
      if (i && /^tt\d+$/.test(i)) imdbId = i
    }
  }

  // Check data attributes on body or main container
  if (!doubanId) {
    const el = document.querySelector('[data-doubanid]')
    if (el) doubanId = el.getAttribute('data-doubanid')
  }
  if (!imdbId) {
    const el = document.querySelector('[data-imdbid]')
    if (el) imdbId = el.getAttribute('data-imdbid')
  }

  return { doubanId, imdbId }
}

/**
 * Extract platform IDs from a NexusPHP detail page.
 * NexusPHP sites typically show douban/imdb links in the info table.
 */
function extractNexusPHPDetailIds(): { doubanId: string | null; imdbId: string | null } {
  let doubanId: string | null = null
  let imdbId: string | null = null

  // Standard NexusPHP: links in the detail table
  for (const a of document.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    const href = a.href
    if (!doubanId) doubanId = extractDoubanId(href)
    if (!imdbId) imdbId = extractImdbId(href)
    if (doubanId && imdbId) break
  }

  // Some NexusPHP sites use data attributes
  if (!doubanId) {
    const el = document.querySelector('[data-doubanid]')
    if (el) doubanId = el.getAttribute('data-doubanid')
  }
  if (!imdbId) {
    const el = document.querySelector('[data-imdbid]')
    if (el) imdbId = el.getAttribute('data-imdbid')
  }

  // Some sites embed IDs in hidden inputs or meta tags
  if (!imdbId) {
    const meta = document.querySelector('meta[property="imdb"]') as HTMLMetaElement | null
    if (meta?.content) imdbId = meta.content
  }

  return { doubanId, imdbId }
}

/** Wait for content to load (SPA-aware) */
function waitForContent(
  selector: string,
  callback: () => void,
  timeout = 8000,
  contentCheck?: (el: Element) => boolean,
): void {
  const match = (): Element | null => {
    const el = document.querySelector(selector)
    if (!el) return null
    if (contentCheck && !contentCheck(el)) return null
    return el
  }

  if (match()) {
    callback()
    return
  }

  const observer = new MutationObserver(() => {
    if (match()) {
      observer.disconnect()
      callback()
    }
  })

  observer.observe(document.body, { childList: true, subtree: true })
  setTimeout(() => observer.disconnect(), timeout)
}

/**
 * Main entry: handle PT detail page
 * Extracts platform IDs and caches them in IndexedDB
 */
export async function handlePTDetailPage(url: string): Promise<void> {
  const isMTeam = url.includes('m-team.cc')
  const isNexusPHP = [
    'audiences.me', 'hdhome.org', 'hdarea.club',
    'ourbits.club', 'pterclub.net',
  ].some((host) => url.includes(host))

  if (!isMTeam && !isNexusPHP) return

  const cacheKey = buildCacheKey(url)

  // Check if already cached (skip extraction)
  const existing = await Store.ptIdCacheGet(cacheKey)
  if (existing) {
    console.log('[PT Detail] Already cached:', cacheKey)
    return
  }

  // For M-Team SPA: wait for content to render
  const selector = isMTeam ? '#root' : 'body'

  waitForContent(
    selector,
    async () => {
      const { doubanId, imdbId } = isMTeam
        ? extractMTeamDetailIds()
        : extractNexusPHPDetailIds()

      if (!doubanId && !imdbId) {
        console.log('[PT Detail] No platform IDs found on page')
        return
      }

      // Cache the IDs
      await Store.ptIdCachePut({
        ptUrl: cacheKey,
        doubanId: doubanId ?? undefined,
        imdbId: imdbId ?? undefined,
        updatedAt: new Date().toISOString(),
      })

      console.log('[PT Detail] Cached IDs:', {
        url: cacheKey,
        doubanId,
        imdbId,
      })
    },
    8000,
    isMTeam
      ? (el) => el.childElementCount > 0 && el.querySelector('a[href]') !== null
      : undefined,
  )
}
