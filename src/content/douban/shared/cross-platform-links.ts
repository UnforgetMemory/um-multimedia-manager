/**
 * Cross-platform link extraction for Douban pages.
 *
 * Extracts IMDb / TMDB IDs from a Douban detail page's #info section and
 * merges them into the record's linkedIds map.
 *
 * Moved here from the legacy content-script handler (handlers/douban-scanner.ts)
 * so the new Douban overlay system has a stable shared home (see legacy-bridge).
 */

import type { Provider } from '@/config'
import type { UrlIdentity } from '@/types'

/**
 * Extract cross-platform linked IDs (IMDb, TMDB) from a Douban detail page.
 * Stored as full keys (e.g. "movie::tt23810070") so reverse lookups can resolve the type.
 */
export function extractCrossPlatformLinks(
  identity: UrlIdentity,
  existingLinkedIds: Record<string, string> = {}
): Record<string, string> {
  const links = { ...existingLinkedIds }

  // Extract IMDb ID (from the #info section)
  const infoEl = document.querySelector('#info')
  if (infoEl) {
    const infoText = infoEl.innerHTML

    // IMDb format: "tt" + digits
    const imdbMatch = infoText.match(/IMDb:<\/span>\s*(tt\d+)/i)
    if (imdbMatch) {
      // Store full key format: type::providerId
      links.imdb = `${identity.type}::${imdbMatch[1]}`
    }

    // TMDB movie/tv id from themoviedb.org link
    const tmdbMatch = infoText.match(/themoviedb\.org\/(?:movie|tv)\/(\d+)/)
    if (tmdbMatch) {
      links.tmdb = `${identity.type}::${tmdbMatch[1]}`
    }
  }

  return links
}

/** A linked-platform target for the domain sync engine (mirrors RecordService.SyncTarget). */
export interface CrossPlatformTarget {
  platform: Provider
  key: string
  url: string
}

/**
 * Build the sync targets for the IMDb/TMDB links carried by a douban record.
 * Pure (no DOM): link keys are the full `{type}::{providerId}` form produced
 * by extractCrossPlatformLinks.
 */
export function buildCrossPlatformTargets(
  mergedLinks: Record<string, string>,
): CrossPlatformTarget[] {
  const targets: CrossPlatformTarget[] = []
  for (const platform of ['imdb', 'tmdb'] as const) {
    const linkKey = mergedLinks[platform]
    if (!linkKey) continue
    const [type, pid] = linkKey.split('::')
    // TMDB namespaces URLs by media type (/movie/ vs /tv/); IMDb titles are
    // typeless. Deriving the path from the key keeps it consistent with the
    // storage key that resolveKey derives back from this URL.
    const url = platform === 'imdb'
      ? `https://www.imdb.com/title/${pid}/`
      : `https://www.themoviedb.org/${type === 'tv' ? 'tv' : 'movie'}/${pid}/`
    targets.push({ platform, key: linkKey, url })
  }
  return targets
}
