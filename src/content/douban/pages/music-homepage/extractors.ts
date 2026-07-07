import type { NewAlbumItem, BannerItem, PopularArtistItem, GenreTag } from './types'

/**
 * Extract a Douban subject ID from an element.
 * Checks (in order):
 * 1. `<a href*="/subject/">` links
 * 2. `data-trainer` attribute
 */
function extractSubjectId(element: Element): string {
  const link = element.querySelector<HTMLAnchorElement>('a[href*="/subject/"]')
  if (link) {
    const href = link.href || link.getAttribute('href')
    if (href) {
      const match = href.match(/\/subject\/(\d+)/)
      if (match) return match[1]
    }
  }
  return ''
}

/**
 * Extract popular artists from the music homepage.
 * Selects from either .artists (本周流行) or .new-artists (上升最快) tab.
 */
export function extractPopularArtists(tab: 'artists' | 'new-artists' = 'artists'): PopularArtistItem[] {
  const items: PopularArtistItem[] = []
  const container = document.querySelector(`.popular-artists .${tab}`)
  if (!container) return items

  container.querySelectorAll<HTMLElement>('.artist-item').forEach(el => {
    const link = el.querySelector<HTMLAnchorElement>('.artist-photo')
    const href = link?.href || ''

    const photoEl = el.querySelector<HTMLElement>('.artist-photo-img')
    const bgStyle = photoEl?.style?.backgroundImage || ''
    let photoUrl = ''
    if (bgStyle) {
      const match = bgStyle.match(/^url\(["']?(.+?)["']?\)$/)
      if (match) photoUrl = match[1]
    }

    const titleEl = el.querySelector<HTMLAnchorElement>('.title')
    const name = titleEl?.textContent?.trim() || ''

    const genreEl = el.querySelector<HTMLElement>('.genre')
    const genre = genreEl?.textContent?.trim() || ''

    if (href && name && photoUrl) {
      items.push({ name, genre, href, photoUrl, isNew: tab === 'new-artists' })
    }
  })

  return items
}

/**
 * Extract banner items from the top carousel.
 */
export function extractBannerItems(): BannerItem[] {
  const items: BannerItem[] = []
  document.querySelectorAll('.top-banner .slick-slide img').forEach(img => {
    const src = img.getAttribute('src') || ''
    const alt = img.getAttribute('alt') || ''
    const link = img.closest('a')
    const href = link?.href || ''
    if (src) items.push({ imageUrl: src, href, alt })
  })
  return items
}

/**
 * Extract new album items from the [data-react-component="NewAlbums"] section.
 * Returns a flat array of all albums visible in the current active tab.
 */
export function extractNewAlbums(): NewAlbumItem[] {
  const items: NewAlbumItem[] = []
  const container = document.querySelector('[data-react-component="NewAlbums"]')
  if (!container) return items

  // The active tab content is in .album-content
  const albumContent = container.querySelector('.album-content')
  if (!albumContent) return items

  albumContent.querySelectorAll<HTMLElement>('.album-item').forEach(el => {
    const link = el.querySelector<HTMLAnchorElement>('a[href*="/subject/"]')
    const href = link?.href || ''
    const subjectId = extractSubjectId(el)
    if (!subjectId) return

    const coverImg = el.querySelector<HTMLImageElement>('.cover img')
    const coverUrl = coverImg?.getAttribute('src') || ''

    const titleEl = el.querySelector<HTMLAnchorElement>('.album-title')
    const title = titleEl?.textContent?.trim() || ''

    // Artist is in the <p> element after .album-title
    const textEls = el.querySelectorAll<HTMLElement>('p, .inner > p')
    let artist = ''
    textEls.forEach(p => {
      if (!p.closest('.star')) {
        const text = p.textContent?.trim() || ''
        if (text) artist = text
      }
    })

    // Rating from .star class
    const starEl = el.querySelector<HTMLElement>('.star span')
    let rating = ''
    if (starEl) {
      const cls = Array.from(starEl.classList).find(c => c.startsWith('allstar'))
      if (cls) {
        const match = cls.match(/allstar(\d+)/)
        if (match) {
          const num = parseInt(match[1], 10)
          rating = num > 0 ? (num / 10).toFixed(1) : ''
        }
      }
    }

    items.push({ subjectId, title, artist, posterUrl: coverUrl, href, rate: rating })
  })

  return items
}

/**
 * Extract genre tags from the .tag-block table.
 * Each table row has a <th> (primary genre) and <td> (secondary genre).
 */
export function extractGenreTags(): GenreTag[] {
  const tags: GenreTag[] = []
  const table = document.querySelector('.tag-block table')
  if (!table) return tags

  table.querySelectorAll<HTMLAnchorElement>('a').forEach(a => {
    const href = a.href || a.getAttribute('href') || ''
    const name = a.textContent?.trim() || ''
    if (href && name) {
      tags.push({ name, href })
    }
  })

  return tags
}
