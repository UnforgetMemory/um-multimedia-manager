import { Utils } from '@/utils'
import { waitForElement } from '../../utils/dom'
import { loadRecordCache, clearRecordCache } from './cache'
import { el } from './utils'
import { injectGlobalStyles } from './styles'
import { rebuildCard } from './card'
import { createScrollRow } from './row'
import {
  migrateBillboardToRow,
  buildHotMovieRow,
  buildHotTvRow,
  enhanceReviews,
} from './sections'

async function enhanceAll(): Promise<void> {
  const existingPanel = document.getElementById('umm-top-panel')
  if (existingPanel && existingPanel.children.length > 0) {
    enhanceReviews(await loadRecordCache())
    return
  }

  const recordMap = await loadRecordCache()
  injectGlobalStyles()

  if (existingPanel) existingPanel.remove()

  const panel = el('div', { id: 'umm-top-panel', class: 'umm-top-panel' })

  const screeningPairs: [number, string][] = []
  let currentGroupIndex = 0
  const seenSubjectIds = new Set<string>()
  document.querySelectorAll('#screening .ui-slide-item').forEach(item => {
    if ((item as HTMLElement).classList.contains('ui-slide-item-duplicate')) return
    const dstat = (item as HTMLElement).dataset.dstatAreaid || ''
    if (dstat) {
      const parts = dstat.split('_')
      currentGroupIndex = parseInt(parts[parts.length - 1] || '0', 10)
    }
    const trailer = (item as HTMLElement).dataset.trailer || ''
    const subjectMatch = trailer.match(/\/subject\/(\d+)\//)
    const subjectId = subjectMatch ? subjectMatch[1] : ''
    if (subjectId && seenSubjectIds.has(subjectId)) return
    if (subjectId) seenSubjectIds.add(subjectId)
    rebuildCard(item, recordMap)
    const inner = item.querySelector('ul')
    if (inner) screeningPairs.push([currentGroupIndex, `<div class="umm-hot-card">${inner.outerHTML}</div>`])
  })
  screeningPairs.sort((a, b) => a[0] - b[0])
  const screeningItems = screeningPairs.map(p => p[1])
  if (screeningItems.length > 0) {
    panel.appendChild(createScrollRow('正在热映', screeningItems.join('')))
  }

  const billboardRow = migrateBillboardToRow(recordMap)
  if (billboardRow) panel.appendChild(billboardRow)

  const hotMovieRow = buildHotMovieRow(recordMap)
  if (hotMovieRow) panel.appendChild(hotMovieRow)

  const hotTvRow = buildHotTvRow(recordMap)
  if (hotTvRow) panel.appendChild(hotTvRow)

  document.body.prepend(panel)

  document.querySelector('#screening')?.setAttribute('style', 'display:none !important')
  document.querySelector('#billboard')?.setAttribute('style', 'display:none !important')
  document.querySelector('#recent-hot')?.setAttribute('style', 'display:none !important')

  enhanceReviews(recordMap)
}

export async function startHomepageEnhancer(): Promise<(() => void) | null> {
  try {
    await waitForElement('#screening', 5000).catch(() => null)
    await enhanceAll()

    const throttled = Utils.throttle(() => enhanceAll(), 500)

    const observedContainers = new Set<Element>()
    const observer = new MutationObserver(mutations => {
      let shouldReEnhance = false

      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          for (const node of Array.from(mutation.addedNodes)) {
            if (node.nodeType !== Node.ELEMENT_NODE) continue
            const elNode = node as Element

            if (elNode.matches?.('#screening, .recent-hot, #billboard, #reviews, .review')) {
              shouldReEnhance = true
            }
            if (elNode.querySelector?.('#screening, .recent-hot, #billboard, #reviews, .review')) {
              shouldReEnhance = true
            }
          }
        }
      }

      if (shouldReEnhance) {
        refreshObserverTargets()
        throttled()
      }
    })

    function refreshObserverTargets() {
      const targets = document.querySelectorAll('#screening, .recent-hot, #billboard, #reviews, .review')
      targets.forEach(target => {
        if (!observedContainers.has(target)) {
          observedContainers.add(target)
          observer.observe(target, { childList: true, subtree: true })
        }
      })
    }

    refreshObserverTargets()

    observer.observe(document.body, { childList: true, subtree: true })

    const checkInterval = setInterval(() => {
      const targets = document.querySelectorAll('#screening, .recent-hot, #billboard, #reviews, .review')
      let foundNew = false
      targets.forEach(t => {
        if (!observedContainers.has(t)) foundNew = true
      })
      if (foundNew) {
        refreshObserverTargets()
        throttled()
      }
    }, 1000)

    setTimeout(() => clearInterval(checkInterval), 30000)

    return () => {
      observer.disconnect()
      clearInterval(checkInterval)
      document.getElementById('umm-homepage-styles')?.remove()
      document.getElementById('umm-top-panel')?.remove()
      document.querySelectorAll('[data-umm-rebuilt]').forEach(el => {
        delete (el as HTMLElement).dataset.ummRebuilt
      })
      clearRecordCache()
    }
  } catch (error) {
    console.error('[UMM] Failed to start homepage enhancer:', error)
    return null
  }
}
