import { test, expect } from '@playwright/test'
import { resolveCardState, type ResolveContext } from '@/entrypoints/content/handlers/mukaku/resolve'

/**
 * T9 — resolveCardState: pure per-card decision extracted from handler.ts
 * processVisibleCards loop (handler.ts:341-383). Decision order must mirror
 * the original loop exactly:
 *   1. watched set hit          → 'dim'
 *   2. unwatched expiry fresh   → 'skip-unwatched'  (strict: now < expiry)
 *   3. probe cache hit          → matched ? 'dim' : 'skip-unwatched'
 *   4. otherwise                → 'needs-probe'
 *
 * Set key format (confirmed from cache.ts getIdSet:100-105): watchedDouban /
 * watchedImdb hold BARE ids — the `{type}::` prefix is stripped before
 * insertion. The `watched` set holds bare mvIds (extractMvId output).
 */

const NOW = 1_000_000

function ctx(overrides: Partial<ResolveContext> = {}): ResolveContext {
  return {
    watched: new Set<string>(),
    unwatchedExpiry: {},
    now: NOW,
    probe: null,
    watchedDouban: new Set<string>(),
    watchedImdb: new Set<string>(),
    ...overrides,
  }
}

test('watched mvId dims — rule 1 beats everything else', () => {
  // Given: mvId in watched set, also fresh in unwatchedExpiry and matched by probe
  const c = ctx({
    watched: new Set(['mv-1']),
    unwatchedExpiry: { 'mv-1': NOW + 5000 },
    probe: { doubanId: 'd1', imdbId: null },
    watchedDouban: new Set(['d1']),
  })

  // When
  const action = resolveCardState('mv-1', c)

  // Then
  expect(action).toBe('dim')
})

test('watched set lookup uses the bare mvId (no prefix keys)', () => {
  // Given: watched set stores bare mvId per extractMvId; a prefixed key must not match
  const c = ctx({ watched: new Set(['movie::mv-1']) })

  // When
  const action = resolveCardState('mv-1', c)

  // Then
  expect(action).toBe('needs-probe')
})

test('unwatched unexpired skips', () => {
  // Given: mvId fresh in unwatchedExpiry (now < expiry)
  const c = ctx({ unwatchedExpiry: { 'mv-2': NOW + 5000 } })

  // When
  const action = resolveCardState('mv-2', c)

  // Then
  expect(action).toBe('skip-unwatched')
})

test('unwatched fresh beats a matching probe — rule 2 precedes rule 3', () => {
  // Given: fresh expiry AND a probe that would match watched ids
  const c = ctx({
    unwatchedExpiry: { 'mv-2': NOW + 5000 },
    probe: { doubanId: 'd1', imdbId: null },
    watchedDouban: new Set(['d1']),
  })

  // When
  const action = resolveCardState('mv-2', c)

  // Then: expiry short-circuits before the probe is consulted
  expect(action).toBe('skip-unwatched')
})

test('unwatched exactly at expiry boundary proceeds to probe — strict `now < expiry`', () => {
  // Given: now === expiry (handler: `Date.now() < expiry` is false at equality)
  const c = ctx({ unwatchedExpiry: { 'mv-3': NOW } })

  // When: no probe available
  const action = resolveCardState('mv-3', c)

  // Then: falls through to probe decision
  expect(action).toBe('needs-probe')
})

test('unwatched expired proceeds to probe', () => {
  // Given: expiry in the past
  const c = ctx({ unwatchedExpiry: { 'mv-4': NOW - 1 } })

  // When: no probe available
  const action = resolveCardState('mv-4', c)

  // Then
  expect(action).toBe('needs-probe')
})

test('expired unwatched with matching probe dims — boundary falls through to rule 3', () => {
  // Given: now === expiry (not fresh) plus a matching probe
  const c = ctx({
    unwatchedExpiry: { 'mv-3': NOW },
    probe: { doubanId: 'd1', imdbId: null },
    watchedDouban: new Set(['d1']),
  })

  // When
  const action = resolveCardState('mv-3', c)

  // Then: rule 2 does not apply, rule 3 matches → dim
  expect(action).toBe('dim')
})

test('probe hit with matching douban id dims', () => {
  // Given: probe found doubanId that is in watchedDouban
  const c = ctx({
    probe: { doubanId: 'd1', imdbId: null },
    watchedDouban: new Set(['d1']),
  })

  // When
  const action = resolveCardState('mv-5', c)

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
  const action = resolveCardState('mv-6', c)

  // Then
  expect(action).toBe('dim')
})

test('probe hit without any match skips as unwatched', () => {
  // Given: probe found ids, but neither is in the watched id sets
  const c = ctx({
    probe: { doubanId: 'd9', imdbId: 'tt9' },
    watchedDouban: new Set(['d1']),
    watchedImdb: new Set(['tt1']),
  })

  // When
  const action = resolveCardState('mv-7', c)

  // Then
  expect(action).toBe('skip-unwatched')
})

test('probe hit with null ids skips as unwatched', () => {
  // Given: probe cache entry exists but both ids are null (handler: cached object
  // is truthy, match is falsy → unwatched)
  const c = ctx({ probe: { doubanId: null, imdbId: null } })

  // When
  const action = resolveCardState('mv-8', c)

  // Then
  expect(action).toBe('skip-unwatched')
})

test('probe sets hold bare ids — `movie::` prefixed keys do not match probe ids', () => {
  // Given: watchedDouban stores prefixed keys (the shape this task must NOT assume)
  const c = ctx({
    probe: { doubanId: '12345', imdbId: null },
    watchedDouban: new Set(['movie::12345']),
  })

  // When
  const action = resolveCardState('mv-9', c)

  // Then: bare probe id must NOT match the prefixed key → unwatched
  expect(action).toBe('skip-unwatched')
})

test('no probe and no cache state needs probe', () => {
  // Given: nothing known about mvId
  const c = ctx()

  // When
  const action = resolveCardState('mv-10', c)

  // Then: caller batches the DB probe fetch
  expect(action).toBe('needs-probe')
})
