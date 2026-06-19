/**
 * PT Dimmer 编排器
 * 管理多个 PT 站点列表页的"已看淡化"逻辑
 */

import { MTeamHandler } from './mteam'
import { NexusPHPHandler } from './nexusphp'
import { throttle, waitForElement } from '../utils'
import type { HandlerContext, ListPageHandler } from '../types'

export class PTDimmer {
  private debugTag = '[PT Dimmer Debug]'
  private observer: MutationObserver | null = null
  private waitForObserver: MutationObserver | null = null
  private storageChangeListener: ((changes: any, area: string) => void) | null = null

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
  }

  /**
   * Debug 日志
   */
  private debug(...args: any[]): void {
    console.log(this.debugTag, ...args)
  }

  /**
   * 清理所有监听器和定时器
   */
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
    PTDimmer.currentInstance = null
  }

  /**
   * 选择匹配当前 URL 的处理器（按优先级：MTeam > NexusPHP）
   */
  private selectHandler(url: string): ListPageHandler | null {
    const handlers: ListPageHandler[] = [
      this.mteamHandler,
      this.nexusphpHandler,
    ]
    return handlers.find((h) => h.match(url)) || null
  }

  /**
   * 主入口：根据 URL 运行对应的 Dimmer
   */
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
}
