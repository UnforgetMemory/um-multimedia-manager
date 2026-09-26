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
  getAttribute(name: string): string | null;
  querySelector(selectors: string): Element | null;
  textContent: string | null;
}

const MV_ID_PATTERN = /\/mv\/(\d+)/i;

/** Extract the filename from an image URL (card-matching key; ignores domain/protocol differences and query/hash suffixes). */
export function imageFileName(src: string): string | null {
  const [withoutQuery = ''] = src.split('?');
  const [withoutHash = ''] = withoutQuery.split('#');
  const fileName = withoutHash.split('/').pop();
  return fileName && fileName.length > 0 ? fileName : null;
}

export function extractMvId(value: string | MvIdSource): string | null {
  if (typeof value === 'string') {
    return value.match(MV_ID_PATTERN)?.[1] ?? null;
  }

  // 1. href attribute (classic <a href>)
  const href = value.getAttribute('href');
  const hrefId = href?.match(MV_ID_PATTERN)?.[1];
  if (hrefId) return hrefId;

  // 2. to attribute (site home/category cards: <a to="/mv/..."> without href)
  const to = value.getAttribute('to');
  const toId = to?.match(MV_ID_PATTERN)?.[1];
  if (toId) return toId;

  // 3. Descendant link fallback (wrapped card markup)
  const descendant = value.querySelector('a[href*="/mv/"], a[to*="/mv/"]');
  const descendantHref = descendant?.getAttribute('href');
  const descendantTo = descendant?.getAttribute('to');
  const descendantId = (descendantHref || descendantTo)?.match(MV_ID_PATTERN)?.[1];
  if (descendantId) return descendantId;

  // 4. Text fallback (legacy behavior when neither href nor to is present)
  const textId = value.textContent?.match(MV_ID_PATTERN)?.[1];
  if (textId) return textId;

  return null;
}

/**
 * Extract linked Douban/IMDb ids from the DOM.
 */
export function extractLinkedIdsFromDOM(root: HTMLElement | Document): {
  doubanId: string | null;
  imdbId: string | null;
} {
  const result = { doubanId: null as string | null, imdbId: null as string | null };

  const links = root.querySelectorAll('a[href*="douban.com/subject/"], a[href*="imdb.com/title/"]');

  for (const link of Array.from(links)) {
    const anchor = link as HTMLAnchorElement;
    const href = anchor.href || anchor.getAttribute('href') || '';

    if (!result.doubanId) {
      const subjectId = href.match(/movie\.douban\.com\/subject\/(\d+)/i)?.[1];
      if (subjectId) result.doubanId = subjectId;
    }

    if (!result.imdbId) {
      const id = href.match(/imdb\.com\/title\/((?:tt)?\d+)/i)?.[1];
      if (id) result.imdbId = id.startsWith('tt') ? id : `tt${id}`;
    }

    if (result.doubanId && result.imdbId) break;
  }

  return result;
}

/** Card marked as already collected in this page session (idempotency marker). */
export const PROCESSED_ATTR = 'data-umm-mukaku-processed';

export interface CollectedCards {
  /** Total `.video-card` nodes seen (pre-filter; for scan logging). */
  total: number;
  /** Cards with an extractable mvId; already marked processed. */
  unprocessed: Array<{ cardEl: HTMLElement; mvId: string }>;
  /** Linkless cards (search-page `div.video-card`, mvId lives only in Vue state). */
  noIdCards: HTMLElement[];
}

/**
 * Collect unprocessed `.video-card` nodes into two buckets (pure: no class state).
 *
 * Extracted from handler.processVisibleCards so the collection rules — the
 * per-scan cap and the "linkless cards are parked for the list-API fallback"
 * split — are testable without instantiating the handler.
 *
 * `limit` caps `unprocessed.length + noIdCards.length` (hostile pages must not
 * drive unbounded probes/state growth). Cards already carrying `PROCESSED_ATTR`
 * are skipped; matched cards are marked immediately (before any async work) so a
 * concurrent scan cannot re-collect them.
 */
export function collectVisibleCards(root: ParentNode, limit: number): CollectedCards {
  const unprocessed: Array<{ cardEl: HTMLElement; mvId: string }> = [];
  const noIdCards: HTMLElement[] = [];
  const all = Array.from(root.querySelectorAll('.video-card'));

  for (const card of all) {
    if (unprocessed.length + noIdCards.length >= limit) break;
    const cardEl = card as HTMLElement;
    if (cardEl.getAttribute(PROCESSED_ATTR) === 'true') continue;
    const mvId = extractMvId(cardEl);
    if (!mvId) {
      noIdCards.push(cardEl);
      continue;
    }
    cardEl.setAttribute(PROCESSED_ATTR, 'true');
    unprocessed.push({ cardEl, mvId });
  }

  return { total: all.length, unprocessed, noIdCards };
}
