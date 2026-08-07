import { test, expect } from '@playwright/test'
import { resolveCardState, type ResolveContext } from '@/entrypoints/content/handlers/mukaku/resolve'

/**
 * T9 — resolveCardState: pure per-card decision for the mukaku list-page dimmer.
 *
 * The per-mvId judgment caches (watched set / unwatchedExpiry map) are removed
 * project-wide. The decision is now driven by:
 *   - a probe mapping (mvId → douban/imdb id, or null when unknown), and
 *   - REAL-TIME local watched-id sets (watchedDouban / watchedImdb).
 *
 * Decision order (exact):
 *   1. `noAssociation === true`                        → 'skip'
 *      (session cooldown wins over everything — never dims, never needs-probe)
 *   2. `probe !== null` → matched                      → 'dim' : 'skip'
 *      matched = (doubanId && watchedDouban.has(doubanId))
 *             || (imdbId && watchedImdb.has(imdbId))
 *      A probe with both ids null (defensive legacy) → 'skip'.
 *   3. otherwise (null probe, no cooldown)             → 'needs-probe'
 *
 * Set key format (confirmed from cache.ts getWatchedIdSets): watchedDouban /
 * watchedImdb hold BARE ids — the `{type}::` prefix is stripped before
 * insertion. Compare probe ids (also bare) against them — never against
 * `movie::`-prefixed keys.
 */

function ctx(overrides: Partial<ResolveContext> = {}): ResolveContext {
  return {
    probe: null,
    noAssociation: false,
    watchedDouban: new Set<string>(),
    watchedImdb: new Set<string>(),
    ...overrides,
  }
}

test('noAssociation skips even when the probe would match — rule 1 beats everything', () => {
  // Given: session cooldown set AND a probe matching watched ids
  const c = ctx({
    noAssociation: true,
    probe: { doubanId: 'd1', imdbId: null },
    watchedDouban: new Set(['d1']),
  })

  // When
  const action = resolveCardState(c)

  // Then: cooldown short-circuits before the probe is consulted
  expect(action).toBe('skip')
})

test('noAssociation skips with a null probe too — never needs-probe', () => {
  // Given: cooldown set, nothing probed yet
  const c = ctx({ noAssociation: true })

  // When
  const action = resolveCardState(c)

  // Then
  expect(action).toBe('skip')
})

test('probe hit with matching douban id dims', () => {
  // Given: probe found doubanId that is in watchedDouban
  const c = ctx({
    probe: { doubanId: 'd1', imdbId: null },
    watchedDouban: new Set(['d1']),
  })

  // When
  const action = resolveCardState(c)

  // Then
  expect(action).toBe('dim')
})

test('probe hit with matching imdb id dims', () => {
  // Given: probe found imdbId that is in watchedImdb
  const c = ctx({
    probe: { doubanId: null, imdbId: 'tt1' },
    watchedImdb: new Set(['tt1']),
  })

  // When
  const action = resolveCardState(c)

  // Then
  expect(action).toBe('dim')
})

test('probe hit without any match skips', () => {
  // Given: probe found ids, but neither is in the watched id sets
  const c = ctx({
    probe: { doubanId: 'd9', imdbId: 'tt9' },
    watchedDouban: new Set(['d1']),
    watchedImdb: new Set(['tt1']),
  })

  // When
  const action = resolveCardState(c)

  // Then
  expect(action).toBe('skip')
})

test('probe hit with null ids skips', () => {
  // Given: probe entry exists but both ids are null (defensive legacy)
  const c = ctx({ probe: { doubanId: null, imdbId: null } })

  // When
  const action = resolveCardState(c)

  // Then
  expect(action).toBe('skip')
})

test('decision reflects the live watched sets — same probe, empty sets skip', () => {
  // Given: probe found ids, but the watched sets are empty right now
  const c = ctx({
    probe: { doubanId: 'd1', imdbId: 'tt1' },
    watchedDouban: new Set<string>(),
    watchedImdb: new Set<string>(),
  })

  // When
  const action = resolveCardState(c)

  // Then: real-time sets drive the result — no mvId-level cache to consult
  expect(action).toBe('skip')
})

test('decision reflects the live watched sets — same probe, ids present dims', () => {
  // Given: the exact same probe, watched sets now contain the ids
  const c = ctx({
    probe: { doubanId: 'd1', imdbId: 'tt1' },
    watchedDouban: new Set(['d1']),
    watchedImdb: new Set(['tt1']),
  })

  // When
  const action = resolveCardState(c)

  // Then: the SAME probe yields a different verdict purely from the live sets
  expect(action).toBe('dim')
})

test('watched sets hold bare ids — `movie::` prefixed keys do not match probe ids', () => {
  // Given: watchedDouban stores prefixed keys (the shape this task must NOT assume)
  const c = ctx({
    probe: { doubanId: '12345', imdbId: null },
    watchedDouban: new Set(['movie::12345']),
  })

  // When
  const action = resolveCardState(c)

  // Then: bare probe id must NOT match the prefixed key → skip
  expect(action).toBe('skip')
})

test('no probe and no cooldown needs probe', () => {
  // Given: nothing known about this card
  const c = ctx()

  // When
  const action = resolveCardState(c)

  // Then: caller batches the DB probe fetch
  expect(action).toBe('needs-probe')
})
