/**
 * Pure helpers + selectors for Bilibili listing dimmer (homepage/search/space).
 *
 * Style discipline (learned from live search.bilibili.com layout breakage):
 * NEVER inject global `position:relative` / `:has()` dim rules that hit every
 * card shell on the page. Dim + badge anchors are applied surgically in JS.
 */

import { parseBilibiliBvidFromHref, storeKey, STATUS_COLORS, STATUS_LABELS } from './video-overlay-pure'

/** status >= DIMMER_TRIGGER → dimmed */
export const DIMMER_TRIGGER = 2

export const LISTING_PROCESSED_ATTR = 'data-umm-bili-processed'
export const LISTING_BADGE_CLASS = 'umm-bili-badge'
export const LISTING_DIMMER_CLASS = 'umm-viewed'
/** JS-applied class on the nearest known list shell when a card is dimmed. */
export const LISTING_SHELL_DIM_CLASS = 'umm-bili-dim-shell'
export const LISTING_STYLE_ID = 'umm-bili-homepage-styles'

export const LISTING_CARD_SELECTOR = '.bili-video-card'

export const LISTING_ROOT_SELECTORS = [
  '.space-main',
  '.bili-feed4',
  '.bili-feed4-layout',
  '.search-content',
  '.search-page',
  '#app',
] as const

/**
 * Badge DOM anchors in probe order. Do NOT style these globally —
 * setListingBadge sets position:relative only on the chosen node.
 */
export const BADGE_ANCHOR_SELECTORS = [
  '.bili-cover-card__thumbnail',
  '.bili-video-card__image--link',
  '.bili-video-card__image--filter',
  '.bili-video-card__cover a.bili-cover-card',
  '.bili-video-card__cover',
] as const

/** Nearest shells that may receive LISTING_SHELL_DIM_CLASS (JS, not CSS :has). */
export const DIMMER_WRAPPER_SELECTORS = [
  '.upload-video-card',
  '.list-video-item',
  '.video-list__item',
] as const

export type BiliListingRoute =
  | 'space-home'
  | 'space-lists'
  | 'space-list-details'
  | 'space-upload'
  | 'space-other'
  | 'www-listing'
  | 'other'

export function shouldDimStatus(status: number): boolean {
  return status >= DIMMER_TRIGGER
}

export function extractBvidFromHref(href: string | null | undefined): string | null {
  return parseBilibiliBvidFromHref(href || '')
}

export interface CardLike {
  getAttribute(name: string): string | null
  querySelector(sel: string): { getAttribute(name: string): string | null } | null
  querySelectorAll(sel: string): ArrayLike<{ getAttribute(name: string): string | null }>
}

export function extractBvidFromCard(card: CardLike): string | null {
  const dataBvid = card.getAttribute('data-bsb-bvid')
  if (dataBvid && /^BV[a-zA-Z0-9]+$/i.test(dataBvid)) return dataBvid

  const link = card.querySelector('a[href*="/video/"]')
  if (link) {
    const id = extractBvidFromHref(link.getAttribute('href'))
    if (id) return id
  }
  const links = card.querySelectorAll('[href*="/video/"]')
  for (let i = 0; i < links.length; i++) {
    const id = extractBvidFromHref(links[i]!.getAttribute('href'))
    if (id) return id
  }
  return null
}

export function resolveBadgeAnchorSelector(card: CardLike): string | null {
  for (const sel of BADGE_ANCHOR_SELECTORS) {
    if (card.querySelector(sel)) return sel
  }
  return null
}

export function parseBiliListingRoute(href: string): BiliListingRoute {
  let url: URL
  try {
    url = new URL(href, 'https://www.bilibili.com')
  } catch {
    return 'other'
  }
  const host = url.hostname
  const path = url.pathname
  if (host === 'space.bilibili.com') {
    if (/\/lists\/[^/]+/.test(path)) return 'space-list-details'
    if (/\/lists\/?$/.test(path)) return 'space-lists'
    if (/\/upload\/video/.test(path)) return 'space-upload'
    if (/^\/\d+\/?$/.test(path) || path === '/' || path === '') return 'space-home'
    return 'space-other'
  }
  if (host === 'search.bilibili.com') return 'www-listing'
  if (host === 'www.bilibili.com' || host === 'bilibili.com') return 'www-listing'
  return 'other'
}

export function isListingCapableRoute(route: BiliListingRoute): boolean {
  return route !== 'other'
}

/**
 * Injected CSS is intentionally narrow:
 * - dim ONLY .bili-video-card.umm-viewed (never global shell :has rules)
 * - dim shell ONLY when JS added .umm-bili-dim-shell
 * - badge class only; position:relative is set per-anchor in JS
 */
export function buildListingDimmerCss(): string {
  return `
        .${LISTING_CARD_SELECTOR.slice(1)}.${LISTING_DIMMER_CLASS},
        .${LISTING_SHELL_DIM_CLASS} {
          opacity: 0.35 !important;
          filter: grayscale(80%) !important;
          transition: opacity 0.3s ease-in-out, filter 0.3s ease-in-out !important;
        }
        .${LISTING_CARD_SELECTOR.slice(1)}.${LISTING_DIMMER_CLASS}:hover,
        .${LISTING_SHELL_DIM_CLASS}:hover {
          opacity: 1 !important;
          filter: grayscale(0%) !important;
        }

        .${LISTING_BADGE_CLASS} {
          position: absolute !important;
          top: 8px !important;
          right: 8px !important;
          z-index: 10 !important;
          padding: 2px 8px !important;
          border-radius: 6px !important;
          font-size: 11px !important;
          font-weight: 700 !important;
          font-family: "Microsoft YaHei","PingFang SC",-apple-system,sans-serif !important;
          color: #fff !important;
          line-height: 1.5 !important;
          user-select: none !important;
          box-shadow: 0 2px 6px rgba(0,0,0,0.25) !important;
          cursor: default !important;
          pointer-events: none !important;
        }
  `.trim()
}

