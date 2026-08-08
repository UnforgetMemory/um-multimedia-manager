import { extractCollectPageShell } from '@/content/douban/shared/douban-extract'
import type { MusicCollectData, MusicCollectItem } from './types'

/**
 * Extract all visible music collection data from the current Douban page DOM.
 * Supports both music.douban.com/mine and music.douban.com/people/{uid}/(collect|wish|do) URLs.
 * Returns null if the page structure doesn't match expectations.
 */
export function extractMusicCollectData(): MusicCollectData | null {
  try { return _extractMusicCollectData() }
  catch (err: unknown) { console.warn('[UMM] Error extracting music collect:', err); return null }
}

/** Internal extraction — separated so the public wrapper can catch errors */
function _extractMusicCollectData(): MusicCollectData | null {
  const shell = extractCollectPageShell(document)
  let { total, pageLinks } = shell

  // Items — music uses .grid-view > .item.comment-item
  const items: MusicCollectItem[] = []
  const itemEls = document.querySelectorAll('.grid-view > .item.comment-item')
  itemEls.forEach((el) => {
    const link = el.querySelector<HTMLAnchorElement>('.info .title a')
    const href = link?.getAttribute('href') ?? ''
    const subjectMatch = href.match(/\/subject\/(\d+)/)
    const subjectId = subjectMatch?.[1]
    if (!subjectId) return

    // Extract parenthetical subtitle from the title text
    const titleText = link?.textContent?.trim() ?? ''
    const emEl = el.querySelector('.info .title em')
    const mainTitle = emEl?.textContent?.trim() ?? titleText
    // Get the full text and extract anything after the <em> as subtitle
    const fullTitle = link?.innerHTML ?? ''
    const subtitle = fullTitle.includes('<em>')
      ? fullTitle.replace(/<em>.*?<\/em>/, '').replace(/<\/?[^>]+>/g, '').trim().replace(/^\s*\/\s*/, '')
      : ''

    const img = el.querySelector<HTMLImageElement>('.pic .nbg img')
    const posterUrl = img?.src ?? ''

    const introEl = el.querySelector('.intro')
    const intro = introEl?.textContent?.trim() ?? ''

    // Rating — music uses rating1-t, rating2-t, rating3-t (1-3 stars)
    let rating = '0'
    if (el.querySelector('.rating1-t')) rating = '1'
    else if (el.querySelector('.rating2-t')) rating = '2'
    else if (el.querySelector('.rating3-t')) rating = '3'

    const dateEl = el.querySelector('.date')
    const date = dateEl?.textContent?.trim() ?? ''

    items.push({ subjectId, title: mainTitle, subtitle, posterUrl, intro, rating, date, url: href })
  })

  if (items.length === 0 && total > 0) return null
  if (total === 0 && items.length > 0 && pageLinks.length > 0) {
    const lastLink = pageLinks[pageLinks.length - 1]
    if (lastLink.url) {
      const startMatch = lastLink.url.match(/start=(\d+)/)
      if (startMatch) total = parseInt(startMatch[1], 10) + items.length
    }
  }

  return {
    subType: shell.subType,
    userId: shell.userId,
    displayName: shell.displayName,
    avatarUrl: shell.avatarUrl,
    navLinks: shell.navLinks,
    sortOptions: shell.sortOptions,
    currentPage: shell.currentPage,
    total,
    mode: shell.mode,
    items,
    pageLinks,
    prevPageUrl: shell.prevPageUrl,
    nextPageUrl: shell.nextPageUrl,
  }
}
