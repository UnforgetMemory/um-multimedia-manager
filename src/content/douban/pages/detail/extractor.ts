/**
 * Core DOM extraction helpers for Douban detail pages.
 *
 * Each function extracts a specific section of data from the live page DOM.
 * All HTML is DOMPurify-sanitised before returning.
 */
import DOMPurify from 'dompurify'
import { Identity } from '@/features/identity'
import type { UrlIdentity } from '@/types'
import type { RatingBar, MetaRow, AwardItem } from './types'

/**
 * Extract page identity, media type flags, and core metadata (title, year,
 * subtitle, original title) from the current Douban detail page.
 */
export function extractCoreMetadata(): {
  identity: UrlIdentity
  isMusic: boolean
  isBook: boolean
  title: string
  originalTitle: string
  year: string
  subtitle: string
} {
  const identity = Identity.fromUrl(location.href)!

  const isMusic = location.href.includes('music.douban.com')
  const isBook = location.href.includes('book.douban.com')

  const h1 = document.querySelector('#content h1, #wrapper > h1, h1.title') as HTMLElement | null
  const titleSpan = h1?.querySelector('[property="v:itemreviewed"]')
  const yearSpan = h1?.querySelector('.year')
  const title = titleSpan?.textContent?.trim() || h1?.textContent?.trim() || ''
  const year = yearSpan?.textContent?.trim()?.replace(/[()]/g, '') || ''

  const subtitleEl = document.querySelector('h2.subtitle')
  const subtitle = subtitleEl?.textContent?.trim() || ''

  let originalTitle = ''
  const infoEl = document.querySelector('#info')
  if (infoEl) {
    const infoParts = infoEl.innerHTML.split(/<br\s*\/?>/i)
    for (const part of infoParts) {
      const temp = document.createElement('div')
      temp.innerHTML = part.trim()
      const pl = temp.querySelector('.pl')
      if (pl?.textContent?.includes('原名') || pl?.textContent?.includes('原作名')) {
        pl.remove()
        const parent = pl.parentElement
        if (parent) {
          for (let i = parent.childNodes.length - 1; i >= 0; i--) {
            const node = parent.childNodes[i]
            if (node.nodeType === Node.TEXT_NODE && /^:\s*$/.test(node.textContent || '')) {
              node.remove()
            }
          }
        }
        originalTitle = temp.textContent?.trim() || ''
        break
      }
    }
  }

  return { identity, isMusic, isBook, title, originalTitle, year, subtitle }
}

/**
 * Extract poster, rating score, rating people count, and bigstar class.
 */
export function extractPosterRating(): {
  posterSrc: string
  posterAlt: string
  posterLink: string
  ratingNum: string
  ratingPeople: string
  bigstarNum: string
} {
  const posterImg = document.querySelector('#mainpic img') as HTMLImageElement | null
  const posterSrc = (posterImg?.src || '').replace(/s_ratio_poster/g, 'xl').replace(/\/([slm])(?:pic)?\//g, '/xl/')
  const posterAlt = posterImg?.alt || ''
  const posterLink = (document.querySelector('#mainpic a') as HTMLAnchorElement)?.href || ''

  const ratingNum = document.querySelector('.rating_num')?.textContent?.trim() || ''
  const ratingPeople = document.querySelector('.rating_people span')?.textContent?.trim() || ''
  const ratingStarEl = document.querySelector('.bigstar') as HTMLElement | null
  const bigstarNum = ratingStarEl?.className?.replace(/\D/g, '') || ''

  return { posterSrc, posterAlt, posterLink, ratingNum, ratingPeople, bigstarNum }
}

/**
 * Extract rating distribution bars (1–5 stars).
 */
export function extractRatingBars(isBook: boolean): RatingBar[] {
  const ratingBars: RatingBar[] = []
  document.querySelectorAll('.ratings-on-weight .item').forEach((item) => {
    const label = (item.querySelector('.starstop') as HTMLElement)?.textContent?.trim() || ''
    const pct = (item.querySelector('.rating_per') as HTMLElement)?.textContent?.trim() || ''
    if (label) ratingBars.push({ label, pct })
  })
  if (ratingBars.length === 0 && isBook) {
    const sectl = document.getElementById('interest_sectl')
    if (sectl) {
      const stars = sectl.querySelectorAll('.starstop')
      stars.forEach((star) => {
        const label = star.textContent?.trim() || ''
        const power = star.nextElementSibling as HTMLElement | null
        const pctEl = power?.nextElementSibling as HTMLElement | null
        const pct = pctEl?.textContent?.trim() || ''
        if (label) ratingBars.push({ label, pct })
      })
    }
  }
  return ratingBars
}

/**
 * Extract "better than" percentage labels.
 */
export function extractBetterThan(): string[] {
  const betterThan: string[] = []
  document.querySelectorAll('.rating_betterthan a').forEach((a) => {
    const text = a.textContent?.trim() || ''
    if (text) betterThan.push(text)
  })
  return betterThan
}

/**
 * Parse meta info rows from the #info section.
 * Each row is split by <br>; label comes from <span class="pl">.
 */
export function extractMetaRows(): MetaRow[] {
  const metaRows: MetaRow[] = []
  const infoEl = document.querySelector('#info')
  if (!infoEl) return metaRows

  const parts = infoEl.innerHTML.split(/<br\s*\/?>/i)
  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const temp = document.createElement('div')
    temp.innerHTML = trimmed
    const pl = temp.querySelector('.pl')
    let label = ''
    if (pl) {
      if (pl.firstChild?.nodeType === Node.TEXT_NODE) {
        label = (pl.firstChild.textContent || '').replace(':', '').trim()
      }
      if (!label) label = (pl.textContent?.replace(':', '').trim() || '')
      if (pl.firstChild?.nodeType === Node.TEXT_NODE) {
        pl.removeChild(pl.firstChild)
      }
    }
    if (pl) {
      const parent = pl.parentElement
      while (pl.firstChild) {
        parent?.insertBefore(pl.firstChild, pl.nextSibling)
      }
      pl.remove()
      if (parent) {
        for (let i = parent.childNodes.length - 1; i >= 0; i--) {
          const node = parent.childNodes[i]
          if (node.nodeType === Node.TEXT_NODE && /^:\s*$/.test(node.textContent || '')) {
            node.remove()
          }
        }
      }
    }
    const trimmedHtml = temp.innerHTML.trim()
      .replace(/<span([^>]*)style="[^"]*display\s*:\s*none[^"]*"([^>]*)>/gi, '<span$1$2>')
      .replace(/<a[^>]*class="[^"]*more-attrs[^"]*"[^>]*>.*?<\/a>\s*/gi, '')
    const html = DOMPurify.sanitize(trimmedHtml)
    metaRows.push({ label, html })
  }

  return metaRows
}

