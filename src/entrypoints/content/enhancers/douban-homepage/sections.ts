import type { StoreRecord } from '@/types'
import { Utils } from '@/utils'
import { extractSubjectId, esc, el } from './utils'
import { makeBadge } from './styles'
import { buildScrollRow } from './row'

export function migrateBillboardToRow(recordMap: Map<string, StoreRecord>): HTMLElement | null {
  const billboard = document.querySelector('#billboard')
  if (!billboard) return null

  const rows: HTMLElement[] = []
  billboard.querySelectorAll('table tr').forEach(row => {
    if ((row as HTMLElement).dataset.ummRebuilt) return
    ;(row as HTMLElement).dataset.ummRebuilt = 'true'

    const id = extractSubjectId(row)
    const record = id ? recordMap.get(id) : undefined

    const orderTd = row.querySelector('td.order')
    const titleTd = row.querySelector('td.title')
    if (!orderTd || !titleTd) return

    const order = orderTd.textContent?.trim() || ''
    const movieTitle = titleTd.querySelector('a')?.textContent?.trim() || ''
    const href = (titleTd.querySelector('a') as HTMLAnchorElement)?.href || '#'

    const cardHtml = `
      <a href="${esc(href)}" class="umm-billboard-card">
        <span class="umm-billboard-order">${esc(order)}</span>
        <span class="umm-billboard-title">${esc(movieTitle)}</span>
        ${record ? makeBadge(record.status, record.rating, true) : ''}
      </a>`
    rows.push(el('div', { class: 'umm-hot-card' }, cardHtml))
  })

  return rows.length > 0 ? buildScrollRow('一周口碑榜', rows) : null
}

export function buildHotMovieRow(recordMap: Map<string, StoreRecord>): HTMLElement | null {
  const cards = document.querySelectorAll('.recent-hot-movie .swiper-slide:not(.swiper-slide-duplicate) .subject-card')
  if (cards.length === 0) return null

  const items: HTMLElement[] = []
  cards.forEach(card => {
    if ((card as HTMLElement).dataset.ummRebuilt) return
    ;(card as HTMLElement).dataset.ummRebuilt = 'true'

    const id = extractSubjectId(card)
    const record = id ? recordMap.get(id) : undefined
    const status = record?.status ?? 0
    const userRating = record?.rating ?? 0

    const coverImg = card.querySelector('.subject-card-item-cover img')
    const titleSpan = card.querySelector('.subject-card-item-title-text')
    const ratingSpan = card.querySelector('.subject-card-item-rating-score')
    const link = card.querySelector('a')

    const imgSrc = coverImg?.getAttribute('src') || ''
    const movieTitle = titleSpan?.textContent?.trim() || ''
    const rate = ratingSpan?.textContent?.trim() || ''
    const href = (link as HTMLAnchorElement)?.href || '#'

    const starHtml = rate && rate !== '暂无评分'
      ? `<span class="umm-card-star">${'★'.repeat(Math.round(parseFloat(rate) / 2))}</span><span>${esc(rate)}</span>`
      : `<span class="umm-card-no-rating">暂无评分</span>`

    const badgeCls = status === 2 ? 'umm-badge--done' : 'umm-badge--none'
    const badgeText = status === 2 ? (userRating > 0 ? Utils.formatRating10(userRating) : '✓') : '○'

    const cardHtml = `
      <a href="${esc(href)}" class="umm-card">
        <div class="umm-card-cover">
          <img src="${esc(imgSrc)}" class="umm-card-img" loading="lazy">
        </div>
        <div class="umm-card-title">${esc(movieTitle)}</div>
        <div class="umm-card-rating">${starHtml}</div>
        <span class="umm-badge umm-badge--inline ${badgeCls}">${badgeText}</span>
      </a>`
    items.push(el('div', { class: 'umm-hot-card' }, cardHtml))
  })

  return items.length > 0 ? buildScrollRow('最近热门电影', items) : null
}

export function buildHotTvRow(recordMap: Map<string, StoreRecord>): HTMLElement | null {
  const cards = document.querySelectorAll('.recent-hot-tv .swiper-slide:not(.swiper-slide-duplicate) .subject-card')
  if (cards.length === 0) return null

  const items: HTMLElement[] = []
  cards.forEach(card => {
    if ((card as HTMLElement).dataset.ummRebuilt) return
    ;(card as HTMLElement).dataset.ummRebuilt = 'true'

    const id = extractSubjectId(card)
    const record = id ? recordMap.get(id) : undefined
    const status = record?.status ?? 0
    const userRating = record?.rating ?? 0

    const coverImg = card.querySelector('.subject-card-item-cover img')
    const titleSpan = card.querySelector('.subject-card-item-title-text')
    const ratingSpan = card.querySelector('.subject-card-item-rating-score')
    const link = card.querySelector('a')
    const episodesInfo = card.querySelector('.subject-card-item-episodes-info')

    const imgSrc = coverImg?.getAttribute('src') || ''
    const tvTitle = titleSpan?.textContent?.trim() || ''
    const rate = ratingSpan?.textContent?.trim() || ''
    const href = (link as HTMLAnchorElement)?.href || '#'
    const episodes = episodesInfo?.textContent?.trim() || ''

    const starHtml = rate && rate !== '暂无评分'
      ? `<span class="umm-card-star">${'★'.repeat(Math.round(parseFloat(rate) / 2))}</span><span>${esc(rate)}</span>`
      : `<span class="umm-card-no-rating">暂无评分</span>`

    const badgeCls = status === 2 ? 'umm-badge--done' : 'umm-badge--none'
    const badgeText = status === 2 ? (userRating > 0 ? Utils.formatRating10(userRating) : '✓') : '○'

    const episodesBadge = episodes
      ? `<div class="umm-episodes">${esc(episodes)}</div>`
      : ''

    const cardHtml = `
      <a href="${esc(href)}" class="umm-card">
        <div class="umm-card-cover">
          <img src="${esc(imgSrc)}" class="umm-card-img" loading="lazy">
          ${episodesBadge}
        </div>
        <div class="umm-card-title">${esc(tvTitle)}</div>
        <div class="umm-card-rating">${starHtml}</div>
        <span class="umm-badge umm-badge--inline ${badgeCls}">${badgeText}</span>
      </a>`
    items.push(el('div', { class: 'umm-hot-card' }, cardHtml))
  })

  return items.length > 0 ? buildScrollRow('最近热门电视剧', items) : null
}

export function enhanceReviews(recordMap: Map<string, StoreRecord>): void {
  document.querySelectorAll('#reviews .review').forEach(review => {
    if ((review as HTMLElement).dataset.ummRebuilt) return
    ;(review as HTMLElement).dataset.ummRebuilt = 'true'

    const movieLink = review.querySelector('.review-hd a')
    if (!movieLink) return
    const href = (movieLink as HTMLAnchorElement).href || movieLink.getAttribute('href')
    if (!href) return
    const match = href.match(/\/subject\/(\d+)/)
    if (!match) return

    const record = recordMap.get(match[1])
    const status = record?.status ?? 0
    const userRating = record?.rating ?? 0

    const meta = review.querySelector('.review-meta')
    if (!meta) return

    const isDone = status === 2
    const label = isDone ? '✅' : '⏳'
    const ratingText = userRating > 0 ? ` ${Utils.formatRating10(userRating)}/10` : ''
    const statusAttr = isDone ? 'done' : 'none'

    const badge = document.createElement('span')
    badge.className = 'umm-search-badge'
    badge.dataset.status = statusAttr
    badge.innerHTML = `${label}${ratingText}`
    meta.insertAdjacentElement('afterend', badge)
  })
}
