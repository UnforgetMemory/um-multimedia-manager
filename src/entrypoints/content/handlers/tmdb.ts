/**
 * TMDB (themoviedb.org) page handler.
 *
 * - Homepage: scans lazily-loaded cards, injects UMM status badges
 * - Detail: locates title anchor, injects status chip
 */

import type { UrlIdentity, StoreRecord } from '@/types'
import { Store } from '@/features/database'
import { Utils } from '@/utils'
import { intervalWhenVisible } from '@/utils/visibility'
import { createStatusChip, waitForElement } from '../utils/dom'
import { FloatingToast } from '../utils/toast'
import { t } from '../i18n'

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

/** Fetch all tmdb_records into a Map<storeKey, StoreRecord> for O(1) lookup. */
async function buildRecordMap(): Promise<Map<string, StoreRecord>> {
  const entries = await Store.dbGetAll('tmdb_records')
  const map = new Map<string, StoreRecord>()
  for (const { key, record } of entries) {
    map.set(key, record)
  }
  return map
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
  const scanAllCards = Utils.throttle(async () => {
    const cards = document.querySelectorAll<HTMLElement>(TMDB_CARD_SELECTOR)
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
  const recordMap = await buildRecordMap()
  const cleanup = observeTMDBGrids(recordMap)

  window.addEventListener('beforeunload', cleanup, { once: true })
}

// ---- Detail Page — Status Chip Injection ----

/** Locate the title anchor element on a TMDB detail page. */
export function getTMDBAnchorElement(): Element | null {
  return document.querySelector('.title a[href*="/movie/"], .title a[href*="/tv/"]')
}

/** Read the page title text. */
export function getTMDBTitle(): string {
  const anchor = getTMDBAnchorElement()
  return anchor?.textContent?.trim() || ''
}

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
export async function handleTMDBDetailPage(
  identity: UrlIdentity
): Promise<void> {
  if (!identity) return

  try {
    await waitForElement(TMDB_TITLE_SELECTOR, 5000)
  } catch {
    return
  }

  // Read TMDB Vibes rating
  const pageState = scanTMDBVibesStatus()

  // Fetch local record and merge: page state > local DB
  const storeName = `${identity.provider}_records`
  const key = `${identity.type}::${identity.providerId}`
  const localRecord = await Store.dbGet(storeName, key)

  const isPageDone = pageState.status === 'done'
  const isLocalDone = localRecord?.status === 2
  const isLocalWish = localRecord?.status === 1
  const isLocalDoing = localRecord?.status === 3

  const finalStatus = isPageDone ? 2 : isLocalDone ? 2 : isLocalDoing ? 3 : isLocalWish ? 1 : 0
  const finalRating = Utils.clampRating10(
    isPageDone ? pageState.rating : localRecord?.rating || 0
  )
  const note = isLocalDone && !isPageDone ? t('common.cache_hint') : ''

  await renderTMDBStatusChip(identity, finalStatus, finalRating, note)

  // Save to DB if TMDB shows user rated
  if (isPageDone) {
    const statusChanged = localRecord?.status !== 2
    const ratingChanged = localRecord?.rating !== pageState.rating

    if (statusChanged || ratingChanged || !localRecord) {
      await Store.dbPut(storeName, key, {
        url: identity.url,
        status: 2,
        rating: pageState.rating,
        comment: localRecord?.comment ?? '',
        updatedAt: new Date().toISOString(),
        linkedIds: localRecord?.linkedIds ?? {},
      })

      FloatingToast.success('UMM', t('tmdb.saved'))
      console.log('[UMM] Updated TMDB local record from page Vibes rating')
    } else {
      console.log('[UMM] ⏭️ TMDB record unchanged, skipping save')
    }
  }
}