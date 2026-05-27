/**
 * PT 站点 Dimmer 增强器
 * 
 * 功能：在 PT 站点种子列表中暗化已看/已听的条目
 * 支持站点：
 * - M-Team (next.m-team.cc, kp.m-team.cc)
 * - Audiences (audiences.me)
 * - HDHome (hdhome.org)
 * - HDArea (hdarea.club)
 * - OurBits (ourbits.club)
 * - PTerClub (pterclub.net)
 */

import { Store } from '@/features/database'

/** Cached ID sets with TTL */
interface CachedIdSets {
  movieDoubanIds: Set<string>
  musicDoubanIds: Set<string>
  imdbIds: Set<string>
}

export class PTDimmer {
  private debugTag = '[PT Dimmer Debug]'
  private observer: MutationObserver | null = null
  private pollTimer: number | null = null
  private scrollHandler: (() => void) | null = null
  private scrollTarget: HTMLElement | null = null
  private storageChangeListener: ((changes: any, area: string) => void) | null = null

  // Cache for ID sets
  private idCache: CachedIdSets | null = null
  private cacheTimestamp = 0
  private static readonly CACHE_TTL = 30_000 // 30 seconds

  /**
   * Debug 日志
   */
  private debug(...args: any[]): void {
    console.log(this.debugTag, ...args)
  }

