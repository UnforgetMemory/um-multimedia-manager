import { extractCollectPageShell } from '@/content/douban/shared/douban-extract'
import type { UserMediaPageData, UserMediaFilterGroup, UserMediaItem } from './types'

export function extractUserMediaData(): UserMediaPageData | null {
  // ---- Shared collect-page shell (user info, nav, sort, page info, paginator) ----
  const shell = extractCollectPageShell(document)

  // user-media nav links exclude the '|' separator entries (shell keeps all)
  const navLinks = shell.navLinks.filter((l) => l.label !== '|')

  // ---- Filter groups ----
  const filterGroups: UserMediaFilterGroup[] = []
  document.querySelectorAll<HTMLDivElement>('.tabs-more').forEach((group) => {
    const labelEl = group.querySelector('span.gray')
    const label = labelEl?.textContent?.trim().replace(/[:：]\s*$/, '') ?? ''
    const currentEl = group.querySelector('.lnk-tab-more span')
    const current = currentEl?.textContent?.trim() ?? ''
    const items: { label: string; url: string }[] = []
    const list = group.querySelector('ul.tabs-more-list')
    if (list) {
      list.querySelectorAll<HTMLAnchorElement>('a').forEach((a) => {
        const text = a.textContent?.trim()
        const href = a.getAttribute('href') ?? a.href
        if (text && href) items.push({ label: text, url: href })
      })
    }
    if (label) {
      filterGroups.push({ label, current, items })
    }
  })

  // ---- Shared shell provides pageInfo/mode/paginator ----
  const { currentPage, mode, pageLinks, prevPageUrl, nextPageUrl } = shell
  let { total } = shell

  // ---- Items ----
  const items: UserMediaItem[] = []
  const itemEls = document.querySelectorAll('.grid-view .item, .list-view .item')
  itemEls.forEach((el) => {
    const link = el.querySelector<HTMLAnchorElement>('.title a, .info a[href*="/subject/"]')
    const href = link?.getAttribute('href') ?? ''
    const subjectMatch = href.match(/\/subject\/(\d+)/)
    const subjectId = subjectMatch?.[1]
    if (!subjectId) return

    const img = el.querySelector<HTMLImageElement>('.pic img, .nbg img')
    const posterUrl = img?.src ?? ''

    const ratingEl = el.querySelector<HTMLElement>('[class*="rating"]')
    const ratingClass = ratingEl?.className ?? ''
    const ratingMatch = ratingClass.match(/rating(\d)-t/)
    const rating = ratingMatch ? ratingMatch[1] : '0'

    const dateEl = el.querySelector('.date')
    const date = dateEl?.textContent?.trim() ?? ''

    const commentEl = el.querySelector('.comment')
    const comment = commentEl?.textContent?.trim() ?? ''

    const emEl = link?.querySelector('em')
    const title = emEl?.textContent?.trim() ?? link?.textContent?.trim() ?? ''

    items.push({ subjectId, title, posterUrl, rating, date, comment, url: href })
  })

  if (items.length === 0 && total > 0) return null

  // Fallback: if subject-num parsing failed but items + paginator exist
  if (total === 0 && items.length > 0 && pageLinks.length > 0) {
    const lastLink = pageLinks[pageLinks.length - 1]
    if (lastLink.url) {
      const startMatch = lastLink.url.match(/start=(\d+)/)
      if (startMatch) {
        total = parseInt(startMatch[1], 10) + items.length
      }
    }
  }

  return {
    subType: shell.subType, userId: shell.userId, displayName: shell.displayName, avatarUrl: shell.avatarUrl,
    navLinks, sortOptions: shell.sortOptions, filterGroups, currentPage, total, mode, items,
    pageLinks, prevPageUrl, nextPageUrl,
  }
}
