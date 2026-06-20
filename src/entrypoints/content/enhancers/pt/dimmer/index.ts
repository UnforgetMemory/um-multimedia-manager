
import { MTeamHandler } from './mteam'
import { NexusPHPHandler } from './nexusphp'
import { throttle, waitForElement } from '../utils'
import type { HandlerContext, ListPageHandler } from '../types'

export class PTDimmer {
  private debugTag = '[PT Dimmer Debug]'
  private observer: MutationObserver | null = null
  private waitForObserver: MutationObserver | null = null
  private storageChangeListener: ((changes: any, area: string) => void) | null = null
  private mteamAutoDetector: MutationObserver | null = null
  private mteamDocObserver: MutationObserver | null = null

  /** Static reference to current instance — ensures cleanup() can always find us */
  static currentInstance: PTDimmer | null = null

  // Cache for ID sets
  private idCache: { movieDoubanIds: Set<string>; musicDoubanIds: Set<string>; imdbIds: Set<string> } | null = null
  private cacheTimestamp = 0

  // Handler instances
  private mteamHandler: MTeamHandler
  private nexusphpHandler: NexusPHPHandler

  constructor() {
    this.mteamHandler = new MTeamHandler()
    this.nexusphpHandler = new NexusPHPHandler()

    // MTeam SPA: URL events may not fire for internal routing
    // Start DOM-based auto-detection as fallback
    if (location.href.includes('m-team.cc')) {
      this.startMteamAutoDetection()
    }
  }

  private debug(...args: any[]): void {
    console.log(this.debugTag, ...args)
  }

  cleanup(): void {
    this.mteamHandler.teardown()
    this.nexusphpHandler.teardown()
    if (this.observer) {
      this.observer.disconnect()
      this.observer = null
    }
    if (this.waitForObserver) {
      this.waitForObserver.disconnect()
      this.waitForObserver = null
    }
    if (this.storageChangeListener) {
      chrome.storage.onChanged.removeListener(this.storageChangeListener)
      this.storageChangeListener = null
    }
    if (this.mteamAutoDetector) {
      this.mteamAutoDetector.disconnect()
      this.mteamAutoDetector = null
    }
    if (this.mteamDocObserver) {
      this.mteamDocObserver.disconnect()
      this.mteamDocObserver = null
    }
    PTDimmer.currentInstance = null
  }

  private selectHandler(url: string): ListPageHandler | null {
    const handlers: ListPageHandler[] = [
      this.mteamHandler,
      this.nexusphpHandler,
    ]
    return handlers.find((h) => h.match(url)) || null
  }

  public async runFor(url: string): Promise<void> {
    this.debug('=== runFor called for URL:', url)
    this.cleanup()
    PTDimmer.currentInstance = this

    // Listen for record changes → invalidate ID cache
    this.storageChangeListener = (_changes, area) => {
      if (area === 'local') {
        this.debug('[Cache] Storage changed — invalidating ID cache')
        this.idCache = null
      }
    }
    chrome.storage.onChanged.addListener(this.storageChangeListener)

    const active = this.selectHandler(url)
    if (!active) {
      this.debug('No matching handler for URL')
      return
    }

    this.debug('Handler matched — selector:', active.getSelector(), '| contentCheck:', typeof active.contentCheck)
    this.debug('Waiting for element...')

    waitForElement(
      active.getSelector(),
      async () => {
        this.debug('Element found, starting process...')
        const ctx: HandlerContext = {
          debug: this.debug.bind(this),
          idCache: this.idCache,
          cacheTimestamp: this.cacheTimestamp,
        }
        try {
          await active.process(ctx)
        } catch (err) {
          console.warn('[PT Dimmer] Initial process failed:', err)
        }

        if (typeof active.setup === 'function') {
          const target =
            document.querySelector(active.getSelector().split(',')[0].trim()) ||
            document.body
          this.debug('Setting up reactive loop on target:', target.tagName, target.id || target.className || '')
          active.setup(target as HTMLElement, () => active.process(ctx))
          return
        }

        this.observer = new MutationObserver(
          throttle(() => {
            this.debug('Mutation observed, re-processing...')
            return active.process(ctx)
          }, 260)
        )
        this.observer.observe(document.body, {
          childList: true,
          subtree: true,
        })
      },
      15000,
      active.contentCheck,
      { current: this.waitForObserver },
    )
  }

  /** MTeam SPA fallback: auto-detect browse page via DOM when URL events don't fire */
  private startMteamAutoDetection(): void {
    const checkDom = () => {
      if (!this.mteamHandler.isActive() && this.mteamHandler.isMTeamDomPresent()) {
        this.debug('[M-Team] DOM auto-detect: browse rows found, initializing...')
        const ctx: HandlerContext = {
          debug: this.debug.bind(this),
          idCache: this.idCache,
          cacheTimestamp: this.cacheTimestamp,
        }
        void this.mteamHandler.process(ctx).then(() => {
          const target =
            (document.querySelector(this.mteamHandler.getSelector().split(',')[0].trim()) as HTMLElement | null) ||
            document.body
          this.mteamHandler.setup(target, () => this.mteamHandler.process(ctx))
        })
      }
    }

    // Immediate check for direct page loads
    checkDom()

    // Observe #root for SPA navigation (M-Team React root)
    const root = document.getElementById('root')
    if (root) {
      this.mteamAutoDetector = new MutationObserver(throttle(checkDom, 1000))
      this.mteamAutoDetector.observe(root, { childList: true, subtree: true })
      this.debug('[M-Team] DOM auto-detector attached to #root')
      return
    }

    // #root not ready yet — watch document for it to appear
    this.mteamDocObserver = new MutationObserver(() => {
      const delayedRoot = document.getElementById('root')
      if (delayedRoot) {
        this.mteamDocObserver!.disconnect()
        this.mteamDocObserver = null
        this.mteamAutoDetector = new MutationObserver(throttle(checkDom, 1000))
        this.mteamAutoDetector.observe(delayedRoot, { childList: true, subtree: true })
        this.debug('[M-Team] DOM auto-detector attached to #root (delayed)')
      }
    })
    this.mteamDocObserver.observe(document.documentElement, { childList: true, subtree: true })
  }
}
