/**
 * Unified Douban subject ID extraction from the DOM or URL.
 *
 * Consolidates 3 duplicate implementations found across:
 * - homepage/extractors.ts    (full: /subject/, /movie/, /tv/, data-trailer)
 * - music-homepage/extractors.ts  (narrower: /subject/ only)
 * - trailer/trailer-data.ts      (URL-path-first + DOM fallback)
 *
 * Usage:
 *   extractSubjectId(el)       — DOM-based (from a container element)
 *   extractSubjectIdFromUrl()  — URL-path-based (from location.pathname)
 */

/**
 * Extract a Douban subject ID from a container element.
 * Checks (in order):
 * 1. `<a href*="/subject/">`, `<a href*="/movie/">`, `<a href*="/tv/">` links
 * 2. `data-trailer` attribute (e.g. `https://movie.douban.com/subject/{id}/trailer`)
 *
 * Returns empty string when no ID is found.
 */
export function extractSubjectId(element: Element): string {
  const link = element.querySelector<HTMLAnchorElement>(
    'a[href*="/subject/"], a[href*="/movie/"], a[href*="/tv/"]',
  )
  if (link) {
    const href = link.href || link.getAttribute('href')
    if (href) {
      const match = href.match(/\/(?:subject|movie|tv)\/(\d+)/)
      if (match) return match[1]
    }
  }

  const trailer = (element as HTMLElement).dataset.trailer || ''
  const trailerMatch = trailer.match(/\/subject\/(\d+)\//)
  if (trailerMatch) return trailerMatch[1]

  return ''
}

/**
 * Extract a Douban subject ID from the current URL pathname.
 * Works for listing pages like /subject/{id}/trailer, /subject/{id}/photos, etc.
 */
export function extractSubjectIdFromUrl(): string {
  return window.location.pathname.match(/\/(\d+)\//)?.[1] || ''
}
