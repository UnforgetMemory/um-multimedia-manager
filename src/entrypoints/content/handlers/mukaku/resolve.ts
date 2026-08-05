/**
 * Pure per-card decision for the mukaku list-page dimmer.
 *
 * Extracted from handler.ts processVisibleCards loop (handler.ts:341-383) so
 * the decision is unit-testable and ready for Set-based data structures.
 *
 * ── Confirmed Set key formats (from cache.ts getIdSet:100-105) ──────────────
 * `watchedDouban` / `watchedImdb`: BARE ids. Records are stored under
 * `{type}::{id}` keys in `{provider}_records` (e.g. `movie::12345`), and
 * getIdSet strips the prefix (`key.slice(prefix.length)`) before inserting
 * into the Set. Compare probe ids against bare values — never against
 * `movie::`-prefixed keys.
 * `watched`: bare mvIds, same shape as `unwatchedExpiry` keys (extractMvId
 * output; stored via WATCHED_SET_KEY).
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Decision order (mirrors the handler exactly):
 *   1. `watched.has(mvId)`                                → 'dim'
 *   2. `unwatchedExpiry[mvId]` exists && `now < expiry`   → 'skip-unwatched'
 *      (strict `<` — at `now === expiry` the card falls through to probing,
 *      matching `Date.now() < expiry` in the handler)
 *   3. probe cache hit (`probe !== null`)                 → matched ? 'dim'
 *      : 'skip-unwatched'. Match is truthiness-based:
 *      `(doubanId && watchedDouban.has(doubanId)) || (imdbId && watchedImdb.has(imdbId))`.
 *      A probe entry with both ids null is a hit with no match → 'skip-unwatched'.
 *   4. otherwise                                          → 'needs-probe'
 *      (caller batches the DB probe fetch; the action only says the card
 *      needs one — it does NOT resolve the probe itself)
 */

export type CardAction = 'dim' | 'skip-unwatched' | 'needs-probe'

export interface ResolveContext {
  /** Watched mvIds (bare, from batchWatchedSet). */
  watched: Set<string>
  /** mvId -> expiry timestamp; entry exists means the card was probed unwatched. */
  unwatchedExpiry: Record<string, number>
  /** Timestamp to evaluate `unwatchedExpiry` against (injected for testability). */
  now: number
  /** In-memory probe cache hit for this mvId; null when absent. */
  probe: { doubanId: string | null; imdbId: string | null } | null
  /** Watched douban ids — BARE ids (prefix already stripped by getIdSet). */
  watchedDouban: Set<string>
  /** Watched imdb ids — BARE ids (prefix already stripped by getIdSet). */
  watchedImdb: Set<string>
}

export function resolveCardState(mvId: string, ctx: ResolveContext): CardAction {
  if (ctx.watched.has(mvId)) return 'dim'

  const expiry = ctx.unwatchedExpiry[mvId]
  if (expiry !== undefined && ctx.now < expiry) return 'skip-unwatched'

  if (ctx.probe !== null) {
    const { doubanId, imdbId } = ctx.probe
    const matched =
      (doubanId && ctx.watchedDouban.has(doubanId)) ||
      (imdbId && ctx.watchedImdb.has(imdbId))
    return matched ? 'dim' : 'skip-unwatched'
  }

  return 'needs-probe'
}
