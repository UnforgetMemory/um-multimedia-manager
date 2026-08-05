/**
 * Pure helpers mapping douban subject URLs/ids to candidate keys in the
 * `douban_records` store. No DOM, no chrome — unit-testable.
 *
 * Douban subject URLs do not distinguish movie from tv (both live under
 * movie.douban.com/subject/N), so movie/tv-ambiguous subjects request BOTH
 * keys; dbGetBulk returns whichever exists.
 */

/** Classify a subject URL host into a record-key media type. */
export function subjectTypeFromHref(href: string): 'music' | 'book' | 'movie-tv' | null {
  try {
    const url = new URL(href)
    const host = url.hostname
    if (host.includes('music.douban.com')) return 'music'
    if (host.includes('book.douban.com')) return 'book'
    if (host.includes('movie.douban.com') || host.includes('www.douban.com')) return 'movie-tv'
  } catch {
    // Invalid or relative URL — unknown type
  }
  return null
}

/** Full `{type}::{id}` store keys to bulk-read for a subject id. */
export function candidateRecordKeys(id: string, href?: string): string[] {
  const type = href ? subjectTypeFromHref(href) : null
  if (type === 'music') return [`music::${id}`]
  if (type === 'book') return [`book::${id}`]
  return [`movie::${id}`, `tv::${id}`]
}

/**
 * Whether a `record:updated` event key concerns any currently-visible id.
 * `visible` holds full `{type}::{id}` keys; the event key may be a full key,
 * a bare id, or `'*'` for bulk writes.
 */
export function matchesVisibleId(visible: string[], eventKey: string): boolean {
  if (eventKey === '*') return true
  const bare = eventKey.split('::').pop()
  return visible.some((r) => r === eventKey || r === bare)
}
