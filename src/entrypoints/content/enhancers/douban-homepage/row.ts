import { esc, el } from './utils'

export function buildScrollRow(title: string, items: HTMLElement[]): HTMLElement {
  const row = el('div', { class: 'umm-section' })
  const hd = el('div', { class: 'umm-section-hd' }, `<h2>${esc(title)}</h2>`)
  row.appendChild(hd)

  const scrollWrap = el('div', { class: 'umm-scroll-wrap' })
  const scrollTrack = el('div', { class: 'umm-scroll-track' })
  items.forEach(i => scrollTrack.appendChild(i))

  const maskL = el('div', { class: 'umm-mask umm-mask--left' })
  const maskR = el('div', { class: 'umm-mask umm-mask--right' })

  scrollWrap.appendChild(scrollTrack)
  scrollWrap.appendChild(maskL)
  scrollWrap.appendChild(maskR)
  row.appendChild(scrollWrap)

  return row
}

export function createScrollRow(title: string, itemsHtml: string): HTMLElement {
  const row = el('div', { class: 'umm-section' })
  row.innerHTML = `
    <div class="umm-section-hd"><h2>${esc(title)}</h2></div>
    <div class="umm-scroll-wrap">
      <div class="umm-scroll-track">${itemsHtml}</div>
      <div class="umm-mask umm-mask--left"></div>
      <div class="umm-mask umm-mask--right"></div>
    </div>`
  return row
}
