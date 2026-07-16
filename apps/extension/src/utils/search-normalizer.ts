/**
 * Search query normalizer for Douban search enhancement.
 * Shared between content enhancers and popup components.
 */

/**
 * Standardize search query for Douban.
 *
 * Handles PT release naming patterns:
 * - "The.Great.Escaper.2023.1080p.BluRay" → "The Great Escaper 2023"
 * - "记忆碎片[2000].Memento.1080p" → "记忆碎片 Memento 2000"
 * - "S01E01" / "S1E1" / "S01.E01" / "S01 E01" → "Season 1"
 * - "Season 01" / "Episode 01" → "Season 1"
 *
 * Strategy: keep title + year, strip everything after last year.
 */
export function normalizeSearchQuery(raw: string): string {
  let s = raw
    .replace(/\./g, ' ')
    .replace(/[[\]()（）【】「」『』〈〉《》]/g, ' ')
    .replace(/[*#@!~`%^&+=|\\{}:;"'<>,?/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // Convert season/episode markers to Douban-supported "Season N" format
  // Handles: S01E01, S1E1, S01.E01, S01 E01, Season 01, Episode 01
  s = s
    .replace(/\bS\d{1,2}(?:\.?\s*E\d{1,2})?\b/gi, 'Season 1')
    .replace(/\b(?:Season|Episode)\s+0+(\d{1,2})\b/gi, (_, n) => `Season ${parseInt(n)}`)
    .trim()

  const yearMatches = [...s.matchAll(/\b(19\d{2}|20\d{2})\b/g)]

  if (yearMatches.length >= 2) {
    const secondYearEnd = yearMatches[1].index! + 4
    s = s.slice(0, secondYearEnd).trim()
  } else if (yearMatches.length === 1) {
    const yearEnd = yearMatches[0].index! + 4
    s = s.slice(0, yearEnd).trim()
  }

  return s
}
