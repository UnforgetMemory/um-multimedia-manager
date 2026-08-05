/**
 * Pure helpers + shared status constants for the video-overlay module (T18).
 *
 * No DOM, no extension APIs — safe to import from unit tests. The six
 * functions below are locked verbatim by tests/unit/video-overlay.spec.ts.
 */

/** Status colors: 0=NONE 1=WISHLIST 2=DONE 3=DOING */
export const STATUS_COLORS = ['#9ca3af', '#f97316', '#22c55e', '#3b82f6'] as const
export const STATUS_LABELS = ['未看', '想看', '已看', '在看'] as const
/** Display order of status buttons in the modal: NONE WISHLIST DOING DONE */
export const STATUS_DISPLAY_ORDER = [0, 1, 3, 2] as const

/** decision-3: canonical store key for video media ('movie::<id>'). */
export function storeKey(id: string): string {
  return 'movie::' + id
}

/** Completion % required to auto-mark DONE, by duration in seconds. */
export function calcThreshold(duration: number): number {
  if (duration <= 0) return 55
  if (duration < 300) return 55    // < 5min
  if (duration < 900) return 60    // 5-15min
  if (duration < 2700) return 65   // 15-45min
  if (duration < 3600) return 70   // 45-60min
  return 70                         // > 60min
}

const YOUTUBE_ID_RE = /^[a-zA-Z0-9_-]{11}$/

/** Extract an 11-char YouTube videoId from a card href (`?v=` param). */
export function parseYoutubeVideoId(href: string): string | null {
  if (!href) return null
  let search: string
  try {
    search = new URL(href, 'https://www.youtube.com').search
  } catch {
    return null
  }
  const v = new URLSearchParams(search).get('v')
  return v && YOUTUBE_ID_RE.test(v) ? v : null
}

/** Extract an 11-char YouTube videoId from location.search. */
export function parseYoutubeSearchId(search: string): string | null {
  if (!search) return null
  const v = new URLSearchParams(search).get('v')
  return v && YOUTUBE_ID_RE.test(v) ? v : null
}

/** Bilibili bvid from pathname (+ optional search for /list/ pages). */
export function parseBilibiliBvid(pathname: string, search?: string): string | null {
  const pathMatch = pathname.match(/^\/video\/(BV[a-zA-Z0-9]+)\/?$/i)
  if (pathMatch) return pathMatch[1]
  if (/^\/list\//.test(pathname)) {
    const bvidParam = search ? new URLSearchParams(search).get('bvid') : null
    if (bvidParam && /^BV[a-zA-Z0-9]+$/.test(bvidParam)) return bvidParam
  }
  return null
}

/** Bilibili bvid from a recommendation card href. */
export function parseBilibiliBvidFromHref(href: string): string | null {
  if (!href) return null
  let pathname: string
  try {
    pathname = new URL(href, 'https://www.bilibili.com').pathname
  } catch {
    return null
  }
  const m = pathname.match(/\/video\/(BV[a-zA-Z0-9]+)/i)
  return m ? m[1] : null
}
