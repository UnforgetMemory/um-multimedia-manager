import { onUnmounted } from 'vue'
import { Utils } from '@/utils'

export interface PageObserverOptions {
  /** CSS selectors for containers to watch for injected content */
  containerSelectors: string
  /** Polling interval in ms (default: 1000) */
  pollIntervalMs?: number
  /** Max polling duration in ms (default: 60000) */
  pollDurationMs?: number
  /** Throttle window in ms (default: 500) */
  throttleMs?: number
}

/**
 * SPA navigation observer for Douban pages with dynamic content loading.
 * Accepts page-specific selectors for containers that are injected via JS.
 */
export function usePageObserver(callback: () => void, options: PageObserverOptions) {
  const {
    containerSelectors,
    pollIntervalMs = 1000,
    pollDurationMs = 60000,
    throttleMs = 500,
  } = options

  let observer: MutationObserver | null = null
  let checkInterval: ReturnType<typeof setInterval> | null = null
  let pollingTimeout: ReturnType<typeof setTimeout> | null = null
  const observedContainers = new Set<Element>()
  const throttledCallback = Utils.throttle(callback, throttleMs)

  function refreshObserverTargets(): void {
    const targets = document.querySelectorAll(containerSelectors)
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
            if (elNode.matches?.(containerSelectors)) { shouldTrigger = true; break }
            if (elNode.querySelector?.(containerSelectors)) { shouldTrigger = true; break }
          }
        }
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          const target = mutation.target as Element
          if (target.closest?.(containerSelectors)) { shouldTrigger = true }
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
      const targets = document.querySelectorAll(containerSelectors)
      let foundNew = false
      targets.forEach(t => { if (!observedContainers.has(t)) foundNew = true })
      if (foundNew) {
        refreshObserverTargets()
        throttledCallback()
      }
    }, pollIntervalMs)

    pollingTimeout = setTimeout(() => {
      if (checkInterval) { clearInterval(checkInterval); checkInterval = null }
    }, pollDurationMs)

    throttledCallback()
  }

  function stop(): void {
    observer?.disconnect(); observer = null
    if (checkInterval) { clearInterval(checkInterval); checkInterval = null }
    if (pollingTimeout) { clearTimeout(pollingTimeout); pollingTimeout = null }
    observedContainers.clear()
  }

  onUnmounted(stop)
  return { start, stop }
}

// Legacy alias — re-export for backward compatibility during migration
export { usePageObserver as useHomepageObserver }
