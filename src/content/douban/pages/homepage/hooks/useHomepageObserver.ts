import { useEffect, useRef } from 'react'
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
 * React hook for SPA navigation observer on Douban pages with dynamic content.
 *
 * Accepts page-specific selectors for containers injected via JS.
 * Starts observing as soon as the component mounts.
 * Cleans up on unmount.
 */
export function useHomepageObserver(
  callback: () => void,
  options: PageObserverOptions,
) {
  const {
    containerSelectors,
    pollIntervalMs = 1000,
    pollDurationMs = 60000,
    throttleMs = 500,
  } = options

  const observerRef = useRef<MutationObserver | null>(null)
  const checkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const observedContainersRef = useRef(new Set<Element>())
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  const throttledCallbackRef = useRef(
    Utils.throttle(() => {
      callbackRef.current()
    }, throttleMs),
  )

  useEffect(() => {
    const observer = new MutationObserver(mutations => {
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
        throttledCallbackRef.current()
      }
    })

    function refreshObserverTargets(): void {
      const targets = document.querySelectorAll(containerSelectors)
      targets.forEach(target => {
        if (!observedContainersRef.current.has(target)) {
          observedContainersRef.current.add(target)
          observer.observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
        }
      })
    }

    refreshObserverTargets()
    observer.observe(document.body, { childList: true, subtree: true })

    const checkInterval = setInterval(() => {
      const targets = document.querySelectorAll(containerSelectors)
      let foundNew = false
      targets.forEach(t => { if (!observedContainersRef.current.has(t)) foundNew = true })
      if (foundNew) {
        refreshObserverTargets()
        throttledCallbackRef.current()
      }
    }, pollIntervalMs)

    const pollingTimeout = setTimeout(() => {
      if (checkIntervalRef.current) { clearInterval(checkIntervalRef.current); checkIntervalRef.current = null }
    }, pollDurationMs)

    observerRef.current = observer
    checkIntervalRef.current = checkInterval
    pollingTimeoutRef.current = pollingTimeout

    // Initial parse
    throttledCallbackRef.current()

    return () => {
      observer.disconnect()
      if (checkInterval) clearInterval(checkInterval)
      if (pollingTimeout) clearTimeout(pollingTimeout)
      observedContainersRef.current.clear()
      observerRef.current = null
      checkIntervalRef.current = null
      pollingTimeoutRef.current = null
    }
  }, [containerSelectors, pollIntervalMs, pollDurationMs, throttleMs])
}