  /**
   * 清理所有监听器和定时器
   */
  private cleanup(): void {
    if (this.observer) {
      this.observer.disconnect()
      this.observer = null
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
    if (this.scrollHandler && this.scrollTarget) {
      this.scrollTarget.removeEventListener('scroll', this.scrollHandler, true)
      window.removeEventListener('resize', this.scrollHandler)
      this.scrollHandler = null
      this.scrollTarget = null
    }
    if (this.storageChangeListener) {
      chrome.storage.onChanged.removeListener(this.storageChangeListener)
      this.storageChangeListener = null
    }
  }

  /**
   * 获取缓存的 ID 集合（带 TTL）
   * 使用 dbGetWatchedIds 批量查询，单次消息获取所有 store 的 watched IDs
   */
  private async getCachedIdSets(): Promise<CachedIdSets> {
    const now = Date.now()
    if (this.idCache && (now - this.cacheTimestamp) < PTDimmer.CACHE_TTL) {
      this.debug('[Cache] Using cached ID sets (age:', (now - this.cacheTimestamp) / 1000, 's)')
      return this.idCache
    }

    this.debug('[DB] Fetching watched IDs from douban_records + imdb_records...')
    const raw = await Store.dbGetWatchedIds(['douban_records', 'imdb_records'])

    const movieDoubanIds = new Set<string>()
    const musicDoubanIds = new Set<string>()
    const imdbIds = new Set<string>()

    const doubanKeys = raw['douban_records'] || []
    const imdbKeys = raw['imdb_records'] || []
    this.debug('[DB] Raw douban_records keys:', doubanKeys.length, '| imdb_records keys:', imdbKeys.length)
    // Show raw key samples to diagnose key format mismatches
    if (doubanKeys.length > 0) this.debug('[DB] Sample douban raw keys:', doubanKeys.slice(0, 5))
    if (imdbKeys.length > 0) this.debug('[DB] Sample imdb raw keys:', imdbKeys.slice(0, 5))
    if (doubanKeys.length === 0) this.debug('[DB] ⚠️ douban_records returned ZERO watched keys - status may be missing/non-numeric')
    if (imdbKeys.length === 0) this.debug('[DB] ⚠️ imdb_records returned ZERO watched keys - status may be missing/non-numeric')

    for (const key of doubanKeys) {
      if (key.startsWith('movie::')) movieDoubanIds.add(key.slice(7))
      else if (key.startsWith('music::')) musicDoubanIds.add(key.slice(7))
    }
    for (const key of imdbKeys) {
      if (key.startsWith('movie::')) imdbIds.add(key.slice(7))
    }

    this.debug('[DB] Parsed IDs — movieDouban:', movieDoubanIds.size, 'musicDouban:', musicDoubanIds.size, 'imdb:', imdbIds.size)
    if (movieDoubanIds.size > 0) this.debug('[DB] Sample movieDouban IDs:', [...movieDoubanIds].slice(0, 5))
    else if (doubanKeys.length > 0) this.debug('[DB] ⚠️ douban keys found but none matched movie:: or music:: prefix — key format mismatch!')
    if (musicDoubanIds.size > 0) this.debug('[DB] Sample musicDouban IDs:', [...musicDoubanIds].slice(0, 5))
    if (imdbIds.size > 0) this.debug('[DB] Sample IMDb IDs:', [...imdbIds].slice(0, 5))
    else if (imdbKeys.length > 0) this.debug('[DB] ⚠️ imdb keys found but none matched movie:: prefix — key format mismatch!')

    this.idCache = { movieDoubanIds, musicDoubanIds, imdbIds }
    this.cacheTimestamp = now
    return this.idCache
  }

  /**
   * 节流函数
   */
  private throttle<T extends (...args: any[]) => any>(
    fn: T,
    delay: number
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
   * 暗化元素
   */
  private dimElement(element: HTMLElement): void {
    element.classList.add('umm-dimmed')
  }

  /**
   * 获取电影类已看 ID 集合（Douban + IMDb）
   */
  private async getMovieSets(): Promise<{ doubanIds: Set<string>; imdbIds: Set<string> }> {
    const { movieDoubanIds, imdbIds } = await this.getCachedIdSets()
    return { doubanIds: movieDoubanIds, imdbIds }
  }

  /**
   * 获取 M-Team 专用 ID 集合（包含音乐）
   */
  private async getMTeamSets(): Promise<{
    movieDoubanIds: Set<string>
    musicDoubanIds: Set<string>
    imdbIds: Set<string>
  }> {
    return this.getCachedIdSets()
  }

  /**
   * 从 M-Team 行中提取 ID
   */
  private extractMTeamIds(row: Element): {
    movieDoubanId: string | null
    musicDoubanId: string | null
    imdbId: string | null
  } {
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

      // 提取豆瓣电影 ID
      if (!result.movieDoubanId) {
        const match = href.match(/movie\.douban\.com\/subject\/(\d+)/)
        if (match) result.movieDoubanId = match[1]
      }

      // 提取豆瓣音乐 ID
      if (!result.musicDoubanId) {
        const match = href.match(/music\.douban\.com\/subject\/(\d+)/)
        if (match) result.musicDoubanId = match[1]
      }

      // 提取 IMDb ID
      if (!result.imdbId) {
        const match = href.match(/imdb\.com\/title\/((?:tt)?\d+)/)
        if (match) {
          const id = match[1]
          result.imdbId = id.startsWith('tt') ? id : `tt${id}`
        }
      }

      // 尝试从搜索参数中提取
      if (!result.movieDoubanId || !result.musicDoubanId || !result.imdbId) {
        try {
          const parsed = new URL(href, location.origin)
          const doubanHref = parsed.searchParams.get('douban') || ''
          const imdbHref = parsed.searchParams.get('imdb') || ''

          if (!result.movieDoubanId) {
            const match = doubanHref.match(/movie\.douban\.com\/subject\/(\d+)/)
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

      // 如果找到了任一 ID，提前退出（匹配旧脚本行为）
      if (result.movieDoubanId || result.musicDoubanId || result.imdbId) {
        this.debug('[M-Team] Found ID on link', scannedLinks, '→', JSON.stringify(result))
        break
      }
    }

    this.debug('[M-Team] extractMTeamIds scanned', scannedLinks, 'links → result:', JSON.stringify(result))
    return result
  }

  /**
   * 获取 M-Team 种子行
   */
  private getMTeamRows(root: Document | HTMLElement = document): Element[] {
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
  private getMTeamRowSignature(row: Element): string {
    const detailLink = row.querySelector('a[href*="/detail/"]') as HTMLAnchorElement | null
    const detailHref = detailLink?.getAttribute('href') || detailLink?.href || ''

    const scoreLinks = Array.from(row.querySelectorAll('a[href*="/mdb/title"]'))
      .map((link) => {
        const anchor = link as HTMLAnchorElement
        return anchor.getAttribute('href') || anchor.href || ''
      })
      .join('|')

    const ids = this.extractMTeamIds(row)

    return [
      detailHref,
      ids.movieDoubanId || '',
      ids.musicDoubanId || '',
      ids.imdbId || '',
      scoreLinks,
      (row.textContent || '').slice(0, 160),
    ].join('::')
  }

  /**
   * 处理 M-Team 种子行
   */
  private processMTeamRows(
    rows: Element[],
    movieDoubanIds: Set<string>,
    musicDoubanIds: Set<string>,
    imdbIds: Set<string>,
  ): void {
    let skipped = 0, dimmed = 0, notMatched = 0
    rows.forEach((row) => {
      const signature = this.getMTeamRowSignature(row)
      if (
        row.getAttribute('data-umm-mteam-signature') === signature &&
        row.getAttribute('data-umm-mteam-resolved') === 'true'
      ) {
        skipped++
        return
      }

      row.setAttribute('data-umm-mteam-signature', signature)

      const { movieDoubanId, musicDoubanId, imdbId } = this.extractMTeamIds(row)

      const hasMovie = movieDoubanId && movieDoubanIds.has(movieDoubanId)
      const hasMusic = musicDoubanId && musicDoubanIds.has(musicDoubanId)
      const hasImdb = imdbId && imdbIds.has(imdbId)
      const matched = hasMovie || hasMusic || hasImdb

      this.debug(
        '[M-Team] Row IDs:', JSON.stringify({ movieDoubanId, musicDoubanId, imdbId }),
        '| Match:', { movie: !!hasMovie, music: !!hasMusic, imdb: !!hasImdb },
        '| →', matched ? 'DIMMED ✓' : 'no match'
      )

      row.setAttribute(
        'data-umm-mteam-resolved',
        matched || movieDoubanId || musicDoubanId || imdbId ? 'true' : 'false'
      )
      row.setAttribute('data-umm-mteam-matched', matched ? 'true' : 'false')

      if (matched) {
        this.dimElement(row as HTMLElement)
        dimmed++
      } else {
        notMatched++
      }
    })
    this.debug('[M-Team] processMTeamRows done — total:', rows.length, '| dimmed:', dimmed, '| no match:', notMatched, '| dedup skipped:', skipped)
  }

  /**
   * Cache fallback: for rows without direct platform IDs, look up pt_id_cache by detail URL.
   * Uses bulk query to minimize DB calls.
   */
  private async applyCacheFallback(
    rows: Element[],
    extractDetailUrl: (row: Element) => string | null,
    movieDoubanIds: Set<string>,
    musicDoubanIds: Set<string>,
    imdbIds: Set<string>,
  ): Promise<void> {
    if (rows.length === 0) {
      this.debug('[CacheFallback] No unresolved rows to check')
      return
    }

    // Collect detail URLs from unresolved rows
    const urlMap = new Map<string, Element[]>()
    for (const row of rows) {
      const rawUrl = extractDetailUrl(row)
      if (!rawUrl) continue
      try {
        const u = new URL(rawUrl, location.origin)
        const key = `${u.origin}${u.pathname}${u.search}`
        const existing = urlMap.get(key)
        if (existing) existing.push(row)
        else urlMap.set(key, [row])
      } catch {
        // ignore invalid URLs
      }
    }
    if (urlMap.size === 0) {
      this.debug('[CacheFallback] No detail URLs found in unresolved rows')
      return
    }

    this.debug('[CacheFallback] Looking up', urlMap.size, 'detail URLs in pt_id_cache...')
    const cacheMap = await Store.ptIdCacheGetBulk([...urlMap.keys()])
    const cacheEntries = Object.keys(cacheMap).length
    this.debug('[CacheFallback] Cache hits:', cacheEntries, '| missed:', urlMap.size - cacheEntries)

    let hitDimmed = 0
    for (const [ptUrl, entry] of Object.entries(cacheMap)) {
      if (!entry) continue
      const rowsForUrl = urlMap.get(ptUrl)
      if (!rowsForUrl) continue

      const cachedDouban = entry.doubanId
      const cachedImdb = entry.imdbId

      const matched =
        (cachedDouban && (movieDoubanIds.has(cachedDouban) || musicDoubanIds.has(cachedDouban))) ||
        (cachedImdb && imdbIds.has(cachedImdb))

      this.debug('[CacheFallback] URL:', ptUrl.slice(0, 80), '| Cached:', JSON.stringify({ doubanId: cachedDouban, imdbId: cachedImdb }), '→', matched ? 'DIMMED ✓' : 'no match')

      if (matched) {
        for (const row of rowsForUrl) {
          this.dimElement(row as HTMLElement)
          hitDimmed++
        }
      }
    }
    this.debug('[CacheFallback] Done — dimmed via cache:', hitDimmed)
  }

  /**
   * 设置响应式监听循环（用于 M-Team）
   */
  private safeProcess(process: () => Promise<void>): void {
    void process().catch((err) => {
      console.warn('[PT Dimmer] process error:', err)
    })
  }

  private setupReactiveLoop(
    target: HTMLElement,
    process: () => Promise<void>
  ): void {
    this.debug('[Loop] Setting up reactive loop — target:', target.tagName, '#', target.id || '')
    this.safeProcess(process)

    this.observer = new MutationObserver(
      this.throttle(() => {
        this.debug('[Loop] MutationObserver triggered')
        this.safeProcess(process)
      }, 180)
    )
    this.observer.observe(target, {
      childList: true,
      subtree: true,
    })
    this.debug('[Loop] MutationObserver attached')

    this.pollTimer = window.setInterval(() => {
      this.safeProcess(process)
    }, 1400)
    this.debug('[Loop] Poll timer set (1400ms)')

    this.scrollTarget = target
    this.scrollHandler = this.throttle(() => {
      this.safeProcess(process)
    }, 120)
    this.scrollTarget.addEventListener('scroll', this.scrollHandler, true)
    window.addEventListener('resize', this.scrollHandler!)
  }

  /**
   * 等待元素出现并执行回调（带可选内容就绪检查）
   * 用于 SPA 场景：等待目标元素渲染出实际内容后再处理
   */
  private waitForElement(
    selector: string,
    callback: () => void,
    timeout = 5000,
    contentCheck?: (el: Element) => boolean,
  ): void {
    const match = (): Element | null => {
      const el = document.querySelector(selector)
      if (!el) return null
      if (contentCheck && !contentCheck(el)) return null
      return el
    }

    if (match()) {
      callback()
      return
    }

    const observer = new MutationObserver(() => {
      if (match()) {
        observer.disconnect()
        callback()
      }
    })

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    })

    setTimeout(() => {
      observer.disconnect()
    }, timeout)
  }

  /**
   * 主入口：根据 URL 运行对应的 Dimmer
   */
  public async runFor(url: string): Promise<void> {
    this.debug('=== runFor called for URL:', url)
    this.cleanup()

    // Listen for record changes → invalidate ID cache
    this.storageChangeListener = (_changes, area) => {
      if (area === 'local') {
        this.debug('[Cache] Storage changed — invalidating ID cache')
        this.idCache = null
      }
    }
    chrome.storage.onChanged.addListener(this.storageChangeListener)

    const handlers = [
      {
        match: () => url.includes('m-team.cc/browse'),
        // SPA: wait until #root (or fallback #app-content/body) has actual rendered content
        selector: '#root, #app-content, body',
        contentCheck: (el: Element) =>
          el.childElementCount > 0 && el.querySelector('a[href]') !== null,
        process: async () => {
          this.debug('[M-Team] Starting process...')
          const { movieDoubanIds, musicDoubanIds, imdbIds } =
            await this.getMTeamSets()
          const rows = this.getMTeamRows(document)
          this.debug('[M-Team] Found', rows.length, 'rows')
          this.processMTeamRows(rows, movieDoubanIds, musicDoubanIds, imdbIds)

          // Cache fallback: for unresolved rows, check pt_id_cache by detail URL
          const unresolved = rows.filter(
            (r) => r.getAttribute('data-umm-mteam-resolved') !== 'true',
          )
          if (unresolved.length > 0) {
            this.debug('[M-Team] Cache fallback for', unresolved.length, 'unresolved rows')
            await this.applyCacheFallback(
              unresolved,
              (row) => {
                const link = row.querySelector('a[href*="/detail/"]') as HTMLAnchorElement | null
                return link?.href ?? null
              },
              movieDoubanIds,
              musicDoubanIds,
              imdbIds,
            )
          }
        },
        setup: (target: HTMLElement, process: () => Promise<void>) =>
          this.setupReactiveLoop(target, process),
      },
      {
        match: () =>
          ['audiences.me', 'hdhome.org', 'hdarea.club'].some(
            (host) => url.includes(host) && url.includes('torrents.php')
          ),
        selector: 'table.torrents, #torrenttable',
        process: async () => {
          const { doubanIds, imdbIds } = await this.getMovieSets()
          this.debug('[AHH] ID sets — douban:', doubanIds.size, 'imdb:', imdbIds.size)
          const rows = document.querySelectorAll('tbody > tr')
          if (rows.length === 0) {
            this.debug('[AHH] No tbody > tr rows found, trying fallback selectors')
          }
          const fallbackRows = rows.length > 0
            ? rows
            : document.querySelectorAll('table.torrents tr, #torrenttable tr, [class*="torrent"] tr')
          if (fallbackRows.length === 0) {
            this.debug('[AHH] No torrent rows found at all — aborting')
            return
          }
          this.debug('[AHH] Found', fallbackRows.length, 'rows to process')
          let dimmed = 0, notMatched = 0
          fallbackRows.forEach((row) => {
            if (row.querySelector('td.colhead')) { notMatched++; return }

            const doubanLink = row.querySelector('a[href*="movie.douban.com/subject/"]') as HTMLAnchorElement | null
            const imdbLink = row.querySelector('a[href*="www.imdb.com/title/"]') as HTMLAnchorElement | null

            const doubanId = doubanLink
              ?.getAttribute('href')
              ?.match(/\/subject\/(\d+)/)?.[1]
            const imdbId = imdbLink
              ?.getAttribute('href')
              ?.match(/\/title\/(tt\d+)/)?.[1]

            const matched = (doubanId && doubanIds.has(doubanId)) || (imdbId && imdbIds.has(imdbId))

            if (doubanId || imdbId) {
              this.debug('[AHH] Row IDs:', JSON.stringify({ doubanId, imdbId }), '→', matched ? 'DIMMED ✓' : 'no match in sets')
            }

            if (matched) {
              this.dimElement(row as HTMLElement)
              dimmed++
            } else if (!doubanId && !imdbId) {
              notMatched++
            }
          })
            this.debug('[AHH] Done — rows:', fallbackRows.length, '| dimmed:', dimmed, '| no IDs found:', notMatched)

            // Cache fallback: for rows without direct douban/imdb links, check pt_id_cache
            const rowsWithoutIds = Array.from(fallbackRows).filter((row) => {
              if (row.querySelector('td.colhead')) return false
              return !row.querySelector('a[href*="movie.douban.com/subject/"]') &&
                     !row.querySelector('a[href*="www.imdb.com/title/"]')
            })
            if (rowsWithoutIds.length > 0) {
              this.debug('[AHH] Cache fallback for', rowsWithoutIds.length, 'rows without direct IDs')
              await this.applyCacheFallback(
                rowsWithoutIds,
                (row) => {
                  const link = row.querySelector('a[href*="details.php"]') as HTMLAnchorElement | null
                  return link?.href ?? null
                },
                doubanIds,
                new Set<string>(),
                imdbIds,
              )
            }
        },
      },
      {
        match: () =>
          url.includes('ourbits.club') || url.includes('pterclub.net'),
        selector: '#torrenttable, .torrents',
        process: async () => {
          const { doubanIds, imdbIds } = await this.getMovieSets()
          this.debug('[OB/PC] ID sets — douban:', doubanIds.size, 'imdb:', imdbIds.size)
          const rows = document.querySelectorAll('tbody > tr')
          if (rows.length === 0) {
            this.debug('[OB/PC] No tbody > tr rows found, trying fallback')
          }
          const fallbackRows = rows.length > 0
            ? rows
            : document.querySelectorAll('#torrenttable tr, .torrents tr')
          this.debug('[OB/PC] Found', fallbackRows.length, 'rows to process')
          let dimmed = 0, notMatched = 0
          fallbackRows.forEach((row) => {
            if (row.querySelector('td.colhead')) { notMatched++; return }

            const doubanId = row
              .querySelector('[data-doubanid]')
              ?.getAttribute('data-doubanid')

            const rawImdbId = row
              .querySelector('[data-imdbid]')
              ?.getAttribute('data-imdbid')

            const hasDouban = doubanId && doubanIds.has(doubanId)
            const hasImdb = rawImdbId && (imdbIds.has(rawImdbId) || imdbIds.has(`tt${rawImdbId}`))
            const matched = hasDouban || hasImdb

            if (doubanId || rawImdbId) {
              this.debug('[OB/PC] Row IDs:', JSON.stringify({ doubanId, imdbId: rawImdbId }),
                '| Match:', { douban: !!hasDouban, imdb: !!hasImdb },
                '→', matched ? 'DIMMED ✓' : 'no match in sets')
            }

            if (matched) {
              this.dimElement(row as HTMLElement)
              dimmed++
            } else if (!doubanId && !rawImdbId) {
              notMatched++
            }
          })
            this.debug('[OB/PC] Done — rows:', fallbackRows.length, '| dimmed:', dimmed, '| no IDs found:', notMatched)

            // Cache fallback: for rows without data-doubanid/data-imdbid, check pt_id_cache
            const rowsWithoutIds = Array.from(fallbackRows).filter((row) => {
              if (row.querySelector('td.colhead')) return false
              return !row.querySelector('[data-doubanid]') && !row.querySelector('[data-imdbid]')
            })
            if (rowsWithoutIds.length > 0) {
              this.debug('[OB/PC] Cache fallback for', rowsWithoutIds.length, 'rows without direct IDs')
              await this.applyCacheFallback(
                rowsWithoutIds,
                (row) => {
                  const link = row.querySelector('a[href*="details.php"]') as HTMLAnchorElement | null
                  return link?.href ?? null
                },
                doubanIds,
                new Set<string>(),
                imdbIds,
              )
            }
        },
      },
    ]

    const active = handlers.find((handler) => handler.match())
    if (!active) {
      this.debug('No matching handler for URL')
      return
    }

    this.debug('Handler matched — selector:', active.selector, '| contentCheck:', typeof active.contentCheck)
    this.debug('Waiting for element...')
    this.waitForElement(
      active.selector,
      async () => {
        this.debug('Element found, starting process...')
        try {
          await active.process()
        } catch (err) {
          console.warn('[PT Dimmer] Initial process failed:', err)
        }

        if (typeof active.setup === 'function') {
          const target =
            document.querySelector(active.selector.split(',')[0].trim()) ||
            document.body
          this.debug('Setting up reactive loop on target:', target.tagName, target.id || target.className || '')
          active.setup(target as HTMLElement, () => active.process())
          return
        }

        this.observer = new MutationObserver(
          this.throttle(() => {
            this.safeProcess(() => active.process())
          }, 260)
        )
        this.observer.observe(document.body, {
          childList: true,
          subtree: true,
        })
      },
      5000,
      active.contentCheck,
    )
  }
}
