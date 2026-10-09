/**
 * TMDB (themoviedb.org) page handler.
 *
 * - Homepage: scans lazily-loaded cards, injects UMM status badges
 * - Detail: locates title anchor, injects status chip
 */

import type { UrlIdentity, StoreRecord } from '@/types';
import { Store } from '@/engine/database';
import { Utils, throttle } from '@/libraries/utils';
import { runChunked, type ChunkedRun } from '@/libraries/utils/dom-chunk';
import { intervalWhenVisible } from '@/libraries/utils/visibility';
import { createStatusChip } from '../utils/dom';
import { createDetailPageHandler } from './create-detail-handler';

// ---- Constants ----

/**
 * Card grouping node: the nearest `div.relative` ancestor of a poster link.
 * It is NOT the enumeration source — see `TMDB_POSTER_LINK_SELECTOR`.
 */
const TMDB_CARD_SELECTOR = 'div.relative';

/**
 * Poster link identified by data-media-type attr (more reliable than href regex).
 * This doubles as the enumeration source for a scan: every key the handler acts
 * on is derived from this one element, so iterating it is exactly the card set —
 * whereas the old `document.querySelectorAll('div.relative')` returned every
 * TMDB SPA wrapper carrying that Tailwind class (hundreds of nested containers,
 * each re-searched for a poster link on every body mutation and poll tick).
 */
const TMDB_POSTER_LINK_SELECTOR =
  'a[data-media-type][href*="/movie/"], a[data-media-type][href*="/tv/"]';

/** Detail page title anchor. */
const TMDB_TITLE_SELECTOR = '.title a[href*="/movie/"], .title a[href*="/tv/"]';

/** Class of the injected homepage badge — also the "already painted" marker. */
const UMM_BADGE_CLASS = 'umm-homepage-badge';

/** Cards badged per animation frame (same budget as the bilibili/YouTube passes). */
const TMDB_BADGE_CHUNK_SIZE = 10;

// ---- Homepage — Card Badge Injection ----

/** One card: the grouping container, the badge host, and the store key to paint. */
interface TMDBBadgeUnit {
  container: HTMLElement;
  posterLink: HTMLElement;
  key: string;
}

/**
 * Extract TMDB ID and media type from a poster link element.
 * Uses the reliable data-media-type attr and numeric ID from href.
 */
function extractTMDBIdFromLink(posterLink: Element): { id: string; mediaType: string } | null {
  const href = posterLink.getAttribute('href') || '';
  const mediaType = posterLink.getAttribute('data-media-type') || '';
  if (!mediaType || !href) return null;
  const idMatch = href.match(/\/(movie|tv)\/(\d+)/);
  if (!idMatch) return null;
  const segType = idMatch[1];
  const segId = idMatch[2];
  if (!segType || !segId) return null;
  return { id: segId, mediaType: segType };
}

/**
 * Cards currently rendered, in document order, one per card container.
 *
 * `claimed` keeps the old "first poster link of a container wins" rule: a card
 * whose leading link is unparseable is skipped as a whole, exactly as when the
 * old per-container scan resolved that card's link and got no ID.
 */
function collectTMDBBadgeUnits(): TMDBBadgeUnit[] {
  const units: TMDBBadgeUnit[] = [];
  const claimed = new Set<HTMLElement>();
  for (const posterLink of document.querySelectorAll<HTMLElement>(TMDB_POSTER_LINK_SELECTOR)) {
    const container = posterLink.closest<HTMLElement>(TMDB_CARD_SELECTOR) ?? posterLink;
    if (claimed.has(container)) continue;
    claimed.add(container);
    const extracted = extractTMDBIdFromLink(posterLink);
    if (!extracted) continue;
    units.push({ container, posterLink, key: `${extracted.mediaType}::${extracted.id}` });
  }
  return units;
}

/**
 * Fetch tmdb_records for the given store keys into a Map<storeKey, StoreRecord>.
 *
 * The empty-key fallback here is DELIBERATE and differs from the ones removed in
 * X31-B/X40/X58: the caller only reaches it on the very first pass of a lazy
 * homepage, and the result is merged into a cache that later card batches read
 * from — so the scan is consumed, not discarded. Where the other sites re-ran a
 * whole-store read per mutation with nothing to paint, this one warms a cache
 * once. Keep it that way only while that holds; if the caller ever starts
 * calling this per visible card, it becomes the same defect.
 */
async function buildRecordMap(keys: string[]): Promise<Map<string, StoreRecord>> {
  const entries =
    keys.length > 0
      ? await Store.dbGetBulk('tmdb_records', keys)
      : await Store.dbGetAll('tmdb_records');
  const map = new Map<string, StoreRecord>();
  for (const { key, record } of entries) {
    map.set(key, record);
  }
  return map;
}

