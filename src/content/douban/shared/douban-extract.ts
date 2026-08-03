/**
 * Shared Douban DOM extraction helpers.
 *
 * Consolidates near-identical extraction snippets that were previously
 * copy-pasted across page data files (parseRating ×6, etc.).
 * Only truly identical implementations live here — page-specific variants
 * (e.g. extractRating's differing count-selector) stay in their pages.
 */

/**
 * Parse a Douban rating class like "allstar50" → 5.0.
 * Returns 0 when no `allstar(\d+)` pattern is present.
 */
export function parseRating(className: string): number {
  const m = className.match(/allstar(\d+)/)
  if (!m) return 0
  return parseInt(m[1], 10) / 10
}
