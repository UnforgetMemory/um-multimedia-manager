/**
 * Personage creations page data extraction — from /personage/{id}/creations
 *
 * Extracts the full works list, pagination info, filter/sort state,
 * role filter options, and personage identity from the native Douban
 * creations page DOM.
 *
 * Robustness notes:
 * - sortby=time / sortby=collection / sortby=vote render the same
 *   `.creation` item structure, but collection/vote may wrap items in
 *   group containers; we use a global `.creation` selector to tolerate
 *   both flat and grouped layouts.
 * - The page title is read from h1 with document.title fallback.
 * - Role filter options are PERSISTENT design: defined as constants here
 *   (not scraped from the native #role_filter dropdown), because the
 *   native dropdown is rendered inconsistently across sort/role variants.
 *   Active state is driven purely by the URL `role` param.
 * - All extractors accept explicit `doc`/`url` arguments for testability,
 *   defaulting to the live page globals.
 */

export interface CreationItem {
  title: string
  url: string
  poster: string
  year: string
  status: string          // 未上映 / 已上映 / empty
  role: string            // e.g. "演员", "演员 - 配音", "演员 (饰 XXX)"
  director: string
  cast: string
  rating: string          // e.g. "7.1" or ""
  ratingStars: string     // e.g. "allstar35" or "allstar00"
  recordStatus?: number
  recordRating?: number
}

export interface RoleOption {
  label: string
  role: string            // A1 / A2 / A3 or '' for "all"
  url: string             // full URL for this role filter
  active: boolean
}

export interface RecordStatusBadge {
  label: string           // 想看 / 在看 / 看过
  variant: 'wish' | 'do' | 'collect'
}

/**
 * Map a record status code to its badge label + CSS variant.
 * Status codes (see domain/record/Status.ts): 1=Wishlist, 2=Done, 3=Doing.
 * Returns null for neutral (0) or unknown codes.
 */
export function recordStatusBadge(status: number): RecordStatusBadge | null {
  if (status === 1) return { label: '想看', variant: 'wish' }
  if (status === 3) return { label: '在看', variant: 'do' }
  if (status === 2) return { label: '看过', variant: 'collect' }
  return null
}

/**
 * Persistent role filter options (Douban role codes, stable across pages).
 * Order mirrors the native dropdown: 演员 → 出镜 → 配音.
 * NOT scraped from the native DOM — the native #role_filter dropdown is
 * inconsistently rendered, so the UI must not depend on it.
 */
export const ROLE_FILTER_OPTIONS: ReadonlyArray<{ label: string; role: string }> = [
  { label: '演员', role: 'A1' },
  { label: '出镜', role: 'A3' },
  { label: '配音', role: 'A2' },
]

const ROLE_LABELS: Record<string, string> = {
  A1: '演员',
  A2: '配音',
  A3: '出镜',
}

export interface PersonageCreationsPageData {
  personageId: string
  personName: string
  totalWorks: number
  currentType: 'filmmaker' | 'writer' | 'musician'
  currentSort: 'time' | 'collection' | 'vote'
  currentRole: string     // '' when no role filter active
  roleOptions: RoleOption[]
  creations: CreationItem[]
  currentPage: number
  totalPages: number
  hasNext: boolean
  hasPrev: boolean
  nextUrl: string
  prevUrl: string
}

/**
 * Extract personage ID from the page URL.
 */
function extractPersonageId(url: string): string {
  const m = url.match(/\/personage\/(\d+)/)
  return m ? m[1] : ''
}

/**
 * Extract person name from the h1 page title, with document.title fallback.
 * h1 format: "贾静雯 Alyssa Chia的全部作品 (101)"
 */
function extractPersonName(doc: Document): string {
  const h1 = doc.querySelector('#content h1')
  const source = h1?.textContent?.trim() || doc.title.trim()
  return source.replace(/的全部作品\s*\(\d+\)$/, '').trim()
}

/**
 * Extract total works count from the h1 title or document.title.
 */
function extractTotalWorks(doc: Document): number {
  const h1 = doc.querySelector('#content h1')
  const source = h1?.textContent?.trim() || doc.title.trim()
  const m = source.match(/\((\d+)\)$/)
  return m ? parseInt(m[1], 10) : 0
}

