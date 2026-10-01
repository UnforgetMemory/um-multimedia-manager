/**
 * Element-keyed memo of what provider ids each PT row resolved to.
 *
 * WHY: on scan-type PT sites (NexusPHP/MTeam lists) a row's douban/imdb id is
 * NOT in the DOM — it is discovered by resolving the torrent title through the
 * pt_id_cache bulk lookup. The text/href haystack in `clearResolvedMarkers`
 * therefore never matches those rows, and a single-key record:updated /
 * record:deleted event leaves a stale resolved marker for the page lifetime
 * (only a bulk `*` event or a reload recovered). The memo records the ids each
 * row actually resolved to so the marker-clear pass can decide by identity.
 */

import { rowMightMatchKey } from './refresh';

/**
 * Bare provider ids a row resolved to (record-key type prefixes such as
 * `movie::` are stripped on write). Deliberately minimal: every scan pass
 * (nexusphp direct-id / cache-bulk / background-scan, mteam row pass /
 * cache fallback) produces at most one douban id + one imdb id per row.
 */
export interface RowProviderIds {
  doubanId?: string;
  imdbId?: string;
}

/** WeakMap keyed by the row element: detached rows collect with their entry. */
const rowIdsMemo = new WeakMap<Element, RowProviderIds>();

/** `movie::1292052` → `1292052`; a bare id passes through unchanged. */
function toBareProviderId(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const sep = value.lastIndexOf('::');
  return sep >= 0 ? value.slice(sep + 2) : value;
}

/**
 * Record the ids a row resolved to. No-op when the pass extracted no id —
 * leaving such rows memo-less keeps the haystack fallback in charge.
 */
export function memoRowIds(el: Element, ids: RowProviderIds): void {
  const doubanId = toBareProviderId(ids.doubanId);
  const imdbId = toBareProviderId(ids.imdbId);
  if (!doubanId && !imdbId) return;
  rowIdsMemo.set(el, { doubanId, imdbId });
}

/**
 * Whether the memoized row resolved to this record-change key's provider id.
 * `undefined` = the element was never memoized (caller falls back to the
 * text/href haystack).
 */
export function memoOwnsRecordKey(el: Element, key: string): boolean | undefined {
  const ids = rowIdsMemo.get(el);
  if (!ids) return undefined;
  const id = toBareProviderId(key);
  if (!id) return true;
  return ids.doubanId === id || ids.imdbId === id;
}

/**
 * Whether a row's resolved marker must be cleared before the refresh round
 * for `key`. Bulk `*` short-circuits (no memo read, no haystack). The memo is
 * authoritative when present — clearing a row that resolved to other ids is
 * pure re-scan churn. The haystack remains only for never-memoized rows
 * (markers from older rounds or sites we do not instrument).
 */
export function shouldClearRowForRecordKey(el: Element, key: string): boolean {
  if (key === '*' || key === '') return true;
  const owned = memoOwnsRecordKey(el, key);
  if (owned !== undefined) return owned;
  const hrefs = Array.from(el.querySelectorAll('a[href]'))
    .map((a) => a.getAttribute('href') ?? '')
    .join(' ');
  return rowMightMatchKey(`${el.textContent ?? ''} ${hrefs}`, key);
}
