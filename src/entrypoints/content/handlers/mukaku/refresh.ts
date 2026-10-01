/**
 * Mukaku Dimmer real-time refresh pure functions.
 *
 * Event path (S1/S4):
 * 1. clearMukakuMarkers / clearProcessedMarkers — clear processed markers and the
 *    umm-dimmed class so unwatched items can be re-evaluated (un-dimmed);
 * 2. shouldRefreshForEvent — only douban/imdb record events are worth a Mukaku refresh;
 * 3. isDetailContextStale — detect whether the mvId context is stale after a route change;
 * 4. createDebouncedScheduler — 300ms trailing-edge debounce, coalesces event storms
 *    (re-exported from pt/dimmer/refresh — single implementation, do not redefine here).
 *
 * All functions decouple DOM and the real clock via injection (element / timer / data)
 * for unit testability.
 */

import { runChunked, type ChunkOptions, type ChunkedRun } from '@/libraries/utils/dom-chunk';

export {
  createDebouncedScheduler,
  type TimerAdapter,
} from '@/entrypoints/content/enhancers/pt/dimmer/refresh';

/** Record stores that trigger a Mukaku page refresh (Mukaku cards only link douban/imdb). */
const REFRESH_STORES = new Set(['douban_records', 'imdb_records']);

/** Cards un-marked per animation frame (a browse page can carry 100+ `.video-card`). */
export const MUKAKU_CLEAR_CHUNK_SIZE = 20;

/** Minimal structural type: an element that can clear processed markers and the dim class (Element satisfies this shape). */
export type MukakuMarkerElement = {
  removeAttribute(name: string): void;
  classList?: { remove(className: string): void };
};

/**
 * Remove the processed marker (data-umm-mukaku-processed) and the dim class (umm-dimmed)
 * from a card. Both must go: un-dimming unwatched items needs umm-dimmed removed, and
 * re-evaluation needs the marker removed. Falls back to clearing only the attribute when
 * classList is missing (safe degradation).
 */
export function clearMukakuMarkers(el: MukakuMarkerElement): void {
  el.removeAttribute('data-umm-mukaku-processed');
  el.classList?.remove('umm-dimmed');
}

/**
 * Clear markers and the dim class from every processed card, restoring the initial
 * visual state for re-evaluation.
 *
 * Frame-chunked (same shape as the PT-side X9-B passes): a whole-document
 * `querySelectorAll(...).forEach(remove)` over a hundred-plus cards is one
 * host-page long task, and record events arrive in storms (a bulk import emits
 * one per record). The caller owns the returned run — cancel it before starting
 * a newer pass, and await `promise` before rescanning (it ALWAYS settles, even
 * when cancelled). `options` is the runChunked test seam for the frame scheduler.
 */
export function clearProcessedMarkers(
  root: Pick<Document, 'querySelectorAll'>,
  options: ChunkOptions = {},
): ChunkedRun {
  return runChunked(
    Array.from(root.querySelectorAll('[data-umm-mukaku-processed="true"]')),
    clearMukakuMarkers,
    { chunkSize: MUKAKU_CLEAR_CHUNK_SIZE, ...options },
  );
}

/**
 * Whether a record event is worth triggering a Mukaku refresh: true only when data is an
 * object with storeName douban_records / imdb_records. Unknown / null / non-object → false.
 */
export function shouldRefreshForEvent(data: unknown): boolean {
  if (typeof data !== 'object' || data === null) return false;
  if (!('storeName' in data)) return false;
  const storeName = data.storeName;
  return typeof storeName === 'string' && REFRESH_STORES.has(storeName);
}

/**
 * Whether the detail-page context is stale: extract mvId from currentHref with the
 * site's own regex (/\/mv\/(\d+)/i; undefined when unmatched) — stale if it differs
 * from originalMvId.
 */
export function isDetailContextStale(originalMvId: string, currentHref: string): boolean {
  const extracted = currentHref.match(/\/mv\/(\d+)/i)?.[1];
  return extracted !== originalMvId;
}