/** Create a homepage badge DOM element with status label + optional rating. */
function createHomepageBadge(status: number, rating: number): HTMLElement {
  const badge = document.createElement('span');
  badge.className = UMM_BADGE_CLASS;
  badge.dataset.status =
    status === 2 ? 'done' : status === 3 ? 'doing' : status === 1 ? 'wish' : 'none';

  const label = status === 2 ? '✅' : status === 3 ? '▶️' : status === 1 ? '⭐' : '⏳';
  const ratingText = rating > 0 ? ` ${Utils.formatRating10(rating)}/10` : '';

  badge.innerHTML = `${label}${ratingText ? ` ${ratingText}` : ''}`;

  badge.setAttribute('role', 'status');
  badge.setAttribute('aria-label', `${label}${ratingText ? `, ${ratingText}` : ''}`);

  // TMDB's more-button (circle-more) sits at top-right; move badge to top-left.
  badge.style.left = '4px';
  badge.style.right = 'auto';

  return badge;
}

/** A card queued for painting, with its geometry read already resolved. */
interface TMDBBadgeStep {
  unit: TMDBBadgeUnit;
  /** Computed `position` snapshot — the write phase must never measure again. */
  position: string;
}

/**
 * Read phase for one card: locate the badge host and measure it, mutating nothing.
 * Returns null when the card is already painted, so a re-scan costs no write and
 * (crucially) no forced layout.
 */
function readTMDBBadgeStep(unit: TMDBBadgeUnit): TMDBBadgeStep | null {
  if (unit.container.querySelector(`.${UMM_BADGE_CLASS}`)) return null;
  return { unit, position: getComputedStyle(unit.posterLink).position };
}

/**
 * Write phase for one card: consumes the cached read. Injects into the poster
 * link (gets position:relative for child absolute positioning).
 */
function writeTMDBBadge(step: TMDBBadgeStep, recordMap: Map<string, StoreRecord>): void {
  const record = recordMap.get(step.unit.key);
  const status = record?.status === 2 ? 2 : record?.status === 3 ? 3 : record?.status === 1 ? 1 : 0;
  const rating = record?.rating || 0;
  const badge = createHomepageBadge(status, rating);

  if (step.position === 'static') step.unit.posterLink.style.position = 'relative';
  step.unit.posterLink.appendChild(badge);
}

/**
 * The one in-flight chunked write pass.
 *
 * WHY the single-run guard: `scanAllCards` awaits a bulk DB read before it
 * paints, and its own badge inserts re-arm the body MutationObserver — so
 * without supersession two passes interleave, doubling the writes per frame and
 * pushing `getComputedStyle` back into the write loop (the forced-layout bug
 * class already fixed for the bilibili/YouTube listings).
 */
let activeBadgeRun: ChunkedRun | null = null;

function cancelBadgeRun(): void {
  activeBadgeRun?.cancel();
  activeBadgeRun = null;
}

/** Badge the given cards, one chunk per animation frame, reads before writes. */
function runBadgePass(units: TMDBBadgeUnit[], recordMap: Map<string, StoreRecord>): Promise<void> {
  cancelBadgeRun();

  const groups: TMDBBadgeUnit[][] = [];
  for (let i = 0; i < units.length; i += TMDB_BADGE_CHUNK_SIZE) {
    groups.push(units.slice(i, i + TMDB_BADGE_CHUNK_SIZE));
  }

  const run = runChunked(
    groups,
    (group) => {
      const steps: TMDBBadgeStep[] = [];
      for (const unit of group) {
        const step = readTMDBBadgeStep(unit);
        if (step) steps.push(step);
      }
      for (const step of steps) writeTMDBBadge(step, recordMap);
    },
    { chunkSize: 1 },
  );
  activeBadgeRun = run;
  void run.promise.finally(() => {
    if (activeBadgeRun === run) activeBadgeRun = null;
  });
  return run.promise;
}

/**
 * Observe the TMDB homepage for dynamically loaded cards.
 *
 * Dual mechanism:
 * - MutationObserver on document.body catches SPA card insertion.
 * - setInterval poll catches in-place class/attribute transitions.
 */
