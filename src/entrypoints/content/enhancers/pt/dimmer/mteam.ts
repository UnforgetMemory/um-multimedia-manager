/**
 * M-Team 专用列表页处理器
 */

import { getMTeamSets, applyCacheFallback } from './cache'
import type { HandlerContext, ListPageHandler } from '../types'
import { dimElement } from '../utils'

export class MTeamHandler implements ListPageHandler {
  readonly id = 'mteam'

  match(_url: string): boolean {
    return location.href.includes('m-team.cc/browse')
  }

  getSelector(): string {
    return '#root, #app-content, body'
  }

  contentCheck(el: Element): boolean {
    return el.childElementCount > 0 && el.querySelector('a[href]') !== null
  }

  private debug: (...args: any[]) => void = () => {}
  private observer: MutationObserver | null = null

  constructor() {}

  /**
   * 从 M-Team 行中提取 ID（带行级缓存）
   */
  extractMTeamIds(row: Element): {
    movieDoubanId: string | null
    musicDoubanId: string | null
    imdbId: string | null
  } {
    const el = row as HTMLElement
    const cached = el.dataset.ummIds
    if (cached) {
      try { return JSON.parse(cached) } catch { /* fall through */ }
    }

    const result = {
      movieDoubanId: null as string | null,
      musicDoubanId: null as string | null,
      imdbId: null as string | null,
    }
    let scannedLinks = 0

    for (const link of Array.from(row.querySelectorAll('a[href]'))) {
      scannedLinks++
      let href = link.getAttribute('href') || ''
      try {
        href = new URL(href, location.origin).href
      } catch {
        // ignore
      }

      // Extract Douban movie ID
      if (!result.movieDoubanId) {
        const match = href.match(/douban\.com\/subject\/(\d+)/)
        if (match) result.movieDoubanId = match[1]
      }

      // Extract Douban music ID
      if (!result.musicDoubanId) {
        const match = href.match(/music\.douban\.com\/subject\/(\d+)/)
        if (match) result.musicDoubanId = match[1]
      }

      // Extract IMDb ID
      if (!result.imdbId) {
        const match = href.match(/imdb\.com\/title\/((?:tt)?\d+)/)
        if (match) {
          const id = match[1]
          result.imdbId = id.startsWith('tt') ? id : `tt${id}`
        }
      }

        // Try extracting from search parameters
      if (!result.movieDoubanId || !result.musicDoubanId || !result.imdbId) {
        try {
          const parsed = new URL(href, location.origin)
          const doubanHref = parsed.searchParams.get('douban') || ''
          const imdbHref = parsed.searchParams.get('imdb') || ''

          if (!result.movieDoubanId) {
            const match = doubanHref.match(/douban\.com\/subject\/(\d+)/)
            if (match) result.movieDoubanId = match[1]
          }

          if (!result.musicDoubanId) {
            const match = doubanHref.match(/music\.douban\.com\/subject\/(\d+)/)
            if (match) result.musicDoubanId = match[1]
          }

          if (!result.imdbId && imdbHref) {
            const match = imdbHref.match(/\/title\/((?:tt)?\d+)/)
            if (match) {
              const id = match[1]
              result.imdbId = id.startsWith('tt') ? id : `tt${id}`
            }
          }
        } catch {
          // ignore
        }
      }

      // Early exit if any ID found (matches legacy script behavior)
      if (result.movieDoubanId || result.musicDoubanId || result.imdbId) {
        break
      }
    }

    try { el.dataset.ummIds = JSON.stringify(result) } catch { /* ignore quota errors */ }
    return result
  }

  /**
   * 获取 M-Team 种子行
   */
  getMTeamRows(root: Document | HTMLElement = document): Element[] {
    return Array.from(
      root.querySelectorAll("tr, [role='row'], .ant-table-row")
    ).filter((row) => {
      if (!(row instanceof HTMLElement)) return false
      if (row.querySelector('th')) return false
      if (row.querySelector('td.colhead')) return false
      return Boolean(
        row.querySelector('a[href*="/detail/"]') ||
          row.querySelector('a[href*="/mdb/title"]') ||
          row.querySelector('.torrent-list__thumbnail')
      )
    })
  }

  /**
   * 生成 M-Team 行签名（用于避免重复处理）
   */
  private getMTeamRowSignature(
    row: Element,
    ids: { movieDoubanId: string | null; musicDoubanId: string | null; imdbId: string | null },
  ): string {
    const detailLink = row.querySelector('a[href*="/detail/"]') as HTMLAnchorElement | null
    const detailHref = detailLink?.getAttribute('href') || detailLink?.href || ''

    const scoreLinks = Array.from(row.querySelectorAll('a[href*="/mdb/title"]'))
      .map((link) => {
        const anchor = link as HTMLAnchorElement
        return anchor.getAttribute('href') || anchor.href || ''
      })
      .join('|')

    return [
      detailHref,
      ids.movieDoubanId || '',
      ids.musicDoubanId || '',
      ids.imdbId || '',
      scoreLinks,
    ].join('::')
  }

