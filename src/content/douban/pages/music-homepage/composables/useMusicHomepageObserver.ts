import { onUnmounted } from 'vue'

/**
 * SPA navigation observer for Douban Music homepage.
 *
 * Music homepage uses React for the new-albums section and jQuery for
 * artist tabs — content is injected asynchronously after initial page load.
 * This composable detects those mutations via MutationObserver on document.body
 * and a 1-second polling fallback.
 *
 * Matches the pattern of useHomepageObserver but with music-specific selectors.
 */
const CONTAINER_SELECTORS = '.popular-artists, .new-albums, [data-react-component="NewAlbums"], .album-content'
const POLL_INTERVAL_MS = 1000
const POLL_DURATION_MS = 60000
const THROTTLE_MS = 500

export function useMusicHomepageObserver(callback: () => void) {
  let observer: MutationObserver | null = null
  let checkInterval: ReturnType<typeof setInterval> | null = null
  let pollingTimeout: ReturnType<typeof setTimeout> | null = null

  const observedContainers = new Set<Element>()

  let lastCall = 0
  const throttledCallback = () => {
    const now = Date.now()
    if (now - lastCall < THROTTLE_MS) return
    lastCall = now
    callback()
  }

  function refreshObserverTargets(): void {
    const targets = document.querySelectorAll(CONTAINER_SELECTORS)
    targets.forEach(target => {
      if (!observedContainers.has(target)) {
        observedContainers.add(target)
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
            if (elNode.matches?.(CONTAINER_SELECTORS)) { shouldTrigger = true; break }
            if (elNode.querySelector?.(CONTAINER_SELECTORS)) { shouldTrigger = true; break }
          }
        }
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          const target = mutation.target as Element
          if (target.closest?.(CONTAINER_SELECTORS)) { shouldTrigger = true }
        }
      }

      if (shouldTrigger) {
        refreshObserverTargets()
        throttledCallback()
      }
    })

    refreshObserverTargets()
    observer.observe(document.body, { childList: true, subtree: true })

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
