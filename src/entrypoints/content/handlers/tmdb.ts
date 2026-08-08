/**
 * TMDB (themoviedb.org) page handler.
 *
 * - Homepage: scans lazily-loaded cards, injects UMM status badges
 * - Detail: locates title anchor, injects status chip
 */

import type { UrlIdentity, StoreRecord } from '@/types'
import { Store } from '@/features/database'
import { Utils, throttle } from '@/utils'
import { intervalWhenVisible } from '@/utils/visibility'
import { createStatusChip } from '../utils/dom'
import { createDetailPageHandler } from './create-detail-handler'

// ---- Constants ----

/** Each TMDB card is a div.relative containing a poster link with data-media-type. */
const TMDB_CARD_SELECTOR = 'div.relative'

/** Poster link identified by data-media-type attr (more reliable than href regex). */
const TMDB_POSTER_LINK_SELECTOR = 'a[data-media-type][href*="/movie/"], a[data-media-type][href*="/tv/"]'

/** Detail page title anchor. */
const TMDB_TITLE_SELECTOR = '.title a[href*="/movie/"], .title a[href*="/tv/"]'

// ---- Homepage — Card Badge Injection ----

/**
 * Extract TMDB ID and media type from a card element.
 * Uses the reliable data-media-type attr and numeric ID from href.
 */
function extractTMDBIdFromCard(card: Element): { id: string; mediaType: string } | null {
  const posterLink = card.querySelector<HTMLAnchorElement>(TMDB_POSTER_LINK_SELECTOR)
  if (!posterLink) return null
  const href = posterLink.getAttribute('href') || ''
  const mediaType = posterLink.getAttribute('data-media-type') || ''
  if (!mediaType || !href) return null
  const idMatch = href.match(/\/(movie|tv)\/(\d+)/)
  if (!idMatch) return null
  return { id: idMatch[2], mediaType: idMatch[1] }
}

/**
 * Fetch tmdb_records for the given store keys into a Map<storeKey, StoreRecord>.
 * Empty key set (no cards rendered yet) falls back to the full-store scan so
 * badges never silently disappear before the first card batch appears.
 */
async function buildRecordMap(keys: string[]): Promise<Map<string, StoreRecord>> {
  const entries = keys.length > 0
    ? await Store.dbGetBulk('tmdb_records', keys)
    : await Store.dbGetAll('tmdb_records')
  const map = new Map<string, StoreRecord>()
  for (const { key, record } of entries) {
    map.set(key, record)
  }
  return map
}

/** Collect the store keys ({mediaType}::{id}) of all currently rendered cards. */
function collectTMDBKeys(): string[] {
  return [...document.querySelectorAll<HTMLElement>(TMDB_CARD_SELECTOR)]
    .map((card) => {
      const extracted = extractTMDBIdFromCard(card)
      return extracted ? `${extracted.mediaType}::${extracted.id}` : null
    })
    .filter((key): key is string => key !== null)
}

/** Create a homepage badge DOM element with status label + optional rating. */
function createHomepageBadge(status: number, rating: number): HTMLElement {
  const badge = document.createElement('span')
  badge.className = 'umm-homepage-badge'
  badge.dataset.status =
    status === 2 ? 'done' : status === 3 ? 'doing' : status === 1 ? 'wish' : 'none'

  const label =
    status === 2 ? '✅' : status === 3 ? '▶️' : status === 1 ? '⭐' : '⏳'
  const ratingText = rating > 0 ? ` ${Utils.formatRating10(rating)}/10` : ''

  badge.innerHTML = `${label}${ratingText ? ` ${ratingText}` : ''}`

  badge.setAttribute('role', 'status')
  badge.setAttribute(
    'aria-label',
    `${label}${ratingText ? `, ${ratingText}` : ''}`
  )

  // TMDB's more-button (circle-more) sits at top-right; move badge to top-left.
  badge.style.left = '4px'
  badge.style.right = 'auto'

  return badge
}

/**
 * Render a badge on a single card.
 * Injects into the poster link (gets position:relative for child absolute positioning).
 */
async function renderCardBadge(
  card: Element,
  recordMap: Map<string, StoreRecord>
): Promise<void> {
  if (card.querySelector('.umm-homepage-badge')) return

  const extracted = extractTMDBIdFromCard(card)
  if (!extracted) return

  const key = `${extracted.mediaType}::${extracted.id}`
  const record = recordMap.get(key)

  const status = record?.status === 2 ? 2 : record?.status === 3 ? 3 : record?.status === 1 ? 1 : 0
  const rating = record?.rating || 0

  const badge = createHomepageBadge(status, rating)

  const posterLink = card.querySelector<HTMLElement>(TMDB_POSTER_LINK_SELECTOR)
  if (posterLink) {
    if (getComputedStyle(posterLink).position === 'static') {
      posterLink.style.position = 'relative'
    }
    posterLink.appendChild(badge)
  } else {
    card.appendChild(badge)
  }
}

