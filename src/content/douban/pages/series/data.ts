import { parseDoubanPaginatorDetail } from '@/content/douban/shared/parse-douban-paginator'
import type { SeriesPageData, SeriesItem, SeriesSortOption, SeriesPaginator } from './types'

function extractRating(itemEl: Element): { rating: number; ratingCount: number } {
  const ratingNums = itemEl.querySelector('.rating_nums')
  if (!ratingNums) return { rating: 0, ratingCount: 0 }

  const rating = parseFloat(ratingNums.textContent?.trim() ?? '') || 0
  const plEl = itemEl.querySelector('.star .pl')
  const ratingText = plEl?.textContent?.trim() ?? ''
  const countMatch = ratingText.match(/(\d[\d,]*)/)
  const ratingCount = countMatch ? parseInt(countMatch[1].replace(/,/g, ''), 10) : 0

  return { rating, ratingCount }
}

function extractItem(itemEl: Element): SeriesItem | null {
  const linkEl = itemEl.querySelector<HTMLAnchorElement>('.pic a.nbg')
  const subjectUrl = linkEl?.getAttribute('href') ?? ''
  if (!subjectUrl) return null

  const subjectIdMatch = subjectUrl.match(/\/subject\/(\d+)/)
  const subjectId = subjectIdMatch?.[1] ?? ''
  if (!subjectId) return null

  const titleEl = itemEl.querySelector<HTMLAnchorElement>('.info h2 a')
  const title = titleEl?.textContent?.trim() ?? ''

  // Upgrade Douban small thumbnail /s/ → /l/ for better resolution
  const coverImg = itemEl.querySelector<HTMLImageElement>('.pic img')
  const coverUrl = (coverImg?.src ?? '').replace(/\/view\/subject\/s\//, '/view/subject/l/')

  const pubEl = itemEl.querySelector('.info .pub')
  const pubInfo = pubEl?.textContent?.trim() ?? ''

  const { rating, ratingCount } = extractRating(itemEl)

  // .pub is a <div>, description is always in <p> — distinct by tag
  const descEl = itemEl.querySelector('.info p')
  const description = descEl?.textContent?.trim() ?? ''

  return {
    subjectId,
    title,
    coverUrl,
    subjectUrl: subjectUrl.startsWith('http') ? subjectUrl : `https://book.douban.com${subjectUrl}`,
    pubInfo,
    rating,
    ratingCount,
    description,
  }
}

function extractSortOptions(): SeriesSortOption[] {
  const params = new URLSearchParams(location.search)
  const order = params.get('order')
  const baseUrl = location.pathname

  return [
    { label: '按收藏人数排序', url: baseUrl, active: order !== 'time' },
    { label: '按出版时间先后排序', url: `${baseUrl}?order=time`, active: order === 'time' },
  ]
}

function extractPaginator(): SeriesPaginator {
  // H3 2026-08-08: delegated to the shared rich parser (same contract).
  return parseDoubanPaginatorDetail(document.querySelector('.paginator'))
}

export function extractSeriesData(): SeriesPageData | null {
  const url = location.href
  const idMatch = url.match(/\/series\/(\d+)/)
  const id = idMatch?.[1] ?? ''
  if (!id) return null

  const titleEl = document.querySelector<HTMLElement>('h1')
  const title = titleEl?.textContent?.trim() ?? ''

  const publisherEl = document.querySelector('.ll.publishers')
  const publisher = publisherEl?.textContent?.trim() ?? ''

  // Extract volumes from the specific .clear-both sibling, not body-wide scan
  let volumes = 0
  const clearBoth = document.querySelector('.clear-both')
  if (clearBoth) {
    const volMatch = clearBoth.textContent?.match(/册数:\s*(\d+)/)
    if (volMatch) volumes = parseInt(volMatch[1], 10) || 0
  }

  // Description is in the div immediately following <h2>简介</h2>
  let description = ''
  const headings = document.querySelectorAll('h2')
  for (const h2 of headings) {
    if (h2.textContent?.includes('简介')) {
      const next = h2.nextElementSibling as HTMLElement | null
      if (next) description = next.textContent?.trim() ?? ''
      break
    }
  }

  const sortOptions = extractSortOptions()

  const items: SeriesItem[] = []
  document.querySelectorAll<HTMLElement>('ul.subject-list li.subject-item').forEach((itemEl) => {
    const item = extractItem(itemEl)
    if (item) items.push(item)
  })

  const paginator = extractPaginator()

  // Estimate total across pages: paginator page count × items per page, or just this page
  const itemsPerPage = items.length || 1
  const totalCount = paginator.totalPages > 1
    ? paginator.totalPages * itemsPerPage
    : items.length

  return {
    id, title, publisher, volumes, description,
    totalCount, sortOptions, items, paginator,
  }
}