function observeTMDBGrids(recordMap: Map<string, StoreRecord>): () => void {
  // Keys already fetched — new cards trigger a bulk fetch of only the missing ones.
  const seen = new Set<string>(recordMap.keys());
  let initialScanDone = false;
  let stopped = false;

  const scanAllCards = throttle(async () => {
    if (stopped) return;
    const units = collectTMDBBadgeUnits();
    const keys = units.map((unit) => unit.key);
    const missing = keys.filter((key) => !seen.has(key));
    for (const key of missing) seen.add(key);
    // First scan with no cards yet (lazy-loading) → full-store fallback;
    // once real keys exist, bulk-fetch only the newly appeared cards.
    if (missing.length > 0 || (!initialScanDone && keys.length === 0)) {
      initialScanDone = true;
      const fetched = await buildRecordMap(missing);
      if (stopped) return;
      for (const [key, record] of fetched) recordMap.set(key, record);
    }
    await runBadgePass(units, recordMap);
  }, 280);

  const bodyObserver = new MutationObserver(scanAllCards);
  bodyObserver.observe(document.body, { childList: true, subtree: true });

  const pollInterval = intervalWhenVisible(scanAllCards, 2000);

  scanAllCards();

  return () => {
    stopped = true;
    bodyObserver.disconnect();
    pollInterval.destroy();
    // Teardown owns the frames it started: a stranded pass would keep writing
    // into a document whose route has already moved on.
    cancelBadgeRun();
  };
}

/**
 * Homepage scan teardown. `beforeunload` alone is not enough: TMDB is an SPA, so
 * home → detail keeps the same document alive while the observer, the poll and
 * the keyed record map go on scanning a grid that is gone.
 */
let activeHomepageCleanup: (() => void) | null = null;

/** Entry point: homepage card badge injection. Returns the route teardown. */
export async function handleTMDBHomepage(): Promise<() => void> {
  // The first throttled scan (leading edge) performs the initial keyed fetch.
  const recordMap = new Map<string, StoreRecord>();
  // A re-dispatch on the same route replaces the previous scan set.
  activeHomepageCleanup?.();

  const stop = observeTMDBGrids(recordMap);
  const teardown = (): void => {
    stop();
    recordMap.clear();
    if (activeHomepageCleanup === teardown) activeHomepageCleanup = null;
  };
  activeHomepageCleanup = teardown;
  window.addEventListener('beforeunload', teardown, { once: true });
  return teardown;
}

// ---- Detail Page — Status Chip Injection ----

/** Render or replace the status chip above the title. */
export async function renderTMDBStatusChip(
  identity: UrlIdentity,
  status: number,
  rating: number,
  note: string = '',
): Promise<void> {
  const headerSection = document.querySelector('.header_poster_wrapper section.header.poster');
  if (!headerSection) return;

  const existingChip = headerSection.querySelector('.umm-status-chip[data-umm-owner]');

  const chip = createStatusChip(identity.type, status, rating, note);
  chip.dataset.ummOwner = `tmdb-${identity.type}`;
  // Neutralise TMDB flex layout: keep inline-flex, no forced width
  chip.style.marginBottom = '12px';

  if (existingChip) {
    existingChip.replaceWith(chip);
  } else {
    const titleEl = headerSection.querySelector('.title');
    if (titleEl) {
      headerSection.insertBefore(chip, titleEl);
    } else {
      headerSection.insertAdjacentElement('afterbegin', chip);
    }
  }
}

/**
 * Read TMDB Vibes rating (#user_rating data-rating 0-100), convert to 0-10 scale.
 * data-rating > 0 → user has rated (watched). e.g. 65% → 7/10.
 */
function scanTMDBVibesStatus(): { status: string; rating: number } {
  const userRatingEl = document.getElementById('user_rating');
  if (!userRatingEl) {
    return { status: 'none', rating: 0 };
  }

  const ratingAttr = userRatingEl.getAttribute('data-rating');
  if (!ratingAttr) {
    return { status: 'none', rating: 0 };
  }

  const vibesRating = parseInt(ratingAttr, 10);
  if (isNaN(vibesRating) || vibesRating <= 0) {
    return { status: 'none', rating: 0 };
  }

  // Convert 0–100 scale to 0–10 scale
  const rating = Math.round(vibesRating / 10);
  return { status: 'done', rating };
}

/** Entry point: detail page status chip injection. */
const _handleTMDBDetailPage = createDetailPageHandler({
  platform: 'tmdb',
  titleSelector: TMDB_TITLE_SELECTOR,
  scanFn: () => scanTMDBVibesStatus(),
  renderFn: renderTMDBStatusChip,
  savedMessageKey: 'tmdb.saved',
  mergeStatusFn: (pageState, localRecord) => {
    if (pageState.status === 'done') return 2;
    if (localRecord?.status === 2) return 2;
    if (localRecord?.status === 3) return 3;
    if (localRecord?.status === 1) return 1;
    return 0;
  },
});

export async function handleTMDBDetailPage(identity: UrlIdentity): Promise<(() => void) | void> {
  if (!identity) return;
  try {
    return await _handleTMDBDetailPage(identity);
  } catch {
    return;
  }
}
