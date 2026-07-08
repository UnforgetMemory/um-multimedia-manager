/**
 * Search page data extraction — extracted from douban-search.content/index.ts
 */

import type { DoubanSearchData, SearchItem } from './types'

/** Extract __DATA__ from inline script tags — bypasses CSP and isolated world */
function parseDataFromScriptTag(): DoubanSearchData | undefined {
  const scripts = document.querySelectorAll('script[type="text/javascript"]')
  for (const script of scripts) {
    const text = script.textContent || ''
    const m = text.match(/window\.__DATA__\s*=\s*([\s\S]+);\s*window\.__USER__/)
    if (m) {
      try {
        const data = JSON.parse(m[1]) as DoubanSearchData
        if (data?.items?.length) return data
      } catch { /* continue to next script */ }
    }
  }
  return undefined
}

/** Read __DATA__ using multiple strategies */
function readDataFromPage(): Promise<DoubanSearchData | undefined> {
  // 1. Direct window access (works in some Chrome contexts)
  const direct = (window as unknown as Record<string, unknown>).__DATA__ as DoubanSearchData | undefined
  if (direct?.items?.length) return Promise.resolve(direct)

  // 2. Parse from inline script tag (bypasses CSP)
  const fromTag = parseDataFromScriptTag()
  if (fromTag) return Promise.resolve(fromTag)

  // 3. Injected script bridge (works without CSP)
  try {
    const el = document.createElement('div')
    el.id = 'umm-data-bridge'
    el.style.display = 'none'
    document.body.appendChild(el)

    const s = document.createElement('script')
    s.textContent = `
      try {
        var d = window.__DATA__;
        var b = document.getElementById('umm-data-bridge');
        if (d && d.items && d.items.length) {
          b.setAttribute('data-v', encodeURIComponent(JSON.stringify(d)));
        }
      } catch(e) {}
    `
    document.body.appendChild(s)
    s.remove()

    const raw = el.getAttribute('data-v')
    el.remove()
    if (raw) {
      const data = JSON.parse(decodeURIComponent(raw)) as DoubanSearchData
      if (data?.items?.length) return Promise.resolve(data)
    }
  } catch { /* fall through */ }
  return Promise.resolve(undefined)
}

function extractFromDOM(): SearchItem[] {
  const items: SearchItem[] = []
  const cards = document.querySelectorAll('.item-root')
  cards.forEach((card) => {
    const link = card.querySelector('.title-text') as HTMLAnchorElement | null
    const img = card.querySelector('img.cover, .cover-link img, .cover img') as HTMLImageElement | null
    const cover_url = img?.src || img?.getAttribute('data-original') || img?.getAttribute('data-src') || ''
    const ratingEl = card.querySelector('.rating_nums')
    const ratingStars = card.querySelector('.rating-stars')
    const metaAbstracts = card.querySelectorAll('.meta')

    const href = link?.getAttribute('href') || ''
    const idMatch = href.match(/\/subject\/(\d+)/)
    if (!idMatch) return

    let starCount = 0
    if (ratingStars) {
      const cls = Array.from(ratingStars.classList).find(c => c.startsWith('allstar'))
      if (cls) starCount = parseInt(cls.replace('allstar', '')) / 10
    }

    const value = parseFloat(ratingEl?.textContent?.trim() || '0') || 0

    items.push({
      id: parseInt(idMatch[1]),
      title: link?.textContent?.trim() || '',
      cover_url,
      rating: { count: 0, star_count: starCount, value },
      abstract: metaAbstracts[0]?.textContent?.trim() || '',
      abstract_2: metaAbstracts[1]?.textContent?.trim() || '',
      url: href,
      labels: [],
      interest: { actions: [], status_text: '' },
      tpl_name: 'search_subject',
      topics: [],
    })
  })
  return items
}

async function parseSearchDataImpl(): Promise<DoubanSearchData | undefined> {
  const fromPage = await readDataFromPage()
  if (fromPage) {
    const filtered = fromPage.items.filter(i => i.tpl_name === 'search_subject' && i.id && i.cover_url)
    if (filtered.length) return { ...fromPage, items: filtered, count: fromPage.count || fromPage.items.length }
    return fromPage
  }

  const domItems = extractFromDOM()
  if (domItems.length > 0) {
    const params = new URLSearchParams(location.search)
    const hasNext = document.querySelector('.paginator .next[href], .paginator a.next')
    const approxTotal = hasNext ? domItems.length * 2 : domItems.length
    return {
      items: domItems,
      total: approxTotal,
      start: parseInt(params.get('start') || '0'),
      text: params.get('search_text') || '',
      count: domItems.length,
    }
  }
  return undefined
}

export const parseSearchData = parseSearchDataImpl