/** Dim target selectors used by unit tests (card + optional JS shell class). */
export function listingDimTargetSelectors(): { dim: string[]; hover: string[] } {
  const card = `.${LISTING_CARD_SELECTOR.slice(1)}.${LISTING_DIMMER_CLASS}`
  const shell = `.${LISTING_SHELL_DIM_CLASS}`
  return {
    dim: [card, shell],
    hover: [`${card}:hover`, `${shell}:hover`],
  }
}

export function bulkKeysForBvids(bvids: string[]): string[] {
  return bvids.map((id) => storeKey(id))
}

export interface ListingRecordLike {
  status?: number
  rating?: number
}

export type ListingBulkReader = (
  storeName: string,
  keys: string[],
) => Promise<Array<{ key: string; record?: ListingRecordLike | null }>>

/** Nearest known shell for JS shell-dim; null on bare homepage cards. */
export function findDimShell(card: Element): Element | null {
  for (const sel of DIMMER_WRAPPER_SELECTORS) {
    const shell = card.closest(sel)
    if (shell) return shell
  }
  return null
}

export function setListingBadge(
  card: HTMLElement,
  status: number,
  rating?: number,
  badgeClass: string = LISTING_BADGE_CLASS,
  dimmerClass: string = LISTING_DIMMER_CLASS,
): HTMLElement {
  let badge = card.querySelector<HTMLElement>(`.${badgeClass}`)
  if (!badge) {
    const doc = card.ownerDocument || document
    badge = doc.createElement('div')
    badge.className = badgeClass
    const anchorSel = resolveBadgeAnchorSelector(card)
    const anchor = anchorSel ? card.querySelector<HTMLElement>(anchorSel) : null
    if (anchor) {
      // Surgical positioning only — never global CSS on every cover node.
      const computed = doc.defaultView?.getComputedStyle(anchor).position
      if (computed === 'static' || !computed) {
        anchor.style.position = 'relative'
      }
      anchor.appendChild(badge)
    } else {
      card.style.position = card.style.position || 'relative'
      card.appendChild(badge)
    }
  }

  let label = STATUS_LABELS[status] || STATUS_LABELS[0]
  if (status === 2 && rating && rating > 0) {
    label += ' ' + rating
  }
  badge.textContent = label
  badge.style.background = STATUS_COLORS[status] || STATUS_COLORS[0]

  if (card.classList.contains(dimmerClass) || findDimShell(card)?.classList.contains(LISTING_SHELL_DIM_CLASS)) {
    badge.style.pointerEvents = 'auto'
    badge.onmouseenter = () => {
      card.style.opacity = '1'
      card.style.filter = 'none'
      const shell = findDimShell(card)
      if (shell) {
        ;(shell as HTMLElement).style.opacity = '1'
        ;(shell as HTMLElement).style.filter = 'none'
      }
    }
    badge.onmouseleave = () => {
      card.style.removeProperty('opacity')
      card.style.removeProperty('filter')
      const shell = findDimShell(card)
      if (shell) {
        ;(shell as HTMLElement).style.removeProperty('opacity')
        ;(shell as HTMLElement).style.removeProperty('filter')
      }
    }
  }
  return badge
}

export interface ListingPassResult {
  scanned: number
  withBvid: number
  dimmed: number
  badgeHits: number
  bulkKeys: string[]
}

export async function runListingDimmerPass(opts: {
  root: ParentNode
  storeName: string
  dbGetBulk: ListingBulkReader
}): Promise<ListingPassResult> {
  const { root, storeName, dbGetBulk } = opts
  const unprocessed = `${LISTING_CARD_SELECTOR}:not([${LISTING_PROCESSED_ATTR}])`
  const cards = root.querySelectorAll<HTMLElement>(unprocessed)
  const result: ListingPassResult = { scanned: 0, withBvid: 0, dimmed: 0, badgeHits: 0, bulkKeys: [] }
  if (cards.length === 0) return result
  result.scanned = cards.length

  const batch: Array<{ el: HTMLElement; bvid: string }> = []
  cards.forEach((card) => {
    card.setAttribute(LISTING_PROCESSED_ATTR, 'true')
    const bvid = extractBvidFromCard(card)
    if (!bvid) return
    batch.push({ el: card, bvid })
    setListingBadge(card, 0)
  })
  result.withBvid = batch.length
  if (batch.length === 0) return result

  const keys = bulkKeysForBvids(batch.map((b) => b.bvid))
  result.bulkKeys = keys

  try {
    const entries = await dbGetBulk(storeName, keys)
    const byKey = new Map<string, ListingRecordLike>()
    for (const entry of entries) {
      if (!entry?.key) continue
      byKey.set(entry.key, entry.record || {})
    }
    for (const { el, bvid } of batch) {
      const record = byKey.get(storeKey(bvid))
      if (!record) continue
      const status = record.status || 0
      const rating = record.rating || 0
      if (shouldDimStatus(status)) {
        // Exclusive visual dim: shell XOR card — never both (compound opacity).
        const shell = findDimShell(el)
        if (shell) {
          shell.classList.add(LISTING_SHELL_DIM_CLASS)
        } else {
          el.classList.add(LISTING_DIMMER_CLASS)
        }
        result.dimmed += 1
      }
      setListingBadge(el, status, rating)
      result.badgeHits += 1
    }
  } catch {
    // background unreachable — default badges stay
  }
  return result
}
