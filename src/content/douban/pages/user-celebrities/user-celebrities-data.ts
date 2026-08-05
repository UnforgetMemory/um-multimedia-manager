import { parseDoubanPaginator } from '../../shared/parse-douban-paginator'
import type { UserCelebritiesData, CelebrityItem } from './types'

export function extractUserCelebritiesData(): UserCelebritiesData | null {
  const url = location.href
  const uidMatch = url.match(/\/people\/([^/?]+)/)
  const userId = uidMatch?.[1] ?? ''

  // ---- User info ----
  const avatarImg = document.querySelector<HTMLImageElement>('#db-usr-profile .pic img, .side-info-avatar img')
  const avatarUrl = avatarImg?.src ?? ''

  const nameEl = document.querySelector('.side-info-txt h3')
  const avatarEl = document.querySelector('#db-usr-profile .pic img')
  const displayName = nameEl?.textContent?.trim() ?? avatarEl?.getAttribute('alt') ?? userId

  const navLinks: { label: string; url: string }[] = []
  document.querySelectorAll('#db-usr-profile .info ul li a').forEach((a) => {
    let href = a.getAttribute('href') ?? ''
    const text = a.textContent?.trim()
    if (text && href && text !== '|') {
      // Fix subdomain: www.douban.com → movie.douban.com for movie subdomain links
      href = href.replace('https://www.douban.com', 'https://movie.douban.com')
      navLinks.push({ label: text, url: href })
    }
  })

  // ---- Total from h1 ----
  const h1 = document.querySelector('#db-usr-profile .info h1')
  const h1Text = h1?.textContent?.trim() ?? ''
  const countMatch = h1Text.match(/\((\d+)\)/)
  const total = countMatch ? parseInt(countMatch[1], 10) : 0

  // ---- Items ----
  const items: CelebrityItem[] = []
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
    if (intros[1]) {
      intros[1].querySelectorAll<HTMLAnchorElement>('a').forEach((a) => {
        const title = a.textContent?.trim()
        const href = a.getAttribute('href') ?? a.href
        if (title && href) works.push({ title, url: href })
      })
    }

    if (name && url) {
      items.push({ name, photoUrl, roles, works, url })
    }
  })

  // ---- Paginator ----
  const { pageLinks, prevPageUrl, nextPageUrl } = parseDoubanPaginator(document.querySelector('.paginator'))

  if (items.length === 0 && total === 0) return null

  return {
    userId, displayName, avatarUrl, navLinks,
    total, items, pageLinks, prevPageUrl, nextPageUrl,
  }
}
