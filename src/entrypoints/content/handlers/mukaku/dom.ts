// ─── DOM extraction helpers ──────────────────────────

/**
 * Extract the Mukaku video id (mvId).
 *
 * Verified site shapes (2026-08-07):
 *  - Detail URL:        /mv/{doub_id}                     (string path)
 *  - Home/category:     <a to="/mv/{doub_id}" class="video-card"> — a native
 *    <a> rendered with the `to` prop instead of `href` (site template
 *    `l(s,{to:"/mv/"+e.doub_id,...})`)
 *  - Search page:       <div class="video-card"> with NO link — mvId lives only
 *    in Vue component state (onClick does be.push("/mv/"+doub_id)). The handler
 *    covers this shape via getVideoList image matching; extractMvId returns null.
 *
 * The source is a structural (duck-typed) shape so tests run in Node without a
 * DOM.
 */

/** Minimal card-source shape (structural typing, Node-testable). */
export interface MvIdSource {
  getAttribute(name: string): string | null
  querySelector(selectors: string): Element | null
  textContent: string | null
}

const MV_ID_PATTERN = /\/mv\/(\d+)/i

/** Extract the filename from an image URL (card-matching key; ignores domain/protocol differences and query/hash suffixes). */
export function imageFileName(src: string): string | null {
  const path = src.split('?')[0].split('#')[0]
  const fileName = path.split('/').pop()
  return fileName && fileName.length > 0 ? fileName : null
}

export function extractMvId(value: string | MvIdSource): string | null {
  if (typeof value === 'string') {
    return value.match(MV_ID_PATTERN)?.[1] ?? null
  }

  // 1. href attribute (classic <a href>)
  const href = value.getAttribute('href')
  const hrefMatch = href?.match(MV_ID_PATTERN)
  if (hrefMatch) return hrefMatch[1]

  // 2. to attribute (site home/category cards: <a to="/mv/..."> without href)
  const to = value.getAttribute('to')
  const toMatch = to?.match(MV_ID_PATTERN)
  if (toMatch) return toMatch[1]

  // 3. Descendant link fallback (wrapped card markup)
  const descendant = value.querySelector('a[href*="/mv/"], a[to*="/mv/"]')
  const descendantHref = descendant?.getAttribute('href')
  const descendantTo = descendant?.getAttribute('to')
  const descendantMatch = (descendantHref || descendantTo)?.match(MV_ID_PATTERN)
  if (descendantMatch) return descendantMatch[1]

  // 4. Text fallback (legacy behavior when neither href nor to is present)
  const textMatch = value.textContent?.match(MV_ID_PATTERN)
  if (textMatch) return textMatch[1]

  return null
}

/**
 * Extract linked Douban/IMDb ids from the DOM.
 */
export function extractLinkedIdsFromDOM(root: HTMLElement | Document): {
  doubanId: string | null
  imdbId: string | null
} {
  const result = { doubanId: null as string | null, imdbId: null as string | null }

  const links = root.querySelectorAll('a[href*="douban.com/subject/"], a[href*="imdb.com/title/"]')

  for (const link of Array.from(links)) {
    const anchor = link as HTMLAnchorElement
    const href = anchor.href || anchor.getAttribute('href') || ''

    if (!result.doubanId) {
      const match = href.match(/movie\.douban\.com\/subject\/(\d+)/i)
      if (match) result.doubanId = match[1]
    }

    if (!result.imdbId) {
      const match = href.match(/imdb\.com\/title\/((?:tt)?\d+)/i)
      if (match) {
        const id = match[1]
        result.imdbId = id.startsWith('tt') ? id : `tt${id}`
      }
    }

    if (result.doubanId && result.imdbId) break
  }

  return result
}