/**
 * Determine the current type from URL query.
 */
function extractCurrentType(url: string): 'filmmaker' | 'writer' | 'musician' {
  const type = new URL(url).searchParams.get('type')
  if (type === 'writer') return 'writer'
  if (type === 'musician') return 'musician'
  return 'filmmaker'
}

/**
 * Determine the current sort mode from the active tab.
 */
function extractCurrentSort(doc: Document): 'time' | 'collection' | 'vote' {
  const sortLis = doc.querySelectorAll('.sort li a')
  for (const a of sortLis) {
    if (a.classList.contains('cur')) {
      const text = a.textContent?.trim() || ''
      if (text.includes('标记')) return 'collection'
      if (text.includes('评价')) return 'vote'
      return 'time'
    }
  }
  return 'time'
}

/**
 * Determine the current role filter from the URL role param (authoritative,
 * persistent — never reads the native dropdown). Returns '' when no role is
 * active, or the label ("演员"/"出镜"/"配音") when a known code is present.
 */
function extractCurrentRole(url: string): string {
  const roleParam = new URL(url).searchParams.get('role')
  if (roleParam && /^A\d$/.test(roleParam)) {
    return ROLE_LABELS[roleParam] || roleParam
  }
  return ''
}

/**
 * Build role options from the PERSISTENT constant list, driving active
 * state from the URL role param. Never reads the native #role_filter
 * dropdown — it is inconsistently rendered across page variants.
 */
function extractRoleOptions(url: string): RoleOption[] {
  const roleParam = new URL(url).searchParams.get('role')
  const activeCode = roleParam && /^A\d$/.test(roleParam) ? roleParam : ''

  return ROLE_FILTER_OPTIONS.map(({ label, role }) => {
    const u = new URL(url)
    u.searchParams.set('role', role)
    u.searchParams.delete('start')
    return {
      label,
      role,
      url: u.toString(),
      active: role === activeCode,
    }
  })
}

/**
 * Extract rating value from rating-star class name.
 * Douban star classes map to a 10-point scale: allstar35 (3.5★) → 7.0,
 * allstar50 (5★) → 10.0; allstar00 → '' (no rating).
 */
function ratingFromStars(ratingStars: string): string {
  const m = ratingStars.match(/allstar(\d)(\d)/)
  if (!m) return ''
  const stars = parseInt(m[1], 10) + parseInt(m[2], 10) / 10
  if (stars === 0) return ''
  const score = stars * 2
  return score.toFixed(1)
}

/**
 * Extract a single creation item from a .creation list element.
 * Works for both the flat list and grouped layouts used by
 * sortby=collection / sortby=vote.
 */
function extractCreation(li: HTMLLIElement): CreationItem | null {
  const imgLink = li.querySelector<HTMLAnchorElement>('a.cover')
  const img = imgLink?.querySelector<HTMLImageElement>('img')
  const poster = img?.src || ''
  const posterLink = imgLink?.href || ''

  // Title, year, status, role from h6
  const h6 = li.querySelector('.meta h6')
  if (!h6) return null

  const titleAnchor = h6.querySelector<HTMLAnchorElement>('a[href*="/subject/"]')
  const title = titleAnchor?.textContent?.trim() || img?.alt || ''
  const url = titleAnchor?.href || posterLink

  const spans = Array.from(h6.querySelectorAll('span'))
  // Spans vary by item: year "(2028)", status "(未上映)", role "[ 演员 ]".
  // Not every item has every span — classify by content, not position.
  let year = ''
  let status = ''
  let role = ''
  for (const s of spans) {
    const text = s.textContent?.trim() || ''
    if (/^\(\d{4}\)$/.test(text)) {
      year = text.replace(/[()]/g, '')
    } else if (text.startsWith('[')) {
      role = text.replace(/[\[\]]/g, '').trim()
    } else if (text) {
      status = text.replace(/[()]/g, '').trim()
    }
  }

  // Rating
  const ratingEl = li.querySelector('.rating .rating-star')
  const ratingStars = ratingEl?.className.replace('rating-star ', '').trim() || ''
  const ratingText = li.querySelector('.rating')

  // Roles (director + cast)
  const rolesDiv = li.querySelector('.meta .roles')
  const directorEl = rolesDiv?.querySelector('div:first-child')
  const castEl = rolesDiv?.querySelector('div:nth-child(2)')
  const director = directorEl?.textContent?.trim() || ''
  const cast = castEl?.textContent?.trim() || ''

  // Parse structured rating: prefer star class, fall back to text
  let cleanRating = ''
  if (ratingStars) {
    cleanRating = ratingFromStars(ratingStars)
  } else if (ratingText) {
    const ratingM = ratingText.textContent?.match(/(\d+\.?\d*)/)
    if (ratingM) cleanRating = ratingM[1]
  }

  if (!title) return null

  return {
    title,
    url,
    poster,
    year,
    status,
    role,
    director,
    cast,
    rating: cleanRating,
    ratingStars,
  }
}

