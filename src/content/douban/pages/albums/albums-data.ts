/**
 * Albums version-list page data extraction.
 * Parses music.douban.com/albums/{id} — li.dlist items with cover, title,
 * rating, and abstract metadata (artist/date/type/format/genre).
 */
import { Store } from '@/features/database'
import type { StoreRecord } from '@/types'
import type { AlbumsPageData, AlbumVersionItem } from './types'

function extractAlbumsDataImpl(): AlbumsPageData | null {
  const h1 = document.querySelector('h1')
  const albumTitle = h1?.textContent?.trim() || ''

  const items: AlbumVersionItem[] = []
  document.querySelectorAll('li.dlist').forEach((li) => {
    const id = parseInt(li.id, 10)
    if (!id) return

    const coverImg = li.querySelector<HTMLImageElement>('img.cover')
    const coverUrl = coverImg?.src || coverImg?.getAttribute('data-original') || coverImg?.getAttribute('data-src') || ''

    const link = li.querySelector<HTMLAnchorElement>('a.pl2')
    const url = link?.href || ''
    const title = link?.textContent?.trim() || ''

    const subSpan = li.querySelector<HTMLSpanElement>('a.pl2 span[style*="font-size"]')
    const subTitle = subSpan?.textContent?.trim() || ''

    const plEl = li.querySelector<HTMLElement>('p.pl')
    const abstract = plEl?.textContent?.trim() || ''

    const ratingNumEl = li.querySelector<HTMLElement>('.rating_num')
    const ratingValue = parseFloat(ratingNumEl?.textContent?.trim() || '0') || 0

    const plTexts = li.querySelectorAll<HTMLElement>('.star .pl')
    let ratingCount = 0
    plTexts.forEach((el) => {
      const txt = el.textContent?.trim() || ''
      const m = txt.match(/(\d[\d,]*)/)
      if (m) ratingCount = parseInt(m[1].replace(/,/g, ''), 10) || 0
    })

    const starEl = li.querySelector<HTMLElement>('.rating-stars, [class*="allstar"]')
    let ratingStars = 0
    if (starEl) {
      const cls = Array.from(starEl.classList).find((c) => c.startsWith('allstar'))
      if (cls) ratingStars = parseInt(cls.replace('allstar', ''), 10) / 10
    }

    if (title && url) {
      items.push({ id, title, subTitle, coverUrl, url, abstract, ratingValue, ratingCount, ratingStars })
    }
  })

  if (!albumTitle || items.length === 0) return null
  return { albumTitle, versions: items }
}

async function loadRecordMapImpl(): Promise<Map<string, StoreRecord>> {
  const map = new Map<string, StoreRecord>()
  try {
    const entries = await Store.dbGetAll('douban_records')
    const prefix = 'music::'
    for (const { key, record } of entries) {
      if (key.startsWith(prefix)) {
        map.set(key.slice(prefix.length), record)
      }
    }
  } catch { /* ignore */ }
  return map
}

export const extractAlbumsData = extractAlbumsDataImpl
export const loadRecordMap = loadRecordMapImpl
