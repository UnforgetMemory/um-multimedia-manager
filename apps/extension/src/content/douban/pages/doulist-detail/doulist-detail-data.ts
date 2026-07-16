/**
 * DOM data extractor for Douban doulist detail page (www.douban.com/doulist/{id}/).
 *
 * Extracts: header info, filter tabs, items (with ratings/meta/source),
 * and paginator from the native page DOM.
 */

import type { DoulistDetailPageData, DoulistDetailItem, DoulistFilter, DoulistPaginator } from './types'

/**
 * Parse the abstract string from a doulist item into structured fields.
 * Format examples:
 *   "导演: 梁乐民 / 陆剑青<br>主演: 郭富城 / 梁家辉 / 李治廷<br>类型: 剧情 / 动作 / 犯罪<br>制片国家/地区: 中国香港/中国大陆<br>年份: 2012"
 * Some items may have fewer fields.
 */
function parseAbstract(html: string): { director: string; actors: string; genres: string; region: string; year: string } {
  const result = { director: '', actors: '', genres: '', region: '', year: '' }

  // Split by <br> (handling various formats)
  const lines = html.split(/<br\s*\/?>/i).map(l => l.trim()).filter(Boolean)

  for (const line of lines) {
    if (line.startsWith('导演:')) {
      result.director = line.replace(/^导演:\s*/, '').trim()
    } else if (line.startsWith('主演:')) {
      result.actors = line.replace(/^主演:\s*/, '').trim()
    } else if (line.startsWith('类型:')) {
      result.genres = line.replace(/^类型:\s*/, '').trim()
    } else if (line.startsWith('制片国家/地区:')) {
      result.region = line.replace(/^制片国家\/地区:\s*/, '').trim()
    } else if (line.startsWith('年份:')) {
      result.year = line.replace(/^年份:\s*/, '').trim()
    } else if (line.startsWith('作者:')) {
      // Music subject may have "作者:" instead of "导演:"
      result.director = line.replace(/^作者:\s*/, '').trim()
    } else if (line.startsWith('表演者:')) {
      // Music subject may have "表演者:" instead of "主演:"
      result.actors = line.replace(/^表演者:\s*/, '').trim()
    } else if (line.startsWith('流派:')) {
      // Music subject may have "流派:" instead of "类型:"
      result.genres = line.replace(/^流派:\s*/, '').trim()
    }
  }

  return result
}

/**
 * Extract rating number from a doulist item's rating section.
 * Returns 0 if unrated (no .rating_nums element).
 */
function extractRating(itemEl: Element): { rating: number; ratingCount: number } {
  const ratingNums = itemEl.querySelector('.rating_nums')
  if (!ratingNums) return { rating: 0, ratingCount: 0 }

  const rating = parseFloat(ratingNums.textContent?.trim() ?? '') || 0

  // Rating count is in the <span> after rating_nums, e.g. "<span>(431872人评价)</span>"
  const ratingText = ratingNums.nextElementSibling?.textContent?.trim() ?? ''
  const countMatch = ratingText.match(/(\d[\d,]*)/)
  const ratingCount = countMatch ? parseInt(countMatch[1].replace(/,/g, ''), 10) : 0

  return { rating, ratingCount }
}

/**
 * Extract a single doulist item from its .doulist-item container.
 */
function extractItem(itemEl: Element): DoulistDetailItem | null {
  // Subject ID from .doulist-add-btn a[data-id]
  const addBtn = itemEl.querySelector<HTMLAnchorElement>('.doulist-add-btn a[data-id]')
  const subjectId = addBtn?.getAttribute('data-id') ?? ''

  // Subject URL from .post a or .title a
  const postLink = itemEl.querySelector<HTMLAnchorElement>('.post a')
  const titleLink = itemEl.querySelector<HTMLAnchorElement>('.title a')
  const subjectUrl = postLink?.getAttribute('href') ?? titleLink?.getAttribute('href') ?? ''

  // If we can't find a subject ID or URL, skip this item
  if (!subjectId && !subjectUrl) return null

  // Derive subjectId from URL if not found from data-id
  const resolvedSubjectId = subjectId || (subjectUrl.match(/\/subject\/(\d+)/)?.[1] ?? '')

  // Title
  const title = titleLink?.textContent?.trim() ?? ''

  // Poster
  const posterImg = itemEl.querySelector<HTMLImageElement>('.post img')
  const posterUrl = posterImg?.src ?? ''

  // Rating
  const { rating, ratingCount } = extractRating(itemEl)

  // Abstract
  const abstractEl = itemEl.querySelector('.abstract')
  const abstractHtml = abstractEl?.innerHTML ?? ''
  // Also try `.abstract` in music subject items
  const meta = parseAbstract(abstractHtml)

  // Source
  const sourceEl = itemEl.querySelector('.source')
  const source = sourceEl?.textContent?.trim() ?? ''

  // Category from add button
  const category = addBtn?.getAttribute('data-cate') ?? ''

  // Video links
  const hasVideo = !!itemEl.querySelector('.doulist-video-items')

  return {
    subjectId: resolvedSubjectId,
    title,
    posterUrl,
    subjectUrl,
    rating,
    ratingCount,
    ...meta,
    source,
    category,
    hasVideo,
  }
}

/**
 * Extract filter tabs from .doulist-filter.
 */
function extractFilters(): DoulistFilter[] {
  const filters: DoulistFilter[] = []
  const filterEl = document.querySelector('.doulist-filter')
  if (!filterEl) return filters

  filterEl.querySelectorAll<HTMLAnchorElement>('a').forEach((a) => {
    const text = a.textContent?.trim() ?? ''
    const href = a.getAttribute('href') ?? ''
    const countMatch = text.match(/\((\d+)\)/)
    const label = text.replace(/\(\d+\)/, '').trim()
    filters.push({
      label: label || text,
      count: countMatch ? parseInt(countMatch[1], 10) : 0,
      url: href.startsWith('http') ? href : `https://www.douban.com${href}`,
      active: a.className.includes('active'),
    })
  })

  return filters
}

