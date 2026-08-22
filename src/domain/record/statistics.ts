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

function bump(counts: Record<string, number>, dimension: string): void {
  counts[dimension]++
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
  const counts = stats as unknown as Record<string, number>

  for (const { platform, entries } of stores) {
    stats.total += entries.length
    if (platform && platform in stats) {
      // Platform dimension accumulates the whole store's entry count,
      // unlike the media dimensions which count one per matching key.
      counts[platform] += entries.length
    }

    for (const entry of entries) {
      const type = entry.key.split('::')[0]
      if (type && type in stats) {
        bump(counts, type)
      }
    }
  }

  return stats
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
