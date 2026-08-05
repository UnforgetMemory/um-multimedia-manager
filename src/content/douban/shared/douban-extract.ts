/**
 * Shared Douban DOM extraction helpers.
 *
 * Consolidates near-identical extraction snippets that were previously
 * copy-pasted across page data files (parseRating ×6, etc.).
 * Only truly identical implementations live here — page-specific variants
 * (e.g. extractRating's differing count-selector) stay in their pages.
 *
 * FAMILY 1/2 below (extractUserProfileInfo / extractCollectPageShell) are
 * T14-planned extracts (audit §2.4) locked by tests/unit/douban-extract-families.spec.ts;
 * production callers land when user-media/user-celebrities/movie-profile/
 * doulists pages migrate — until then they are intentionally kept as tested
 * building blocks, not dead code.
 */

import { parseDoubanPaginator } from './parse-douban-paginator'

/**
 * Extract the first text node from an element, before its child elements.
 * e.g. `<h1>UnforgetMemory<div>...</div></h1>` → `"UnforgetMemory"`
 */
function getFirstTextNode(el: Element): string {
  let text = ''
  for (const node of el.childNodes) {
    if (node.nodeType === 3 /* Node.TEXT_NODE */) {
      text += node.textContent ?? ''
    } else {
      break
    }
  }
  return text.trim()
}

/**
 * Parse a Douban rating class like "allstar50" → 5.0.
 * Returns 0 when no `allstar(\d+)` pattern is present.
 */
export function parseRating(className: string): number {
  const m = className.match(/allstar(\d+)/)
  if (!m) return 0
  return parseInt(m[1], 10) / 10
}

// ---------------------------------------------------------------------------
// FAMILY 1 — User profile info hero block
// ---------------------------------------------------------------------------

/** Common user profile info extracted from the #db-usr-profile sidebar. */
export interface UserProfileInfo {
  userId: string
  displayName: string
  avatarUrl: string
  navLinks: { label: string; url: string }[]
}

/**
 * Extract common user profile info from the #db-usr-profile sidebar.
 * Shared by: user-profile, user-celebrities, user-reviews, book-collect,
 * music-collect, user-media.
 *
 * Selector priority:
 * - displayName: `.side-info-txt h3` → avatar `alt` → `#db-usr-profile .info h1` first text node → userId
 * - avatarUrl: `#db-usr-profile .pic img` / `.side-info-avatar img` → `.basic-info .userface`
 * - navLinks: `#db-usr-profile .info ul li a`
 */
export function extractUserProfileInfo(root: Element | Document): UserProfileInfo {
  const url = (root.ownerDocument ?? root as Document).location?.href ?? ''
  const uidMatch = url.match(/\/people\/([^/?]+)/)
  const userId = uidMatch?.[1] ?? ''

  // --- avatarUrl ---
  const avatarEl = root.querySelector<HTMLImageElement>('#db-usr-profile .pic img, .side-info-avatar img')
  const avatarUrl = avatarEl?.src
    ?? root.querySelector<HTMLImageElement>('.basic-info .userface')?.src
    ?? ''

  // --- displayName ---
  const sideNameEl = root.querySelector('.side-info-txt h3')
  const displayName = sideNameEl?.textContent?.trim()
    ?? avatarEl?.getAttribute('alt')
    ?? (() => {
      const h1 = root.querySelector('#db-usr-profile .info h1')
      return h1 ? getFirstTextNode(h1) : ''
    })()
    ?? userId

  // --- navLinks ---
  const navLinks: { label: string; url: string }[] = []
  root.querySelectorAll<HTMLAnchorElement>('#db-usr-profile .info ul li a').forEach((a) => {
    const href = a.getAttribute('href') ?? ''
    const text = a.textContent?.trim()
    if (text && href) {
      navLinks.push({ label: text, url: href })
    }
  })

  return { userId, displayName, avatarUrl, navLinks }
}

// ---------------------------------------------------------------------------
// FAMILY 2 — Collect page shell
// ---------------------------------------------------------------------------

/** Common shell data for collect pages (book/music/user-media). */
export interface CollectPageShell {
  subType: 'collect' | 'wish' | 'doing'
  userId: string
  displayName: string
  avatarUrl: string
  navLinks: { label: string; url: string }[]
  sortOptions: { label: string; url: string; active: boolean }[]
  currentPage: string
  total: number
  mode: 'grid' | 'list'
  pageLinks: { label: string; url: string; current: boolean }[]
  prevPageUrl: string
  nextPageUrl: string
}