  /**
   * 处理 M-Team 种子行
   */
  processMTeamRows(
    rows: Element[],
    movieDoubanIds: Set<string>,
    musicDoubanIds: Set<string>,
    imdbIds: Set<string>,
  ): void {
    let skipped = 0, dimmed = 0, notMatched = 0
    rows.forEach((row) => {
      const ids = this.extractMTeamIds(row)
      const signature = this.getMTeamRowSignature(row, ids)
      if (
        row.getAttribute('data-umm-mteam-signature') === signature &&
        row.getAttribute('data-umm-mteam-resolved') === 'true'
      ) {
        skipped++
        return
      }

      row.setAttribute('data-umm-mteam-signature', signature)

      const { movieDoubanId, musicDoubanId, imdbId } = ids

      const hasMovie = movieDoubanId && movieDoubanIds.has(movieDoubanId)
      const hasMusic = musicDoubanId && musicDoubanIds.has(musicDoubanId)
      const hasImdb = imdbId && imdbIds.has(imdbId)
      const matched = hasMovie || hasMusic || hasImdb

      if (matched) {
        this.debug('[M-Team] DIMMED ✓ row:', JSON.stringify({ movieDoubanId, musicDoubanId, imdbId }))
      }

      row.setAttribute('data-umm-mteam-resolved', 'true')
      row.setAttribute('data-umm-mteam-matched', matched ? 'true' : 'false')

      if (matched) {
        dimElement(row as HTMLElement)
        dimmed++
      } else {
        notMatched++
      }
    })
    this.debug('[M-Team] processMTeamRows done — total:', rows.length, '| dimmed:', dimmed, '| no match:', notMatched, '| dedup skipped:', skipped)
  }

  /**
   * 设置响应式监听循环（用于 M-Team）
   */
  private active = false
  private processing = false
  private processQueued = false

  private safeProcess(process: () => Promise<void>): void {
    if (this.processing) {
      this.processQueued = true
      return
    }
    this.processing = true
    void process()
      .catch((err) => {
        console.warn('[PT Dimmer] process error:', err)
      })
      .finally(() => {
        this.processing = false
        if (this.processQueued && this.active) {
          this.processQueued = false
          this.safeProcess(process)
        }
      })
  }

  setupMTeamWatcher(process: () => Promise<void>): void {
    this.debug('[M-Team] Setting up MTeam watcher (event-driven, no polling)')
    this.active = true

    const wrappedProcess = async () => {
      await process()
        // First process complete → locate row container, attach precise observer
      if (!this.observer) {
        this.attachMTeamObserver(process)
      }
    }

    // Execute immediately on first run
    this.safeProcess(wrappedProcess)
  }

  /**
   * 在 M-Team 的行容器上挂载精准 MutationObserver
   * 使用 childList:true（不递归），仅监控行增删
   */
  private attachMTeamObserver(process: () => Promise<void>): void {
    const rows = document.querySelectorAll('[role="row"]')
    if (rows.length === 0) {
      this.debug('[M-Team] No rows found for observer target — using fallback on #root')
      const root = document.getElementById('root')
      if (root) {
        this.observer = new MutationObserver(
          this.throttle(() => this.safeProcess(process), 180)
        )
        this.observer.observe(root, { childList: true, subtree: true })
      }
      return
    }

    const container = rows[0].parentElement
    if (!container) return

    this.debug('[M-Team] Observer target:', container.tagName,
      container.id ? '#' + container.id : '',
      container.className ? '.' + container.className.trim().split(/\s+/).join('.') : ''
    )

    this.observer = new MutationObserver(
      this.throttle(() => {
        this.debug('[M-Team] Row mutation detected')
        this.safeProcess(process)
      }, 180)
    )
    this.observer.observe(container, { childList: true })
  }

  /**
   * 清理 M-Team 专用监听器
   */
  teardown(): void {
    this.active = false
    this.processing = false
    this.processQueued = false
    if (this.observer) {
      this.observer.disconnect()
      this.observer = null
    }
  }

  /**
   * 节流函数（内部使用）
   */
  private throttle<T extends (...args: any[]) => any>(
    fn: T,
    delay: number,
  ): (...args: Parameters<T>) => void {
    let lastTime = 0
    return (...args: Parameters<T>) => {
      const now = Date.now()
      if (now - lastTime >= delay) {
        lastTime = now
        fn(...args)
      }
    }
  }

  /**
   * 处理页面
   */
  async process(context: HandlerContext): Promise<void> {
    const { debug, idCache, cacheTimestamp } = context
    this.debug = debug
    const sets = await getMTeamSets(debug, idCache, cacheTimestamp)
    const rows = this.getMTeamRows(document)
    this.debug('[M-Team] Found', rows.length, 'rows')
    this.processMTeamRows(rows, sets.movieDoubanIds, sets.musicDoubanIds, sets.imdbIds)

    // Cache fallback: for unresolved rows, check pt_id_cache by detail URL
    const unresolved = rows.filter(
      (r) => r.getAttribute('data-umm-mteam-resolved') !== 'true',
    )
    if (unresolved.length > 0) {
      this.debug('[M-Team] Cache fallback for', unresolved.length, 'unresolved rows')
      await applyCacheFallback(
        debug,
        unresolved,
        (row) => {
          const link = row.querySelector('a[href*="/detail/"]') as HTMLAnchorElement | null
          return link?.href ?? null
        },
        sets.movieDoubanIds,
        sets.musicDoubanIds,
        sets.imdbIds,
        dimElement,
      )
    }

    // NOTE: We do NOT stop the reactive loop here — focused observer on row container
    // is event-driven (no polling), fires only when Ant Design swaps rows.
  }

  /**
   * 设置 M-Team 专用监听器
   */
  setup(
    _target: HTMLElement,
    process: () => Promise<void>,
  ): void {
    this.setupMTeamWatcher(process)
  }
}
