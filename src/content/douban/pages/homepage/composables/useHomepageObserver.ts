import { onUnmounted } from 'vue'
import { Utils } from '@/utils'

/**
 * SPA navigation observer for Douban's dynamic content loading.
 *
 * Douban uses client-side rendering: sections like #screening, .recent-hot,
 * #billboard, and #reviews are injected via JS after initial page load.
 * This composable detects those mutations via MutationObserver on document.body
 * (childList + subtree) and a 1-second polling fallback (first 30s only).
 * The callback is throttled to 500ms to avoid excessive re-parsing.
 *
 * Fixes:
 * 1. Triggers the callback once on start() to catch content already in DOM
 *    (the observer only fires on mutations after start, not on existing content).
 * 2. Extends polling window from 30s to 60s (slow connections / Swiper lazy loads).
 * 3. Watches `class` attribute changes on containers (Swiper injects classes
 *    like swiper-slide-active without changing the childList).
 */
const CONTAINER_SELECTORS = '#screening, .recent-hot, #billboard, #reviews, .review'
const POLL_INTERVAL_MS = 1000
const POLL_DURATION_MS = 60000
const THROTTLE_MS = 500

export function useHomepageObserver(callback: () => void) {
  let observer: MutationObserver | null = null
  let checkInterval: ReturnType<typeof setInterval> | null = null
  let pollingTimeout: ReturnType<typeof setTimeout> | null = null

  const observedContainers = new Set<Element>()
  const throttledCallback = Utils.throttle(callback, THROTTLE_MS)

  function refreshObserverTargets(): void {
    const targets = document.querySelectorAll(CONTAINER_SELECTORS)
    targets.forEach(target => {
      if (!observedContainers.has(target)) {
        observedContainers.add(target)
        // Watch childList + subtree for injected content,
        // and class attribute for Swiper rendering state
        observer?.observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
      }
    })
  }

  function start(): void {
    if (observer) return

    observer = new MutationObserver(mutations => {
      let shouldTrigger = false

      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          for (const node of Array.from(mutation.addedNodes)) {
            if (node.nodeType !== Node.ELEMENT_NODE) continue
            const elNode = node as Element

            if (elNode.matches?.(CONTAINER_SELECTORS)) {
              shouldTrigger = true
            }
            if (elNode.querySelector?.(CONTAINER_SELECTORS)) {
              shouldTrigger = true
            }
          }
        }
        // Swiper often adds classes without childList changes
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          const target = mutation.target as Element
          if (target.closest?.(CONTAINER_SELECTORS)) {
            shouldTrigger = true
          }
        }
      }

      if (shouldTrigger) {
        refreshObserverTargets()
        throttledCallback()
      }
    })

    refreshObserverTargets()
    observer.observe(document.body, { childList: true, subtree: true })

    // Polling: catches containers injected before the observer started
    // and content that loads after the throttle window
    checkInterval = setInterval(() => {
      const targets = document.querySelectorAll(CONTAINER_SELECTORS)
      let foundNew = false
      targets.forEach(t => {
        if (!observedContainers.has(t)) foundNew = true
      })
      if (foundNew) {
        refreshObserverTargets()
        throttledCallback()
      }
    }, POLL_INTERVAL_MS)

    pollingTimeout = setTimeout(() => {
      if (checkInterval) {
        clearInterval(checkInterval)
        checkInterval = null
      }
    }, POLL_DURATION_MS)

    // Parse content already in the DOM (observer only fires on future mutations)
    throttledCallback()
  }

  function stop(): void {
    observer?.disconnect()
    observer = null

    if (checkInterval) {
      clearInterval(checkInterval)
      checkInterval = null
    }

    if (pollingTimeout) {
      clearTimeout(pollingTimeout)
      pollingTimeout = null
    }

    observedContainers.clear()
  }

  onUnmounted(stop)

  return { start, stop }
}