/**
 * Extract paginator from .paginator.
 * Collects all page numbers as a sorted list with correct current-page marking.
 */
function extractPaginator(): DoulistPaginator {
  const paginator: DoulistPaginator = {
    currentPage: 1,
    totalPages: 1,
    prevUrl: '',
    nextUrl: '',
    pages: [],
  }

  const pagEl = document.querySelector('.paginator')
  if (!pagEl) return paginator

  // thispage label (the current page, rendered as a <span>, not an <a>)
  const thisPage = pagEl.querySelector<HTMLElement>('.thispage')
  const thisPageLabel = thisPage?.textContent?.trim() ?? ''
  if (thisPage) {
    paginator.currentPage = parseInt(thisPageLabel, 10) || 1
    const totalAttr = thisPage.getAttribute('data-total-page')
    if (totalAttr) paginator.totalPages = parseInt(totalAttr, 10) || 1
  }

  // Prev/next
  const prevLink = pagEl.querySelector<HTMLAnchorElement>('.prev a')
  const nextLink = pagEl.querySelector<HTMLAnchorElement>('.next a')
  if (prevLink) paginator.prevUrl = prevLink.getAttribute('href') ?? prevLink.href
  if (nextLink) paginator.nextUrl = nextLink.getAttribute('href') ?? nextLink.href

  // Collect all numbered page <a> links (skip prev/next parents)
  const pageEntries: { label: string; url: string; current: boolean }[] = []
  pagEl.querySelectorAll<HTMLAnchorElement>('a').forEach((a) => {
    if (a.closest('.prev') || a.closest('.next')) return
    const label = a.textContent?.trim() ?? ''
    const href = a.getAttribute('href') ?? a.href
    if (!href) return
    const num = parseInt(label, 10)
    if (isNaN(num)) return
    pageEntries.push({
      label,
      url: href,
      current: label === thisPageLabel,
    })
  })

  // If thispage has a label not yet in the list, insert at sorted position
  if (thisPageLabel && !pageEntries.some(p => p.label === thisPageLabel)) {
    pageEntries.push({ label: thisPageLabel, url: '', current: true })
  }

  // Sort by page number
  pageEntries.sort((a, b) => parseInt(a.label, 10) - parseInt(b.label, 10))
  paginator.pages = pageEntries

  return paginator
}

/**
 * Extract total item count from the active filter tab or from text.
 */
function extractTotalCount(filters: DoulistFilter[]): number {
  // Try active filter first
  const active = filters.find(f => f.active)
  if (active && active.count > 0) return active.count

  // Fallback: parse from filter text
  for (const f of filters) {
    if (f.count > 0) return f.count
  }
  return 0
}

/**
 * Main extraction function. Returns null if the page structure is unrecognized.
 */
export function extractDoulistDetailData(): DoulistDetailPageData | null {
  const url = location.href
  const idMatch = url.match(/\/doulist\/(\d+)/)
  const id = idMatch?.[1] ?? ''
  if (!id) return null

  // ── Header info ──

  // Title from h1 > span
  const titleEl = document.querySelector<HTMLElement>('h1 span')
  const title = titleEl?.textContent?.trim() ?? ''

  // Cover
  const coverImg = document.querySelector<HTMLImageElement>('#doulist-info .doulist-cover img')
  const coverUrl = coverImg?.src ?? ''

  // Creator
  const avatarLink = document.querySelector<HTMLAnchorElement>('#doulist-info .hd .avatar')
  const avatarImg = document.querySelector<HTMLImageElement>('#doulist-info .hd .avatar img')
  const creatorId = avatarLink?.getAttribute('href')?.match(/\/people\/([^/]+)/)?.[1] ?? ''
  const creatorName = avatarImg?.getAttribute('alt') ?? ''
  const avatarUrl = avatarImg?.src ?? ''

  // Location from meta text: "来自: [name] (location)"
  const metaEl = document.querySelector('#doulist-info .hd .meta')
  const metaText = metaEl?.textContent?.trim() ?? ''
  const locMatch = metaText.match(/\(([^)]+)\)/)
  const creatorLocation = locMatch?.[1] ?? ''

  // Times
  const timeEl = document.querySelector('#doulist-info .hd .meta .time')
  const timeText = timeEl?.textContent?.trim() ?? ''
  let createdTime = ''
  let updatedTime = ''
  if (timeText) {
    const parts = timeText.split('创建')
    createdTime = (parts[0] ?? '').trim()
    if (parts[1]) {
      updatedTime = parts[1].replace('更新', '').trim()
    }
  }

  // Description
  const descEl = document.querySelector('#doulist-info .bd')
  const description = descEl?.textContent?.trim() ?? ''

  // ── Filters ──
  const filters = extractFilters()
  const totalCount = extractTotalCount(filters)

  // ── Items ──
  const items: DoulistDetailItem[] = []
  document.querySelectorAll<HTMLElement>('#content .doulist-item').forEach((itemEl) => {
    const item = extractItem(itemEl)
    if (item) items.push(item)
  })

  // ── Paginator ──
  const paginator = extractPaginator()

  return {
    id,
    title,
    coverUrl,
    creator: {
      id: creatorId,
      name: creatorName,
      location: creatorLocation,
      avatarUrl,
    },
    createdTime,
    updatedTime,
    description,
    totalCount,
    filters,
    items,
    paginator,
  }
}
