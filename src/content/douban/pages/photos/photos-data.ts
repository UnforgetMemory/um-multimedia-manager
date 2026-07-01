/**
 * Photos page data extraction — from /subject/{id}/photos?type=R
 *
 * Extracts photo items, pagination info, and page metadata from the native
 * Douban photos gallery page DOM. Called once at mount time from beforeMount().
 */

export interface PhotoItem {
  id: string
  src: string
  link: string
  caption: string
  commentCount: string
}

export interface PageInfo {
  currentPage: number
  totalPages: number
  totalCount: number
  prevUrl: string
  nextUrl: string
}

export interface PhotosPageData {
  title: string
  photos: PhotoItem[]
  pageInfo: PageInfo
  photoType: string
  filterTabs: FilterTab[]
  subFilters: FilterTab[]
  sidebarLinks: { href: string; text: string }[]
}

export interface FilterTab {
  label: string
  url: string
  isCurrent: boolean
}

/**
 * Extract the photo type from the URL query parameter.
 * type=R = poster (海报), type=S = stills (剧照), type=W = wallpaper (壁纸)
 * Defaults to 'R' if not specified.
 */
function extractPhotoType(): string {
  const params = new URLSearchParams(location.search)
  const t = params.get('type')
  if (t === 'S' || t === 'R' || t === 'W') return t
  return 'R'
}

function extractFilterItem(
  label: string,
  url: string,
  isCurrent: boolean,
): FilterTab {
  return { label, url, isCurrent }
}

function extractFilters(): { filterTabs: FilterTab[]; subFilters: FilterTab[] } {
  const filterEl = document.querySelector('#photos_filter')
  if (!filterEl) return { filterTabs: [], subFilters: [] }

  const filterTabs: FilterTab[] = []

  filterEl.querySelectorAll(':scope > ul > li').forEach((li) => {
    if (li.classList.contains('up')) return
    const link = li.querySelector<HTMLAnchorElement>('a')
    if (link) {
      filterTabs.push(extractFilterItem(link.textContent?.trim() || '', link.href, false))
    } else {
      const span = li.querySelector('span')
      if (span) {
        filterTabs.push(extractFilterItem(span.textContent?.trim() || '', '', true))
      }
    }
  })

  const subFilters: FilterTab[] = []
  const subUl = filterEl.querySelector(':scope > ul > ul.sub')
  subUl?.querySelectorAll('li a').forEach((a) => {
    const anchor = a as HTMLAnchorElement
    subFilters.push(extractFilterItem(anchor.textContent?.trim() || '', anchor.href, false))
  })

  return { filterTabs, subFilters }
}

/**
 * Extract photo items from the native Douban photos page.
 *
 * Native DOM structure:
 *   ul.poster-col3 > li[data-id] > .cover > a[href] > img[src]
 *                           + > .name (caption text, optional comment link)
 *
 * The content script runs in document_idle so the full DOM is available.
 */
function extractPhotos(): PhotoItem[] {
  const items: PhotoItem[] = []
  const lis = document.querySelectorAll<HTMLLIElement>(
    'ul[class*="poster-col"] li[data-id]'
  )
  lis.forEach((li) => {
    const id = li.dataset.id || ''
    const coverA = li.querySelector<HTMLAnchorElement>('.cover a')
    const img = li.querySelector<HTMLImageElement>('.cover img')
    const nameEl = li.querySelector('.name')

    // src from the img element — it may be a lazy-load placeholder, use the
    // real src or data-src if available.
    let src = img?.src || ''
    if (!src || src.startsWith('data:')) {
      src = img?.getAttribute('data-src') || img?.getAttribute('src') || ''
    }
            src = src.replace(/\/view\/photo\/[^/]+\/public\//, '/view/photo/xl/public/')

    // Link to individual photo page
    const link = coverA?.href || ''

    // Caption + optional comment count
    const commentA = nameEl?.querySelector('a')
    const commentCount = commentA?.textContent?.trim() || ''
    // Remove the comment link before reading caption text
    if (commentA) {
      commentA.remove()
    }
    const caption = nameEl?.textContent?.trim() || ''

    if (id && src) {
      items.push({ id, src, link, caption, commentCount })
    }
  })
  return items
}

/**
 * Extract pagination info from .paginator.
 */
function extractPagination(): PageInfo {
  const paginator = document.querySelector('.paginator')
  const thispage = paginator?.querySelector('.thispage')
  const currentPage = parseInt(thispage?.textContent?.trim() || '1', 10) || 1
  const totalPages = parseInt(thispage?.getAttribute('data-total-page') || '1', 10) || 1
  const countEl = paginator?.querySelector('.count')
  const countMatch = countEl?.textContent?.match(/(\d+)/)
  const totalCount = countMatch ? parseInt(countMatch[1], 10) : 0
  const prevA = paginator?.querySelector<HTMLAnchorElement>('.prev a')
  const nextA = paginator?.querySelector<HTMLAnchorElement>('.next a')
  return {
    currentPage,
    totalPages,
    totalCount,
    prevUrl: prevA?.href || '',
    nextUrl: nextA?.href || '',
  }
}

function extractSidebarLinks(): { href: string; text: string }[] {
  const links: { href: string; text: string }[] = []
  document.querySelectorAll<HTMLAnchorElement>('.aside .links a, .aside .mb30 a').forEach((a) => {
    const href = a.getAttribute('href') || ''
    const text = a.textContent?.trim().replace(/^>\s*/, '') || ''
    if (href && text) links.push({ href, text })
  })
  return links
}

/**
 * Extract all data from the current Douban photos page.
 * Handles both /photos (single-type) and /all_photos (multi-type summary) pages.
 */
export function extractPhotosPageData(): PhotosPageData | null {
  const h1 = document.querySelector('#content h1')
  const title = h1?.textContent?.trim() || ''
  const isAll = window.location.pathname.endsWith('/all_photos')

  if (isAll) {
    if (!document.querySelector('div.mod ul.pic-col5')) return null

    const photos: PhotoItem[] = []
    document.querySelectorAll<HTMLLIElement>('div.mod ul.pic-col5 li:not(.more-pics)').forEach((li) => {
      const link = li.querySelector<HTMLAnchorElement>('a')
      const img = li.querySelector<HTMLImageElement>('a img')
      if (!link || !img) return

      const href = link.href
      const photoId = href.match(/\/photo\/(\d+)\//)?.[1] || ''
      let src = img.getAttribute('data-src') || img.src || ''
      if (!src || src.startsWith('data:')) {
        src = img.getAttribute('src') || ''
      }
      src = src.replace(/\/view\/photo\/[^/]+\/public\//, '/view/photo/xl/public/')

      photos.push({ id: photoId, src, link: href, caption: '', commentCount: '' })
    })

    return {
      title,
      photos,
      pageInfo: { currentPage: 1, totalPages: 1, totalCount: photos.length, prevUrl: '', nextUrl: '' },
      photoType: 'R',
      filterTabs: [],
      subFilters: [],
      sidebarLinks: extractSidebarLinks(),
    }
  }

  // /photos?type=... (single-type, existing logic)
  if (!document.querySelector('ul[class*="poster-col"]')) return null

  const photos = extractPhotos()

  const pageInfo = extractPagination()

  const photoType = extractPhotoType()
  const { filterTabs, subFilters } = extractFilters()

  return { title, photos, pageInfo, photoType, filterTabs, subFilters, sidebarLinks: [] }
}