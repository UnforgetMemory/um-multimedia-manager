import { parseDoubanPaginator } from '../../shared/parse-douban-paginator'
import type { BookAuthorsData, AuthorItem } from './types'

/**
 * Extract all visible author entries from the current Douban page DOM.
 * Returns null if the page structure doesn't match expectations.
 */
export function extractBookAuthorsData(): BookAuthorsData | null {
  try { return _extractBookAuthorsData() }
  catch (err: unknown) { console.warn('[UMM] Error extracting book authors:', err); return null }
}

/** Internal extraction — separated so the public wrapper can catch errors */
function _extractBookAuthorsData(): BookAuthorsData | null {
  const url = location.href
  const uidMatch = url.match(/\/people\/([^/?]+)/)
  const userId = uidMatch?.[1] ?? ''

  // User info
  const avatarImg = document.querySelector<HTMLImageElement>('#db-usr-profile .pic img')
  const avatarUrl = avatarImg?.src ?? ''
  const displayName = avatarImg?.getAttribute('alt') ?? userId

  // Nav links
  const navLinks: { label: string; url: string }[] = []
  document.querySelectorAll('#db-usr-profile .info ul li a').forEach((a) => {
    const href = a.getAttribute('href') ?? ''
    const text = a.textContent?.trim()
    if (text && href) navLinks.push({ label: text, url: href })
  })

  // Total
  const h1 = document.querySelector('#db-usr-profile .info h1')
  const h1Text = h1?.textContent?.trim() ?? ''
  const countMatch = h1Text.match(/\((\d+)\)/)
  const total = countMatch ? parseInt(countMatch[1], 10) : 0

  // Items
  const items: AuthorItem[] = []
  document.querySelectorAll('.grid-view .item').forEach((el) => {
    const link = el.querySelector<HTMLAnchorElement>('.title a')
    const url = link?.getAttribute('href') ?? ''
    const em = link?.querySelector('em')
    const name = em?.textContent?.trim() ?? link?.textContent?.trim() ?? ''

    const img = el.querySelector<HTMLImageElement>('.pic img')
    const photoUrl = img?.src ?? ''

    const intros = el.querySelectorAll<HTMLElement>('.info .intro')
    const roles = intros[0]?.textContent?.trim() ?? ''

    const works: { title: string; url: string }[] = []
    // Works are in intros[1] if present; otherwise reuse intros[0]
    const worksIntro = intros.length > 1 ? intros[intros.length - 1] : intros[0]
    if (worksIntro) {
      worksIntro.querySelectorAll<HTMLAnchorElement>('a[href*="/subject/"]').forEach((a) => {
        const title = a.textContent?.trim()
        const href = a.getAttribute('href') ?? a.href
        if (title && href) works.push({ title, url: href })
      })
    }

    if (name && url) {
      items.push({ name, photoUrl, roles, works, url })
    }
  })

  // Paginator
  const { pageLinks, prevPageUrl, nextPageUrl } = parseDoubanPaginator(document.querySelector('.paginator'))

  if (items.length === 0 && total === 0) return null

  return {
    userId, displayName, avatarUrl, navLinks,
    total, items, pageLinks, prevPageUrl, nextPageUrl,
  }
}
