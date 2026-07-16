/**
 * Game explore page data extraction.
 *
 * The game explore page embeds data in a `GlobalData` JS object
 * inside inline <script> tags. This module extracts it using
 * multiple strategies similar to search-data.ts.
 */

import type { GameExploreData, GameExploreItem, GameExploreFilterGroup, GameExplorePagination } from './types'

/** Parse GlobalData from inline script tags (key-by-key assignment format) */
function parseGlobalDataFromScript(): GameExploreData | undefined {
  const scripts = document.querySelectorAll('script')
  const combined: Record<string, unknown> = {}
  let found = false

  for (const script of scripts) {
    const text = script.textContent || ''
    // Match all: GlobalData['key'] = value;
    const keyRe = /GlobalData\s*\[\s*'(\w+)'\s*\]\s*=\s*/g
    let match: RegExpExecArray | null
    while ((match = keyRe.exec(text)) !== null) {
      const key = match[1]
      // Find the value: starts after '= ' and ends at ';\n' or ';\s*\n'
      const rest = text.slice(match.index + match[0].length).trimStart()
      let end = rest.indexOf(';\n')
      if (end === -1) end = rest.indexOf(';' + '\n')
      if (end === -1) end = rest.indexOf(';\n')
      if (end === -1) {
        // fallback: find the last ';' that makes valid JSON
        const semiPos = rest.indexOf(';')
        if (semiPos === -1) continue
        end = semiPos
      }
      const raw = rest.slice(0, end).trim()
      // The value might be a non-standard literal like 'undefined' or a function call —
      // try to extract JSON values only
      if (!raw) continue
      // Skip non-JSON values (function calls, identifiers, etc.)
      if (/^[a-z_][\w.]*\s*\(/.test(raw)) continue
      if (/^[a-z_][\w]*$/.test(raw) && raw !== 'true' && raw !== 'false' && raw !== 'null') continue
      try {
        const val = JSON.parse(raw)
        combined[key] = val
        found = true
      } catch {
        // Individual value parse failed, skip this key
      }
    }
  }

  if (!found || !combined['results']) return undefined
  return normalizeGlobalData(combined)
}

/** Normalize raw GlobalData into GameExploreData */
function normalizeGlobalData(raw: Record<string, unknown>): GameExploreData {
  const results = (raw['results'] as Array<Record<string, unknown>> | undefined) || []
  const filters = (raw['filters'] as Array<Record<string, unknown>> | undefined) || []
  const searcher = (raw['searcher'] as Record<string, unknown>) || { keyword: '' }
  const sorter = (raw['sorter'] as Record<string, unknown>) || { value: '' }
  const pagination = (raw['pagination'] as Record<string, unknown>) || { nextPage: null, hasMore: false }

  const items: GameExploreItem[] = results.map((r) => ({
    id: parseInt(String(r['id'] || '0'), 10),
    title: String(r['title'] || ''),
    url: String(r['url'] || ''),
    rating: String(r['rating'] || ''),
    star: String(r['star'] || ''),
    cover: String(r['cover'] || ''),
    genres: (String(r['genres'] || '')).split(' / ').filter(Boolean),
    platforms: (String(r['platforms'] || '')).split(' / ').filter(Boolean),
    review: r['review']
      ? { content: String((r['review'] as Record<string, unknown>)['content'] || ''), author: String((r['review'] as Record<string, unknown>)['author'] || '') }
      : null,
    nRatings: parseInt(String(r['n_ratings'] || '0'), 10),
  }))

  const normalizedFilters: GameExploreFilterGroup[] = filters.map((f) => ({
    name: String(f['name'] || ''),
    text: String(f['text'] || ''),
    options: ((f['options'] as Array<Record<string, unknown>> | undefined) || []).map((o) => ({
      text: String(o['text'] || ''),
      value: String(o['value'] ?? ''),
      unique: Boolean(o['unique']),
      checked: Boolean(o['checked']),
    })),
  }))

  const data: GameExploreData = {
    items,
    pagination: normalizePagination(pagination),
    filters: applyUrlParamsToFilters(normalizedFilters),
    searcher: { keyword: String(searcher['keyword'] || '') },
    sorter: { value: sortFromUrl() || String(sorter['value'] || '') },
  }
  return data
}

/** Read sort value from URL params, or empty string if not present */
function sortFromUrl(): string {
  const params = new URLSearchParams(location.search)
  return params.get('sort') || ''
}

/** Normalize raw pagination data */
function normalizePagination(raw: Record<string, unknown>): GameExplorePagination {
  return {
    nextPage: raw['nextPage'] != null ? String(raw['nextPage']) : null,
    hasMore: Boolean(raw['hasMore']),
  }
}

/** Override filter checked state based on current URL query parameters */
function applyUrlParamsToFilters(filters: GameExploreFilterGroup[]): GameExploreFilterGroup[] {
  const params = new URLSearchParams(location.search)

  return filters.map((group) => {
    const raw = params.get(group.name) // e.g. "genres=5,1" or "platforms=94"
    const selectedValues = raw ? raw.split(',').filter(Boolean) : []

    return {
      ...group,
      options: group.options.map((opt) => {
        // Unique/"全部" option: checked when selectedValues is empty
        if (opt.unique) {
          return { ...opt, checked: selectedValues.length === 0 }
        }
        // Normal option: checked when its value is in the URL param
        return { ...opt, checked: selectedValues.includes(opt.value) }
      }),
    }
  })
}

/** Extract GlobalData using an injected script bridge (CSP bypass) */
function extractViaBridge(): Promise<GameExploreData | undefined> {
  return new Promise((resolve) => {
    try {
      const bridge = document.createElement('div')
      bridge.id = 'umm-game-data-bridge'
      bridge.style.display = 'none'
      document.body.appendChild(bridge)

      const s = document.createElement('script')
      s.textContent = `
        try {
          var gd = GlobalData;
          var b = document.getElementById('umm-game-data-bridge');
          if (gd && gd.results && gd.results.length) {
            b.setAttribute('data-v', encodeURIComponent(JSON.stringify(gd)));
          }
        } catch(e) {}
      `
      document.body.appendChild(s)
      s.remove()

      const raw = bridge.getAttribute('data-v')
      bridge.remove()
      if (raw) {
        const data = JSON.parse(decodeURIComponent(raw)) as Record<string, unknown>
        resolve(normalizeGlobalData(data))
      } else {
        resolve(undefined)
      }
    } catch {
      resolve(undefined)
    }
  })
}

/** Fallback DOM extraction */
function extractFromDOM(): GameExploreItem[] {
  const items: GameExploreItem[] = []
  const listItems = document.querySelectorAll('.game-list li')
  listItems.forEach((li) => {
    const posterLink = li.querySelector<HTMLAnchorElement>('a.game-poster')
    const img = li.querySelector<HTMLImageElement>('a.game-poster img')
    const infoEl = li.querySelector('.game-info')
    const titleLink = infoEl?.querySelector<HTMLAnchorElement>('.game-title a')
    const metaSpans = infoEl?.querySelectorAll<HTMLSpanElement>('.game-meta span')
    const ratingEl = infoEl?.querySelector<HTMLElement>('.game-ratings')
    const reviewEl = infoEl?.querySelector<HTMLElement>('.game-review')

    if (!posterLink || !titleLink) return
    const idMatch = posterLink.href.match(/\/game\/(\d+)/)
    if (!idMatch) return

    const starEl = ratingEl?.querySelector<HTMLElement>('[class*="allstar"]')
    let star = ''
    if (starEl) {
      const cls = Array.from(starEl.classList).find(c => c.startsWith('allstar'))
      if (cls) star = cls.replace('allstar', '')
    }

    // Rating value is in <strong> inside .game-ratings; n_ratings is the remaining text
    const ratingStrong = ratingEl?.querySelector<HTMLElement>('strong')
    const ratingValue = ratingStrong?.textContent?.trim() || ''
    const ratingLabel = ratingEl?.textContent?.trim() || ''
    const nRatingsMatch = ratingLabel.match(/(\d+)人评价/)
    const nRatings = nRatingsMatch ? parseInt(nRatingsMatch[1], 10) : 0

    const genres: string[] = []
    const platforms: string[] = []
    metaSpans?.forEach((s) => {
      const text = s.textContent?.trim() || ''
      if (text.startsWith('游戏')) {
        text.split(' / ').forEach(t => genres.push(t))
      } else {
        text.split(' / ').forEach(t => platforms.push(t))
      }
    })

    let reviewContent: string | null = null
    let reviewAuthor: string | null = null
    if (reviewEl) {
      const fullText = reviewEl.textContent?.trim() || ''
      const authorMatch = fullText.match(/--(.+)$/)
      if (authorMatch) {
        reviewContent = fullText.slice(0, -authorMatch[0].length).trim()
        reviewAuthor = authorMatch[1].replace(/评价$/, '').trim()
      } else {
        reviewContent = fullText
      }
    }

    items.push({
      id: parseInt(idMatch[1], 10),
      title: titleLink.textContent?.trim() || '',
      url: posterLink.href,
      rating: ratingValue,
      star,
      cover: img?.src || img?.getAttribute('data-original') || img?.getAttribute('data-src') || '',
      genres,
      platforms,
      review: reviewContent ? { content: reviewContent, author: reviewAuthor || '' } : null,
      nRatings,
    })
  })
  return items
}

/** Extract filter groups and sorter from native DOM */
function extractFiltersFromDOM(): { filters: GameExploreFilterGroup[]; sorter: { value: string } } {
  const filters: GameExploreFilterGroup[] = []
  const fieldsets = document.querySelectorAll('.game-filters form.filters fieldset')
  fieldsets.forEach((fs) => {
    const legend = fs.querySelector('legend')
    const name = legend?.textContent?.trim() === '主机平台' ? 'platforms' : 'genres'
    const text = legend?.textContent?.trim() || ''
    const options: { text: string; value: string; unique: boolean; checked: boolean }[] = []
    const labels = fs.querySelectorAll<HTMLLabelElement>('.filter-options label')
    labels.forEach((label) => {
      const input = label.querySelector<HTMLInputElement>('input[type="checkbox"]')
      if (!input) return
      const labelText = label.textContent?.trim()?.replace('×', '').trim() || ''
      options.push({
        text: labelText,
        value: input.value,
        unique: input.value === '',
        checked: input.checked,
      })
    })
    if (options.length) {
      filters.push({ name, text, options })
    }
  })

  // Extract sorter from radio buttons
  const checkedRadio = document.querySelector<HTMLInputElement>('.game-filters .sorters input[type="radio"]:checked')
  const sorter = { value: checkedRadio?.value || 'rating' }

  return { filters, sorter }
}

/**
 * Parse game explore data from the page.
 * Tries: 1) inline script parsing, 2) injected bridge, 3) DOM fallback.
 */
export async function parseGameExploreData(): Promise<GameExploreData | undefined> {
  // Strategy 1: Direct window access
  const direct = (window as unknown as Record<string, unknown>).GlobalData as Record<string, unknown> | undefined
  if (direct?.results) {
    return normalizeGlobalData(direct)
  }

  // Strategy 2: Parse from inline script tag
  const fromScript = parseGlobalDataFromScript()
  if (fromScript) return fromScript

  // Strategy 3: Injected script bridge (CSP bypass)
  const fromBridge = await extractViaBridge()
  if (fromBridge) return fromBridge

  // Strategy 4: DOM fallback
  const domItems = extractFromDOM()
  if (domItems.length > 0) {
    const params = new URLSearchParams(location.search)
    const { filters, sorter } = extractFiltersFromDOM()
    return {
      items: domItems,
      pagination: { nextPage: null, hasMore: false },
      filters: applyUrlParamsToFilters(filters),
      searcher: { keyword: params.get('q') || '' },
      sorter: { value: sortFromUrl() || sorter.value },
    }
  }

  return undefined
}
