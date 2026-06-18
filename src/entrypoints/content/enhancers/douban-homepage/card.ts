import type { StoreRecord } from '@/types'
import { Utils } from '@/utils'
import { extractSubjectId, esc } from './utils'

export function rebuildCard(item: Element, recordMap: Map<string, StoreRecord>): void {
  if ((item as HTMLElement).dataset.ummRebuilt) return
  ;(item as HTMLElement).dataset.ummRebuilt = 'true'

  const ds = (item as HTMLElement).dataset
  const title = ds.title || ''
  const rate = ds.rate || ''
  const starNum = ds.star || '00'
  const intro = ds.intro || ''

  const id = extractSubjectId(item)
  const record = id ? recordMap.get(id) : undefined
  const status = record?.status ?? 0
  const userRating = record?.rating ?? 0

  const posterLink = item.querySelector('.poster a')
  if (!posterLink) return
  const href = (posterLink as HTMLAnchorElement).href || posterLink.getAttribute('href') || '#'
  const imgEl = posterLink.querySelector('img')
  const imgSrc = imgEl?.getAttribute('src') || ''
  const imgAlt = imgEl?.getAttribute('alt') || title

  const starHtml = starNum !== '00' && rate
    ? `<span class="umm-card-star">${'★'.repeat(Math.round(Number(starNum) / 10))}</span><span>${esc(rate)}</span>`
    : `<span class="umm-card-no-rating">暂无评分</span>`

  const tooltip = intro ? ` title="${esc(intro)}"` : ''

  const badgeCls = status === 2 ? 'umm-badge--done' : 'umm-badge--none'
  const badgeText = status === 2 ? (userRating > 0 ? Utils.formatRating10(userRating) : '✓') : '○'

  const html = `
    <a href="${esc(href)}" class="umm-card"${tooltip}>
      <div class="umm-card-cover">
        <img src="${esc(imgSrc)}" alt="${esc(imgAlt)}" class="umm-card-img" loading="lazy">
      </div>
      <div class="umm-card-title">${esc(title)}</div>
      <div class="umm-card-rating">${starHtml}</div>
      <span class="umm-badge umm-badge--inline ${badgeCls}">${badgeText}</span>
    </a>`

  const itemEl = item as HTMLElement
  itemEl.className = 'umm-item-reset'

  const inner = item.querySelector('ul')
  if (!inner) return
  inner.className = 'umm-item-inner'
  inner.innerHTML = html
}