/**
 * Observe the TMDB homepage for dynamically loaded cards.
 *
 * Dual mechanism:
 * - MutationObserver on document.body catches SPA card insertion.
 * - setInterval poll catches in-place class/attribute transitions.
 */
function observeTMDBGrids(
  recordMap: Map<string, StoreRecord>
): () => void {
  // Keys already fetched — new cards trigger a bulk fetch of only the missing ones.
  const seen = new Set<string>(recordMap.keys())
  let initialScanDone = false

  const scanAllCards = throttle(async () => {
    const cards = document.querySelectorAll<HTMLElement>(TMDB_CARD_SELECTOR)
    const keys = collectTMDBKeys()
    const missing = keys.filter((key) => !seen.has(key))
    for (const key of missing) seen.add(key)
    // First scan with no cards yet (lazy-loading) → full-store fallback;
    // once real keys exist, bulk-fetch only the newly appeared cards.
    if (missing.length > 0 || (!initialScanDone && keys.length === 0)) {
      initialScanDone = true
      const fetched = await buildRecordMap(missing)
      for (const [key, record] of fetched) recordMap.set(key, record)
    }
    const pendings: Promise<void>[] = []
    for (const card of cards) {
      if (!card.querySelector(TMDB_POSTER_LINK_SELECTOR)) continue
      pendings.push(renderCardBadge(card, recordMap))
    }
    await Promise.all(pendings)
  }, 280)

  const bodyObserver = new MutationObserver(scanAllCards)
  bodyObserver.observe(document.body, { childList: true, subtree: true })

  const pollInterval = intervalWhenVisible(scanAllCards, 2000)

  scanAllCards()

  return () => {
    bodyObserver.disconnect()
    pollInterval.destroy()
  }
}

/** Entry point: homepage card badge injection. */
export async function handleTMDBHomepage(): Promise<void> {
  // The first throttled scan (leading edge) performs the initial keyed fetch.
  const recordMap = new Map<string, StoreRecord>()
  const cleanup = observeTMDBGrids(recordMap)

  window.addEventListener('beforeunload', cleanup, { once: true })
}

// ---- Detail Page — Status Chip Injection ----

/** Render or replace the status chip above the title. */
export async function renderTMDBStatusChip(
  identity: UrlIdentity,
  status: number,
  rating: number,
  note: string = ''
): Promise<void> {
  const headerSection = document.querySelector('.header_poster_wrapper section.header.poster')
  if (!headerSection) return

  const existingChip = headerSection.querySelector('.umm-status-chip[data-umm-owner]')

  const chip = createStatusChip(identity.type, status, rating, note)
  chip.dataset.ummOwner = `tmdb-${identity.type}`
  // Neutralise TMDB flex layout: keep inline-flex, no forced width
  chip.style.marginBottom = '12px'

  if (existingChip) {
    existingChip.replaceWith(chip)
  } else {
    const titleEl = headerSection.querySelector('.title')
    if (titleEl) {
      headerSection.insertBefore(chip, titleEl)
    } else {
      headerSection.insertAdjacentElement('afterbegin', chip)
    }
  }
}

/**
 * Read TMDB Vibes rating (#user_rating data-rating 0-100), convert to 0-10 scale.
 * data-rating > 0 → user has rated (watched). e.g. 65% → 7/10.
 */
function scanTMDBVibesStatus(): { status: string; rating: number } {
  const userRatingEl = document.getElementById('user_rating')
  if (!userRatingEl) {
    return { status: 'none', rating: 0 }
  }

  const ratingAttr = userRatingEl.getAttribute('data-rating')
  if (!ratingAttr) {
    return { status: 'none', rating: 0 }
  }

  const vibesRating = parseInt(ratingAttr, 10)
  if (isNaN(vibesRating) || vibesRating <= 0) {
    return { status: 'none', rating: 0 }
  }

  // Convert 0–100 scale to 0–10 scale
  const rating = Math.round(vibesRating / 10)
  return { status: 'done', rating }
}

/** Entry point: detail page status chip injection. */
const _handleTMDBDetailPage = createDetailPageHandler({
  platform: 'tmdb',
  titleSelector: TMDB_TITLE_SELECTOR,
  scanFn: () => scanTMDBVibesStatus(),
  renderFn: renderTMDBStatusChip,
  savedMessageKey: 'tmdb.saved',
  mergeStatusFn: (pageState, localRecord) => {
    if (pageState.status === 'done') return 2
    if (localRecord?.status === 2) return 2
    if (localRecord?.status === 3) return 3
    if (localRecord?.status === 1) return 1
    return 0
  },
})

export async function handleTMDBDetailPage(
  identity: UrlIdentity
): Promise<void> {
  if (!identity) return
  try {
    await _handleTMDBDetailPage(identity)
  } catch {
    return
  }
}