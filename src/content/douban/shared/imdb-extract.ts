/**
 * IMDb ID recognition & extraction (used by the search overlay).
 *
 * Detects IMDb links / tt-ids in Douban search-result text
 * (abstract / abstract_2 / url) or a top-level `imdb` field.
 *
 * Supported forms:
 * - Full URL:  https://www.imdb.com/title/tt0111161/
 * - Label:     IMDb: tt0111161 / IMDb：tt0111161
 * - Bare ID:   tt0111161
 */

/** Minimal SearchItem shape (decoupled from the page type for testability). */
export interface SearchItemLike {
  id?: number | string
  title?: string
  abstract?: string
  abstract_2?: string
  url?: string
  imdb?: string
}

/** Full imdb.com link or tt-id text. */
const IMDB_LINK_RE = /imdb\.com\/title\/(tt\d+)/i
/** "IMDb: ttxxx" / "IMDb：ttxxx" label form (half/full-width colon). */
const IMDB_LABEL_RE = /(?:IMDb|imdb)\s*[:：]?\s*(tt\d{5,})/i
/** Bare tt-id (5+ digits, avoids false positives like tt123). */
const BARE_TT_RE = /\b(tt\d{5,})\b/i

/** Extract a tt-xxx IMDb id from arbitrary text; null when absent. */
export function extractImdbIdFromText(text: string): string | null {
  if (!text) return null
  const link = text.match(IMDB_LINK_RE)
  if (link) return link[1].toLowerCase()
  const label = text.match(IMDB_LABEL_RE)
  if (label) return label[1].toLowerCase()
  const bare = text.match(BARE_TT_RE)
  if (bare) return bare[1].toLowerCase()
  return null
}

/**
 * Extract an IMDb id from a search item.
 *
 * Priority: top-level `imdb` field → abstract / abstract_2 / url text.
 * The top-level key is a defensive probe for Douban __DATA__ variants;
 * the text scan covers the DOM-fallback path (.meta → abstract/abstract_2).
 */
export function extractImdbIdFromItem(item: SearchItemLike): string | null {
  if (typeof item.imdb === 'string' && item.imdb.trim()) {
    const direct = extractImdbIdFromText(item.imdb)
    if (direct) return direct
  }
  const text = [item.abstract, item.abstract_2, item.url]
    .filter((s): s is string => typeof s === 'string' && s.length > 0)
    .join(' ')
  return extractImdbIdFromText(text)
}
