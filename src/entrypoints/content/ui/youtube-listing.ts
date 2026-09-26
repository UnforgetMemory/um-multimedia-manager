/**
 * Pure helpers + batched dimmer pass for the YouTube listing mode
 * (homepage / search / channel) — audit §P-C.
 *
 * Mirrors content/ui/bilibili-listing.ts discipline:
 * - one DB_GET_BULK per scan pass (store keys `{type}::{providerId}`,
 *   canonical 'movie::' + videoId via storeKey) instead of per-card DB_GET;
 * - batch keys built via bulkKeysForVideoIds (unit-testable, same as
 *   bulkKeysForBvids for Bilibili);
 * - bulk-read failure is diagnosed via console.warn (never a silent
 *   all-badge blackout), default badges stay.
 *
 * No extension APIs here — the entrypoint injects the dbGetBulk reader.
 */

import { parseYoutubeVideoId, storeKey, STATUS_COLORS, STATUS_LABELS } from './video-overlay-pure';

/** status >= DIMMER_THRESHOLD triggers the dimmer attribute */
export const DIMMER_THRESHOLD = 2;

/** Unified video card selectors — covers all YouTube layouts */
export const VIDEO_CARD_SELECTOR = [
  'ytd-rich-item-renderer',
  'ytd-video-renderer',
  'ytd-compact-video-renderer',
  'ytd-playlist-panel-video-renderer',
  'ytd-grid-video-renderer',
  'yt-lockup-view-model',
].join(',');

export const LISTING_PROCESSED_ATTR = 'data-umm-yt-processed';
export const LISTING_VIEWED_ATTR = 'data-umm-yt-viewed';
export const LISTING_BADGE_CLASS = 'umm-yt-badge';
export const LISTING_STYLE_ID = 'umm-yt-listing-styles';

/** Selector for cards not yet claimed by a previous pass (idempotent scan). */
export function unprocessedCardSelector(): string {
  return VIDEO_CARD_SELECTOR.split(',')
    .map((s) => `${s.trim()}:not([${LISTING_PROCESSED_ATTR}])`)
    .join(',');
}

export function shouldDimStatus(status: number): boolean {
  return status >= DIMMER_THRESHOLD;
}

export interface CardLike {
  getAttribute(name: string): string | null;
  querySelector(sel: string): { getAttribute(name: string): string | null } | null;
  querySelectorAll(sel: string): ArrayLike<{ getAttribute(name: string): string | null }>;
}

/** Extract a videoId from a card: primary /watch?v= anchor first, then any href. */
export function extractVideoIdFromCard(card: CardLike): string | null {
  const link = card.querySelector('a[href*="/watch?v="]');
  if (link) {
    const id = parseYoutubeVideoId(link.getAttribute('href') || '');
    if (id) return id;
  }
  const allLinks = card.querySelectorAll('[href*="/watch?v="]');
  for (let i = 0; i < allLinks.length; i++) {
    const id = parseYoutubeVideoId(allLinks[i]!.getAttribute('href') || '');
    if (id) return id;
  }
  return null;
}

/** Canonical bulk keys for visible videoIds (`movie::<id>`). */
export function bulkKeysForVideoIds(videoIds: string[]): string[] {
  return videoIds.map((id) => storeKey(id));
}

export interface ListingRecordLike {
  status?: number;
  rating?: number;
}

export type ListingBulkReader = (
  storeName: string,
  keys: string[],
) => Promise<Array<{ key: string; record?: ListingRecordLike | null }>>;

/**
 * Injected CSS is intentionally narrow (attr-scoped dim + badge class only);
 * position:relative is applied per-anchor in JS by setListingBadge.
 */
export function buildListingDimmerCss(): string {
  return `
        [${LISTING_VIEWED_ATTR}="true"],
        [data-umm-yt-dimmed] {
          opacity: 0.35 !important;
          filter: grayscale(80%) !important;
          transition: opacity 0.3s ease-in-out, filter 0.3s ease-in-out !important;
        }
        [${LISTING_VIEWED_ATTR}="true"]:hover,
        [data-umm-yt-dimmed]:hover {
          opacity: 1 !important;
          filter: grayscale(0%) !important;
        }
        .${LISTING_BADGE_CLASS} {
          position: absolute !important;
          top: 8px !important;
          left: 8px !important;
          z-index: 10 !important;
          padding: 2px 8px !important;
          border-radius: 6px !important;
          font-size: 11px !important;
          font-weight: 700 !important;
          font-family: Roboto, Arial, sans-serif !important;
          color: #fff !important;
          line-height: 1.5 !important;
          user-select: none !important;
          box-shadow: 0 2px 6px rgba(0,0,0,0.25) !important;
          cursor: default !important;
        }
        /* Reduced-motion (P-E wave): the dim reveal is an opacity/filter fade — kill it. */
        @media (prefers-reduced-motion: reduce) {
          [${LISTING_VIEWED_ATTR}="true"],
          [data-umm-yt-dimmed] {
            transition: none !important;
          }
        }
  `.trim();
}

