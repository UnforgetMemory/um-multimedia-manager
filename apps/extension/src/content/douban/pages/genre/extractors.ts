import type { GenrePageData, GenreArtistItem, GenreNavItem } from './types'

/**
 * Extract the current genre name from the breadcrumb (.link_list).
 * The active genre is a <span> (not a link).
 */
function extractGenreName(): string {
  const span = document.querySelector('.link_list span')
  return span?.textContent?.trim() || ''
}

/**
 * Extract genre navigation links from .link_list.
 * <a> tags are other genres, <span> is the current one.
 */
function extractNavLinks(): GenreNavItem[] {
  const links: GenreNavItem[] = []
  document.querySelectorAll('.link_list a, .link_list span').forEach(el => {
    const name = el.textContent?.trim()
    if (!name) return
    if (el.tagName === 'A') {
      const href = (el as HTMLAnchorElement).href || ''
      links.push({ name, href, isCurrent: false })
    } else if (el.tagName === 'SPAN') {
      links.push({ name, href: '', isCurrent: true })
    }
  })
  return links
}

/**
 * Extract artist items from .photoin blocks.
 */
function extractArtists(): GenreArtistItem[] {
  const items: GenreArtistItem[] = []
  document.querySelectorAll('.photoin').forEach(el => {
    const img = el.querySelector<HTMLImageElement>('img.artist_s')
    const avatarUrl = img?.getAttribute('src') || ''
    const name = img?.getAttribute('alt') || ''

    const link = el.querySelector<HTMLAnchorElement>('a.artist_photo, .ll a')
    const href = link?.href || ''

    const plEl = el.querySelector<HTMLElement>('.pl')
    const likesText = plEl?.textContent?.trim() || ''
    const likes = parseInt(likesText.replace(/[^0-9]/g, ''), 10) || 0

    if (name && href) {
      items.push({ name, href, avatarUrl, likes })
    }
  })
  return items
}

/**
 * Extract pagination info from .paginator.
 */
function extractPagination(): { currentPage: number; totalPages: number; prevUrl: string; nextUrl: string } {
  const currentEl = document.querySelector('.paginator .thispage')
  const currentPage = parseInt(currentEl?.textContent?.trim() || '1', 10) || 1

  const allLinks = document.querySelectorAll('.paginator a')
  let maxPage = 1
  allLinks.forEach(a => {
    const href = a.getAttribute('href') || ''
    const parts = href.split('/').filter(Boolean)
    const pageNum = parseInt(parts[parts.length - 1] || '1', 10)
    if (pageNum > maxPage) maxPage = pageNum
  })

  const prevLink = document.querySelector('.paginator .prev a')
  const nextLink = document.querySelector('.paginator .next a')
  const prevUrl = prevLink?.getAttribute('href') || ''
  const nextUrl = nextLink?.getAttribute('href') || ''

  return { currentPage, totalPages: maxPage, prevUrl, nextUrl }
}

/**
 * Full extraction for the genre page.
 */
export function extractGenrePage(): GenrePageData | null {
  const genreName = extractGenreName()
  const artists = extractArtists()
  const navLinks = extractNavLinks()
  const pagination = extractPagination()

  if (!genreName || artists.length === 0) return null

  return { genreName, artists, navLinks, pagination }
}