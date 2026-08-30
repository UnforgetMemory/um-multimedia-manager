/**
 * Cross-store statistics aggregation — pure domain logic.
 *
 * No framework or platform imports (domain purity convention: this module may
 * only depend on other domain modules), so the aggregation contract can be
 * unit-tested without chrome, IndexedDB, or message-layer fakes.
 *
 * Extracted verbatim from background/handlers/data.ts (refactor plan W0,
 * docs/audit/refactor-plan-wxt-alignment-2026-08-21.md §3.2-S2 preview):
 * behavior is intentionally identical, including two quirks that callers
 * rely on:
 *   1. Media types are parsed from the store key prefix (`movie::123`) and an
 *      unknown prefix (e.g. `game::…`) is silently NOT counted in any media
 *      dimension (only in `total`).
 *   2. A platform id missing from the counts shape (`'unknown'`) is counted
 *      in `total` but in no platform dimension.
 * tests/unit/statistics-characterization.spec.ts locks both.
 */

/** Shape mirrored from `Statistics` in src/types/index.ts (kept structural —
 *  domain must not import from src/types). */
export interface RecordStatistics {
  total: number
  movie: number
  tv: number
  music: number
  book: number
  douban: number
  imdb: number
  neodb: number
  tmdb: number
  bilibili: number
  youtube: number
  bangumi: number
}

/** One physical store's entries plus its resolved platform id. */
export interface PlatformStoreEntries<R = unknown> {
  /** Physical store name, e.g. `'douban_records'` */
  storeName: string
  /** Platform id resolved by the caller's store→platform map; `'unknown'` if unmapped */
  platform: string
  entries: ReadonlyArray<{ key: string; record: R }>
}

function emptyStatistics(): RecordStatistics {
  return {
    total: 0, movie: 0, tv: 0, music: 0, book: 0,
    douban: 0, imdb: 0, neodb: 0, tmdb: 0,
    bilibili: 0, youtube: 0, bangumi: 0,
  }
}

/**
 * Aggregate per-store entry lists into cross-platform/media-type counts.
 *
 * Pure: iterates the given snapshots once each, in order; no I/O.
 */
export function computeStatistics(
  stores: readonly PlatformStoreEntries[],
): RecordStatistics {
  const stats = emptyStatistics()

  for (const { platform, entries } of stores) {
    stats.total += entries.length
    if (platform && platform in stats) {
      // Platform dimension accumulates the whole store's entry count,
      // unlike the media dimensions which count one per matching key.
      bumpPlatform(stats, platform, entries.length)
    }

    for (const entry of entries) {
      const type = entry.key.split('::')[0]
      if (type && type in stats) {
        bumpMediaType(stats, type)
      }
    }
  }

  return stats
}

/**
 * Explicit field bumps — replaces the previous
 * `stats as unknown as Record<string, number>` indirection so field drift is
 * caught at compile time instead of being silently ignored by the index
 * signature (2026-08-29 typed pass, research paper §5.3 #11).
 */
function bumpPlatform(stats: RecordStatistics, platform: string, count: number): void {
  if (platform === 'douban') stats.douban += count
  else if (platform === 'imdb') stats.imdb += count
  else if (platform === 'neodb') stats.neodb += count
  else if (platform === 'tmdb') stats.tmdb += count
  else if (platform === 'bilibili') stats.bilibili += count
  else if (platform === 'youtube') stats.youtube += count
  else if (platform === 'bangumi') stats.bangumi += count
  // Unknown platform ids were already excluded by the `platform in stats`
  // guard — same behaviour as the pre-refactor index-signature version.
}

function bumpMediaType(stats: RecordStatistics, type: string): void {
  if (type === 'movie') stats.movie++
  else if (type === 'tv') stats.tv++
  else if (type === 'music') stats.music++
  else if (type === 'book') stats.book++
  // Unknown key prefixes (e.g. `game::…`) are NOT counted in any media
  // dimension — locked by tests/unit/statistics-characterization.spec.ts.
}

/**
 * Flatten per-store entry lists into one provider-tagged list.
 *
 * Stores named in `videoStores` have every record's type normalized to
 * `'video'` (legacy bilibili/youtube rows carry movie/bvid-style prefixes);
 * all other stores keep their key-prefix type verbatim.
 */
export function flattenRecords<R extends object>(
  stores: readonly PlatformStoreEntries<R>[],
  videoStores: ReadonlySet<string>,
): Array<R & { type: string; provider: string; providerId: string }> {
  const all: Array<R & { type: string; provider: string; providerId: string }> = []

  for (const { storeName, platform, entries } of stores) {
    for (const entry of entries) {
      const [type, ...idParts] = entry.key.split('::')
      const normalizedType = videoStores.has(storeName) ? 'video' : type
      all.push({
        ...entry.record,
        type: normalizedType,
        provider: platform || 'unknown',
        providerId: idParts.join('::'),
      })
    }
  }

  return all
}

// ==================== Yearly statistics (ADR-021 Wave-G) ====================

export interface YearlyStatRow {
  year: number
  count: number
  /** Bar width percentage (0–100) relative to the peak year */
  pct: number
  /** count(year) − count(year − 1); year − 1 counts as 0 when before all data */
  delta: number
}

export interface YearlyStatsResult {
  /** Newest → oldest, CONTINUOUS (gap years filled with 0) */
  rows: YearlyStatRow[]
  maxCount: number
  /** The starting year: `now.getFullYear() − 1` */
  lastYear: number
}

/**
 * Yearly totals from ISO timestamps, starting at LAST year and running back
 * to the earliest data year. The range is continuous — years without records
 * appear as 0 so the timeline and year-over-year deltas stay honest.
 *
 * Pure: no clock reads (caller passes `now`), no I/O.
 */
export function computeYearlyStats(
  timestamps: readonly (string | undefined)[],
  now: Date = new Date(),
): YearlyStatsResult {
  const lastYear = now.getFullYear() - 1

  const counts = new Map<number, number>()
  for (const ts of timestamps) {
    if (!ts) continue
    const y = new Date(ts).getFullYear()
    if (Number.isNaN(y)) continue
    counts.set(y, (counts.get(y) ?? 0) + 1)
  }

  const dataYears = [...counts.keys()].filter(y => y <= lastYear)
  // Nothing at or before last year → no timeline to show
  if (!dataYears.length) return { rows: [], maxCount: 0, lastYear }
  const oldestDataYear = Math.min(...dataYears)

  const rows: YearlyStatRow[] = []
  let maxCount = 0
  for (let y = lastYear; y >= oldestDataYear; y--) {
    const count = counts.get(y) ?? 0
    const prev = counts.get(y - 1) ?? 0
    maxCount = Math.max(maxCount, count)
    rows.push({ year: y, count, pct: 0, delta: count - prev })
  }
  for (const row of rows) row.pct = Math.round((row.count / Math.max(1, maxCount)) * 100)

  return { rows, maxCount, lastYear }
}