/**
 * Create/update the status badge on a card. Anchors on the thumbnail shell
 * when present (legacy semantics preserved from youtube-homepage.content).
 */
export function setListingBadge(card: HTMLElement, status: number, rating?: number): HTMLElement {
  const doc = card.ownerDocument;
  let badge = card.querySelector<HTMLElement>(`.${LISTING_BADGE_CLASS}`);
  if (!badge) {
    badge = doc.createElement('div');
    badge.className = LISTING_BADGE_CLASS;
    const anchor = card.querySelector(
      '#thumbnail, ytd-thumbnail a, a#thumbnail, .ytLockupViewModelContentImage, yt-thumbnail-view-model',
    );
    if (anchor) {
      const thumb = (anchor.closest('#dismissible') ||
        anchor.closest('ytd-thumbnail') ||
        anchor) as HTMLElement;
      thumb.style.position = 'relative';
      thumb.appendChild(badge);
    } else {
      card.appendChild(badge);
    }
  }
  let label = STATUS_LABELS[status] || STATUS_LABELS[0];
  if (status === 2 && rating && rating > 0) label += ' ' + rating;
  badge.textContent = label;
  badge.style.background = STATUS_COLORS[status] || STATUS_COLORS[0];
  return badge;
}

export interface YtListingPassResult {
  scanned: number;
  withId: number;
  dimmed: number;
  badgeHits: number;
  bulkKeys: string[];
}

/**
 * One listing scan pass: collect unprocessed cards, build bulk keys,
 * resolve statuses with a SINGLE dbGetBulk call, then dim + re-badge.
 * A failed bulk read logs a console.warn diagnostic and leaves the
 * default badges in place (never a silent all-blackout).
 */
export async function runYoutubeListingPass(opts: {
  root: ParentNode;
  storeName: string;
  dbGetBulk: ListingBulkReader;
}): Promise<YtListingPassResult> {
  const { root, storeName, dbGetBulk } = opts;
  const cards = root.querySelectorAll<HTMLElement>(unprocessedCardSelector());
  const result: YtListingPassResult = {
    scanned: cards.length,
    withId: 0,
    dimmed: 0,
    badgeHits: 0,
    bulkKeys: [],
  };
  if (cards.length === 0) return result;

  const batch: Array<{ el: HTMLElement; vid: string }> = [];
  cards.forEach((card) => {
    card.setAttribute(LISTING_PROCESSED_ATTR, 'true');
    const vid = extractVideoIdFromCard(card);
    if (!vid) return;
    batch.push({ el: card, vid });
    setListingBadge(card, 0); // show default "未看" badge immediately
  });
  result.withId = batch.length;
  if (batch.length === 0) return result;

  const keys = bulkKeysForVideoIds(batch.map((b) => b.vid));
  result.bulkKeys = keys;

  try {
    const entries = await dbGetBulk(storeName, keys);
    const byKey = new Map<string, ListingRecordLike>();
    for (const entry of entries) {
      if (!entry?.key) continue;
      byKey.set(entry.key, entry.record || {});
    }
    for (const { el, vid } of batch) {
      const record = byKey.get(storeKey(vid));
      if (!record) continue;
      const status = record.status || 0;
      const rating = record.rating || 0;
      if (shouldDimStatus(status)) {
        el.setAttribute(LISTING_VIEWED_ATTR, 'true');
        result.dimmed += 1;
      }
      setListingBadge(el, status, rating);
      result.badgeHits += 1;
    }
  } catch (err) {
    // Background unreachable / semantic failure — one warn per batch keeps
    // the outage diagnosable instead of silently killing every badge.
    console.warn('[UMM YT Listing] DB_GET_BULK failed, badges stay at default:', err);
  }
  return result;
}