/**
 * Determine collection sub-type (collect/wish/doing) from the page URL.
 */
function getSubTypeFromUrl(url: string): 'collect' | 'wish' | 'doing' {
  if (url.includes('/wish') || url.includes('status=wish')) return 'wish'
  if (url.includes('/do') || url.includes('status=do')) return 'doing'
  return 'collect'
}

/**
 * Extract the common "shell" of a Douban collect page: user info, nav,
 * sort options, page info, mode, and paginator.
 * Page-specific item extraction stays in each page's data file.
 *
 * Shared by: book-collect, music-collect, user-media.
 */
export function extractCollectPageShell(root: Element | Document): CollectPageShell {
  const doc = root.ownerDocument ?? root as Document
  const url = doc.location?.href ?? ''
  const subType = getSubTypeFromUrl(url)

  // --- userId ---
  let userId = ''
  const uidMatch = url.match(/\/people\/([^/?]+)/)
  if (uidMatch) {
    userId = uidMatch[1]
  } else {
    // Fallback: #user-id hidden input (music-collect)
    const uidInput = root.querySelector<HTMLInputElement>('#user-id')
    if (uidInput?.value) {
      userId = uidInput.value
    } else {
      // Fallback: profile link href (user-media)
      const profileLink = root.querySelector<HTMLAnchorElement>('#db-usr-profile .info ul li a[href*="/people/"]')
      const href = profileLink?.getAttribute('href') ?? ''
      const m = href.match(/\/people\/([^/?]+)/)
      if (m) userId = m[1]
    }
  }

  // --- avatarUrl ---
  const avatarEl = root.querySelector<HTMLImageElement>('#db-usr-profile .pic img, .side-info-avatar img')
  const avatarUrl = avatarEl?.src ?? ''

  // --- displayName ---
  const sideNameEl = root.querySelector('.side-info-txt h3')
  const accountEl = root.querySelector<HTMLSpanElement>('.nav-user-account .bn-more span')
  const displayName = sideNameEl?.textContent?.trim()
    ?? avatarEl?.getAttribute('alt')
    ?? accountEl?.textContent?.replace(/的账号$/, '').trim()
    ?? userId

  // --- navLinks ---
  const navLinks: { label: string; url: string }[] = []
  root.querySelectorAll<HTMLAnchorElement>('#db-usr-profile .info ul li a').forEach((a) => {
    const href = a.getAttribute('href') ?? ''
    const text = a.textContent?.trim()
    if (text && href) {
      navLinks.push({ label: text, url: href })
    }
  })

  // --- sortOptions ---
  const sortOptions: { label: string; url: string; active: boolean }[] = []
  const sortGroup = root.querySelector('.opt-bar .sort')
  if (sortGroup) {
    sortGroup.childNodes.forEach((node) => {
      if (node.nodeType === 3 /* Node.TEXT_NODE */) {
        const text = node.textContent?.trim()
        if (text && text !== '·') {
          sortOptions.push({ label: text, url: '', active: true })
        }
      } else if ((node as Element).tagName === 'A') {
        const a = node as HTMLAnchorElement
        const text = a.textContent?.trim()
        const href = a.getAttribute('href') ?? a.href
        if (text && href) {
          sortOptions.push({ label: text, url: href, active: false })
        }
      }
    })
  }

  // --- pageInfo (from .subject-num, fallback to h1 "(N)") ---
  let currentPage = ''
  let total = 0
  const numEl = root.querySelector('.subject-num')
  if (numEl) {
    const text = numEl.textContent ?? ''
    const pageMatch = text.match(/^([\d\-]+)\s*\/\s*([\d,]+)/)
    if (pageMatch) {
      currentPage = pageMatch[1]
      total = parseInt(pageMatch[2].replace(/,/g, ''), 10)
    }
  }
  if (total === 0) {
    const h1 = root.querySelector('#db-usr-profile h1')
    const h1Text = h1?.textContent ?? ''
    const countMatch = h1Text.match(/\((\d+)\)/)
    if (countMatch) total = parseInt(countMatch[1], 10)
  }

  // --- mode ---
  const mode: 'grid' | 'list' = root.querySelector('.grid-on') ? 'grid' : 'list'

  // --- paginator ---
  const { pageLinks, prevPageUrl, nextPageUrl } = parseDoubanPaginator(root.querySelector('.paginator'))

  return {
    subType, userId, displayName, avatarUrl, navLinks,
    sortOptions, currentPage, total, mode,
    pageLinks, prevPageUrl, nextPageUrl,
  }
}
