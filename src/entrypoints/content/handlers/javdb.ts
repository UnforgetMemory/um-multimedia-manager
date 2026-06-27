/**
 * JavDB dimmer — dims watched items on JavDB list/search/favorite pages.
 *
 * Batches all visible AV IDs into a single check request to avoid
 * per-item message timeout.  Supports multiple page layouts and
 * various Jav ID formats (FC2-PPV, standard codes, etc.).
 */

import { AdultAvStore } from '@/features/adult-av'
import { initI18n } from '../i18n'
import { normalizeAvId, extractBaseId } from '@/features/adult-av/models'

let observer: MutationObserver | null = null

const AVID_REGEX = /[A-Za-z0-9]{2,}[-][\w-]{2,}/i

const ITEM_SELECTORS = [
  '.item',
  '.grid-item',
  '.video-card',
  '.column-item',
]

const ID_SELECTORS = [
  '.video-title strong',
  '.video-title a',
  '.title a',
  '.id-text',
  '[class*="id"]',
]

/**
 * Extract and normalize AV ID from a JavDB item element.
 * Tries multiple selectors and returns the first valid match.
 * FC2-PPV IDs preserve their full format; other IDs have version
 * suffixes (-C, -U, -UC) stripped and leading zeros removed.
 */
function extractAvId(item: Element): string | null {
  for (const sel of ID_SELECTORS) {
    const el = item.querySelector(sel)
    if (!el) continue
    const text = el.textContent?.trim()
    if (!text) continue
    const match = text.match(AVID_REGEX)
    if (match) {
      const normalized = normalizeAvId(match[0])
      if (normalized.startsWith('FC2-PPV-')) return normalized
      return extractBaseId(normalized).replace(/^0+/, '')
    }
  }
  return null
}

function run(): void {
  const items: { el: Element; avid: string }[] = []

  for (const sel of ITEM_SELECTORS) {
    const found = document.querySelectorAll(sel)
    found.forEach(el => {
      if (el.getAttribute('data-umm-processed')) return
      const avid = extractAvId(el)
      if (!avid) return
      el.setAttribute('data-umm-processed', 'true')
      el.setAttribute('data-umm-avid', avid)
      items.push({ el, avid })
    })
  }

  if (items.length === 0) return

  // Batch query: send all IDs in one message
  const avids = items.map(i => i.avid)
  AdultAvStore.batchCheckExists(avids).then((watched: Set<string>) => {
    for (const { el, avid } of items) {
      if (watched.has(avid)) {
        (el as HTMLElement).classList.add('umm-viewed')
      }
    }
  })

  // Click handler per item (fire-and-forget, doesn't block)
  for (const { el, avid } of items) {
    el.addEventListener('click', () => {
      AdultAvStore.add('javdb', avid, 0)
      ;(el as HTMLElement).classList.add('umm-viewed')
    }, { once: true })
  }
}

function injectStyles(): void {
  if (document.getElementById('umm-javdb-styles')) return
  const style = document.createElement('style')
  style.id = 'umm-javdb-styles'
  style.textContent = `
    body.javdb-enhanced .item.umm-viewed,
    body.javdb-enhanced .grid-item.umm-viewed,
    body.javdb-enhanced .video-card.umm-viewed,
    body.javdb-enhanced .column-item.umm-viewed {
      opacity: 0.3 !important; transition: opacity .3s ease-in-out; filter: grayscale(80%);
    }
    body.javdb-enhanced .item.umm-viewed:hover,
    body.javdb-enhanced .grid-item.umm-viewed:hover,
    body.javdb-enhanced .video-card.umm-viewed:hover,
    body.javdb-enhanced .column-item.umm-viewed:hover {
      opacity: 1 !important; filter: grayscale(0%);
    }`
  document.head.appendChild(style)
}

export async function handleJavDBPage(): Promise<void> {
  await initI18n()
  console.log('[UMM] JavDB enhancer activated')

  injectStyles()
  document.body.classList.add('javdb-enhanced')

  run()

  observer = new MutationObserver(() => run())
  const container = document.querySelector('.movie-list, .grid, .video-grid, #main-container, #content') || document.body
  observer.observe(container, { childList: true, subtree: true })
}
