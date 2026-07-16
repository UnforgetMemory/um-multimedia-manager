/**
 * NexusPHP 站点通用处理器（配置驱动，支持后台扫描）
 */

import { Store } from '@/features/database'
import { getScanner, type ScanTask } from '../scanner'
import { getListPageConfig } from '../config'
import { getMovieSets } from './cache'
import type { HandlerContext, ListPageHandler } from '../types'
import { dimElement } from '../utils'

export class NexusPHPHandler implements ListPageHandler {
  readonly id = 'nexusphp'

  constructor() {}

  match(url: string): boolean {
    return getListPageConfig(url) !== null
  }

  getSelector(): string {
    const config = getListPageConfig(location.href)
    return config?.rowSelector ?? 'table.torrents > tbody > tr'
  }

  /**
   * 处理页面
   */
  async process(context: HandlerContext): Promise<void> {
    const { debug } = context
    const config = getListPageConfig(location.href)
    if (!config) return

    // Lazily load or use cached ID sets
    if (!context.idCache || (Date.now() - context.cacheTimestamp) > 30_000) {
      const { doubanIds, imdbIds } = await getMovieSets(debug, context.idCache, context.cacheTimestamp)
      context.idCache = { movieDoubanIds: doubanIds, musicDoubanIds: new Set<string>(), imdbIds }
      context.cacheTimestamp = Date.now()
    }

    const { movieDoubanIds: doubanIds, imdbIds } = context.idCache
    debug(`[${config.domain}] ID sets — douban:`, doubanIds.size, 'imdb:', imdbIds.size)

    const rows = document.querySelectorAll(config.rowSelector)
    if (rows.length === 0) {
      debug(`[${config.domain}] No rows found`)
      return
    }

    debug(`[${config.domain}] Found`, rows.length, 'rows')
    let dimmed = 0, notMatched = 0, needScan = 0

    // Collect URLs for scanning
    const scanTasks: ScanTask[] = []

    for (const row of Array.from(rows)) {
      if (config.skipRowSelector && row.querySelector(config.skipRowSelector)) {
        notMatched++
        continue
      }

      let hasDirectLink = false

      if (config.extractIdsFromRow) {
        const ids = config.extractIdsFromRow(row)
        const matched = (ids.doubanId && doubanIds.has(ids.doubanId)) || (ids.imdbId && imdbIds.has(ids.imdbId))
        if (matched) {
          dimElement(row as HTMLElement)
          dimmed++
          hasDirectLink = true
        }
      }

      if (hasDirectLink) continue

      // Skip IndexedDB lookup when background scanning is disabled
      if (!config.enableBackgroundScan) {
        notMatched++
        continue
      }

      // Check cache
      const detailUrl = config.extractDetailUrl(row)
      if (!detailUrl) {
        notMatched++
        continue
      }

      // Normalize URL
      let normalizedUrl: string
      try {
        const u = new URL(detailUrl, location.origin)
        normalizedUrl = `${u.origin}${u.pathname}${u.search}`
      } catch {
        normalizedUrl = detailUrl
      }

      const cached = await Store.ptIdCacheGet(normalizedUrl)
      if (cached) {
        const cachedDouban = cached.doubanId?.replace('movie::', '')
        const cachedImdb = cached.imdbId?.replace('movie::', '')
        const matched =
          (cachedDouban && doubanIds.has(cachedDouban)) ||
          (cachedImdb && imdbIds.has(cachedImdb))

        if (matched) {
          dimElement(row as HTMLElement)
          dimmed++
        } else {
          notMatched++
        }
        row.setAttribute('data-umm-resolved', 'true')
        continue
      }

      // Enqueue for background scan
      scanTasks.push({
        url: normalizedUrl,
        config,
        priority: 1,
      })
      needScan++
    }

    debug(`[${config.domain}] Done — rows:`, rows.length, '| dimmed:', dimmed, '| no match:', notMatched, '| need scan:', needScan)

    if (scanTasks.length > 0) {
      debug(`[${config.domain}] Starting background scan for`, scanTasks.length, 'urls')

      const scanner = getScanner(config.scanConcurrency, config.scanDelayRange)

      scanner.scanBatch(scanTasks, (result) => {
        if (!result.success || !result.entry.doubanId && !result.entry.imdbId) return

        const cachedDouban = result.entry.doubanId?.replace('movie::', '')
        const cachedImdb = result.entry.imdbId?.replace('movie::', '')
        const { movieDoubanIds: mIds, imdbIds: iIds } = context.idCache ?? { movieDoubanIds: new Set<string>(), imdbIds: new Set<string>() }
        const matched =
          (cachedDouban && mIds.has(cachedDouban)) ||
          (cachedImdb && iIds.has(cachedImdb))
        if (!matched) return

        const rows = document.querySelectorAll(config.rowSelector)
        for (const row of Array.from(rows)) {
          if ((row as HTMLElement).classList.contains('umm-dimmed')) continue
          if (row.getAttribute('data-umm-resolved') === 'true') continue

          const detailUrl = config.extractDetailUrl(row)
          if (!detailUrl) continue

          let normalizedUrl: string
          try {
            const u = new URL(detailUrl, location.origin)
            normalizedUrl = `${u.origin}${u.pathname}${u.search}`
          } catch {
            normalizedUrl = detailUrl
          }

          if (normalizedUrl === result.url) {
            dimElement(row as HTMLElement)
            row.setAttribute('data-umm-resolved', 'true')
            break
          }
        }
      }).then(async (results) => {
        const successCount = results.filter((r) => r.success).length
        debug(`[${config.domain}] Background scan complete — success:`, successCount, '| failed:', results.length - successCount)
      }).catch((err) => {
        console.warn(`[${config.domain}] Background scan error:`, err)
      })
    }
  }

  /**
   * NexusPHP 使用通用 MutationObserver，无需自定义 setup
   */
  setup(): void {
    // No custom setup — uses generic MutationObserver
  }

  teardown(): void {}
}
