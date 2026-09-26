/**
 * Title-year extraction for the Douban search overlay.
 *
 * Douban search-result titles disambiguate same-name subjects with a trailing
 * parenthesized year — e.g. "金刚 King Kong (2005)", "英雄本色（1986）".
 * The rebuilt search card clamps its title to 2 lines, so a long title
 * truncates exactly the trailing year. This helper splits the year out of the
 * title so the card can render it as a separate, non-truncatable chip.
 */

/** Trailing "(YYYY)" / "（YYYY）" (half/full-width parens, optional inner spaces). */
const TRAILING_YEAR_RE = /^(.*?)\s*[（(]\s*(\d{4})\s*[)）]\s*$/

/** Plausible year window: pre-cinema lower bound, future releases upper bound. */
const MIN_YEAR = 1800
const MAX_YEAR = 2100

export interface TitleYearSplit {
  /** Title with the trailing year removed (trimmed). */
  title: string
  /** Extracted year ("2005"), or null when the title carries no trailing year. */
  year: string | null
}

/** Split a trailing parenthesized year off a search-result title. */
export function splitTitleYear(rawTitle: string | undefined): TitleYearSplit {
  // __DATA__ is external JSON: a malformed item may omit title entirely
  if (!rawTitle) return { title: '', year: null }
  const trimmed = rawTitle.trim()
  if (!trimmed) return { title: '', year: null }
  const match = trimmed.match(TRAILING_YEAR_RE)
  if (match) {
    const year = Number(match[2])
    const prefix = match[1].trim()
    if (prefix && year >= MIN_YEAR && year <= MAX_YEAR) {
      return { title: prefix, year: match[2] }
    }
  }
  return { title: trimmed, year: null }
}
