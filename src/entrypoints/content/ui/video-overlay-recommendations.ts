/**
 * Recommendation-card decoration for the shared video-overlay module (T18).
 *
 * Split out of video-overlay.ts (ADR-026 req 9 file-size gate): scans visible
 * recommendation cards, bulk-reads their records from IndexedDB via the
 * background, and stamps status badges / dimmed attributes. Container mutation
 * watching is exposed as an observer factory so the host owns teardown.
 *
 * Status codes: 0=NONE, 1=WISHLIST, 2=DONE, 3=DOING
 */

import { Store } from '@/engine/database';
import { STATUS_COLORS as COLORS, STATUS_LABELS as LABELS, storeKey } from './video-overlay-pure';

/** Recommendation section of VideoOverlaySiteConfig (structural, no import cycle). */
export interface RecommendationConfig {
  cardSelector: string;
  linkSelector: string;
  idFromLink: (link: HTMLAnchorElement) => string | null;
  dimmedAttr: string;
  thumbSelector: string;
  containerSelectors: string[];
}

type RecordMap = Map<string, { status: number; rating: number }>;

function decorateRecommendations(
  rec: RecommendationConfig,
  fontFamily: string,
  recordMap: RecordMap,
): void {
  const items = document.querySelectorAll<HTMLElement>(rec.cardSelector);
  for (const item of items) {
    const link = item.querySelector<HTMLAnchorElement>(rec.linkSelector);
    if (!link) continue;
    const vid = rec.idFromLink(link);
    if (!vid) continue;
    const entry = recordMap.get(storeKey(vid));
    const st = entry?.status ?? 0;
    const ra = entry?.rating ?? 0;

    if (st === 2) {
      item.setAttribute(rec.dimmedAttr, 'true');
    }
    const existing = item.querySelector('[data-umm-rec-badge]');
    if (existing) continue;
    const badge = document.createElement('div');
    badge.setAttribute('data-umm-rec-badge', '');
    let badgeText = LABELS[st]?.slice(0, 2) ?? '';
    if (st === 2 && ra > 0) badgeText += ' ' + ra;
    badge.textContent = badgeText;
    badge.style.cssText =
      'position:absolute;top:4px;left:4px;z-index:10;font-size:10px;font-weight:700;' +
      'background:' +
      COLORS[st] +
      ';color:#fff;padding:1px 5px;border-radius:6px;' +
      'font-family:' +
      fontFamily +
      ';line-height:1.6;cursor:default';
    const thumb = item.querySelector<HTMLElement>(rec.thumbSelector);
    if (thumb) {
      thumb.style.position = 'relative';
      thumb.appendChild(badge);
    }
  }
}

/**
 * Bulk-read records for the visible cards and decorate after a short delay.
 *
 * An empty key list means there is nothing on screen to badge, so the pass does
 * no DB work at all: the previous `dbGetAll` fallback walked the whole store to
 * build a map that zero cards would consult (worst on a page whose recommendations
 * have not hydrated yet, where the host observer re-fires this pass repeatedly).
 */
export function refreshRecommendations(
  storeName: string,
  rec: RecommendationConfig,
  fontFamily: string,
): Promise<void> {
  const keys = [...document.querySelectorAll<HTMLElement>(rec.cardSelector)]
    .map((item) => {
      const link = item.querySelector<HTMLAnchorElement>(rec.linkSelector);
      if (!link) return null;
      const vid = rec.idFromLink(link);
      return vid ? storeKey(vid) : null;
    })
    .filter((key): key is string => key !== null);
  if (keys.length === 0) return Promise.resolve();
  return Store.dbGetBulk(storeName, keys)
    .then((entries) => {
      const recordMap: RecordMap = new Map();
      for (const entry of entries) {
        if (entry?.key && typeof entry.record?.status === 'number') {
          recordMap.set(entry.key, {
            status: entry.record.status,
            rating: entry.record.rating || 0,
          });
        }
      }
      setTimeout(() => decorateRecommendations(rec, fontFamily, recordMap), 500);
    })
    .catch(() => {
      // background unreachable — skip decoration
    });
}

/**
 * Observe the first matching recommendation container. Returns null when no
 * container is on the page yet (caller keeps its current observer, if any).
 */
export function observeRecommendations(
  rec: RecommendationConfig,
  onVisibleChange: () => void,
): MutationObserver | null {
  let target: Element | null = null;
  for (const sel of rec.containerSelectors) {
    target = document.querySelector(sel);
    if (target) break;
  }
  if (!target) return null;
  const observer = new MutationObserver(onVisibleChange);
  observer.observe(target, { childList: true, subtree: true });
  return observer;
}