/**
 * Extract synopsis heading and HTML content.
 */
export function extractSynopsis(isMusic: boolean, isBook: boolean): {
  synopsisHeading: string
  synopsisHtml: string
} {
  const relatedInfo = document.querySelector(
    '#content > .grid-16-8.clearfix > .article > .related-info'
  ) || (isBook ? document.querySelector('.related_info') : null)
  const synopsisHeading = isMusic ? '简介' : isBook ? '内容简介' : '剧情简介'
  let synopsisHtml = ''
  if (isBook) {
    const intros = document.querySelectorAll('#link-report .intro')
    synopsisHtml = DOMPurify.sanitize(Array.from(intros).map(el => el.innerHTML).join('\n'))
  } else {
    const synopsisEl = relatedInfo?.querySelector('[property="v:summary"], [property="v:des"]')
      || relatedInfo?.querySelector('span.all.hidden, span:not(.all.hidden)')
    synopsisHtml = DOMPurify.sanitize(synopsisEl?.innerHTML || '')
  }
  return { synopsisHeading, synopsisHtml }
}

/**
 * Extract award items from the page.
 */
export function extractAwards(): AwardItem[] {
  const awardMod = document.querySelector(
    '#content > .grid-16-8.clearfix > .article > .mod'
  )
  const awardItems: AwardItem[] = []
  awardMod?.querySelectorAll('ul.award').forEach((ul) => {
    const lis = ul.querySelectorAll('li')
    if (lis.length >= 2) {
      const festival = lis[0]?.querySelector('a')?.textContent?.trim() || lis[0]?.textContent?.trim() || ''
      const category = lis[1]?.textContent?.trim() || ''
      const nomineeEl = lis[2]?.querySelector('a') as HTMLAnchorElement | null
      const nominee = nomineeEl?.textContent?.trim() || lis[2]?.textContent?.trim() || ''
      const nomineeLink = nomineeEl?.href || ''
      const isNomination = category.includes('提名')
      if (festival) awardItems.push({ festival, category, nominee, nomineeLink, isNomination })
    }
  })
  return awardItems
}

/**
 * Extract rank label information.
 */
export function extractRank(): {
  rankNo: string
  rankText: string
  rankHref: string
} {
  const rankLabel = document.querySelector('.rank-label')
  const rankNo = rankLabel?.querySelector('.rank-label-no')?.textContent?.trim() || ''
  const rankLink = rankLabel?.querySelector('.rank-label-link a') as HTMLAnchorElement | null
  const rankText = rankLink?.textContent?.trim() || ''
  const rankHref = rankLink?.href || ''
  return { rankNo, rankText, rankHref }
}
