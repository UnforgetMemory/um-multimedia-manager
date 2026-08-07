/**
 * Pure per-card decision for the mukaku list-page dimmer.
 *
 * Extracted from handler.ts processVisibleCards loop so the decision is
 * unit-testable. The per-mvId judgment caches (watched set / unwatchedExpiry
 * map) are REMOVED project-wide — the decision is now driven by a probe
 * mapping (mvId → douban/imdb id) plus REAL-TIME local watched-id sets.
 *
 * ── Set key formats (from cache.ts getWatchedIdSets) ─────────────────────
 * `watchedDouban` / `watchedImdb`: BARE ids. Records are stored under
 * `{type}::{id}` keys in `{provider}_records` (e.g. `movie::12345`), and
 * getWatchedIdSets strips the prefix (`key.slice(prefix.length)`) before
 * inserting into the Set. Compare probe ids against bare values — never
 * against `movie::`-prefixed keys.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Decision order (exact):
 *   1. `noAssociation === true`                       → 'skip'
 *      (session cooldown wins over everything — never dims, never needs-probe)
 *   2. `probe !== null` → matched                     → 'dim' : 'skip'.
 *      matched = `(doubanId && watchedDouban.has(doubanId)) ||
 *                 (imdbId && watchedImdb.has(imdbId))`.
 *      A probe with both ids null (defensive legacy) is a hit with no match
 *      → 'skip'.
 *   3. otherwise (null probe, no cooldown)            → 'needs-probe'
 *      (caller batches the DB probe fetch; the action only says the card
 *      needs one — it does NOT resolve the probe itself)
 */

export type CardAction = 'dim' | 'skip' | 'needs-probe'

export interface ResolveContext {
  /** Mapping hit for this mvId; null when unknown (needs probe). Ids are BARE (no movie:: prefix). */
  probe: { doubanId: string | null; imdbId: string | null } | null
  /** Session cooldown flag: this card was confirmed to have no douban/imdb association this page session. */
  noAssociation: boolean
  /** Realtime watched douban ids — BARE ids. */
  watchedDouban: Set<string>
  /** Realtime watched imdb ids — BARE ids. */
  watchedImdb: Set<string>
}

export function resolveCardState(ctx: ResolveContext): CardAction {
  if (ctx.noAssociation) return 'skip'

  if (ctx.probe !== null) {
    const { doubanId, imdbId } = ctx.probe
    const matched =
      (doubanId && ctx.watchedDouban.has(doubanId)) ||
      (imdbId && ctx.watchedImdb.has(imdbId))
    return matched ? 'dim' : 'skip'
  }

  return 'needs-probe'
}