/**
 * Extract the creations list from the DOM.
 *
 * Uses a global `li.creation` selector (not scoped to `.creations`) because
 * sortby=collection / sortby=vote may wrap items in group containers.
 * Deduplicates by subject URL in case items appear in both a grouped
 * section and a "more" list.
 */
function extractCreations(doc: Document): CreationItem[] {
  const items: CreationItem[] = []
  const seen = new Set<string>()

  doc.querySelectorAll<HTMLLIElement>('li.creation').forEach((li) => {
    // Skip items outside the main content area (e.g. sidebar suggestions)
    if (!li.closest('#content')) return
    const item = extractCreation(li)
    if (!item) return
    const key = item.url || item.title
    if (seen.has(key)) return
    seen.add(key)
    items.push(item)
  })
  return items
}

/**
 * Extract pagination info from .paginator.
 */
function extractPagination(doc: Document): {
  currentPage: number
  totalPages: number
  hasNext: boolean
  hasPrev: boolean
  nextUrl: string
  prevUrl: string
} {
  const paginator = doc.querySelector('.paginator')
  if (!paginator) {
    return { currentPage: 1, totalPages: 1, hasNext: false, hasPrev: false, nextUrl: '', prevUrl: '' }
  }

  // Current page from .thispage
  const thisPage = paginator.querySelector('.thispage')
  const currentPage = thisPage ? parseInt(thisPage.textContent?.trim() || '1', 10) : 1

  // Total pages from data-total-page attribute
  const totalPages = thisPage ? parseInt(thisPage.getAttribute('data-total-page') || '1', 10) : 1

  // Prev/next
  const prevLink = paginator.querySelector<HTMLAnchorElement>('.prev a')
  const nextLink = paginator.querySelector<HTMLAnchorElement>('.next a')

  // Prev link might be disabled (no <a> inside .prev when on first page)
  const hasPrev = prevLink !== null
  const hasNext = nextLink !== null

  return {
    currentPage,
    totalPages,
    hasPrev,
    hasNext,
    prevUrl: prevLink?.href || '',
    nextUrl: nextLink?.href || '',
  }
}

/**
 * Extract all data from the current Douban personage creations page.
 * Returns null only if the page lacks both a recognizable title and any
 * creation items (i.e. not a creations page at all).
 *
 * @param doc Optional document override (testability). Defaults to the
 *   live `document`.
 * @param url Optional page URL override (testability). Defaults to the
 *   live `location.href`.
 */
export function extractPersonageCreationsPageData(
  doc: Document = document,
  url: string = location.href,
): PersonageCreationsPageData | null {
  const personName = extractPersonName(doc)
  const creations = extractCreations(doc)
  if (!personName && creations.length === 0) return null

  const pagination = extractPagination(doc)

  console.log('[UMM] personage-creations:', {
    personName,
    creationsCount: creations.length,
    page: pagination.currentPage,
    total: pagination.totalPages,
    roleOptions: extractRoleOptions(url).map((r) => `${r.role}:${r.label}${r.active ? '*' : ''}`),
  })

  return {
    personageId: extractPersonageId(url),
    personName,
    totalWorks: extractTotalWorks(doc),
    currentType: extractCurrentType(url),
    currentSort: extractCurrentSort(doc),
    currentRole: extractCurrentRole(url),
    roleOptions: extractRoleOptions(url),
    creations,
    ...pagination,
  }
}