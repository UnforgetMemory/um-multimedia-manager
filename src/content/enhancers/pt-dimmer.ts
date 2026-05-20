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

import { Store } from '@/shared'

export class PTDimmer {
  private observer: MutationObserver | null = null
  private pollTimer: number | null = null
  private scrollHandler: (() => void) | null = null
  private scrollTarget: HTMLElement | null = null

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
    const doubanIds = await Store.getIdSet('movie', 'douban')
    const imdbIds = await Store.getIdSet('movie', 'imdb')
    return { doubanIds, imdbIds }
  }

  /**
   * 获取 M-Team 专用 ID 集合（包含音乐）
   */
  private async getMTeamSets(): Promise<{
    movieDoubanIds: Set<string>
    musicDoubanIds: Set<string>
    imdbIds: Set<string>
  }> {
    const movieDoubanIds = await Store.getIdSet('movie', 'douban')
    const musicDoubanIds = await Store.getIdSet('music', 'douban')
    const imdbIds = await Store.getIdSet('movie', 'imdb')
    return { movieDoubanIds, musicDoubanIds, imdbIds }
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

    for (const link of Array.from(row.querySelectorAll('a[href]'))) {
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

      // 如果三个 ID 都找到了，提前退出
      if (result.movieDoubanId && result.musicDoubanId && result.imdbId) {
        break
      }
    }

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
    imdbIds: Set<string>
  ): void {
    rows.forEach((row) => {
      const signature = this.getMTeamRowSignature(row)
      if (
        row.getAttribute('data-umm-mteam-signature') === signature &&
        row.getAttribute('data-umm-mteam-resolved') === 'true'
      ) {
        return
      }

      row.setAttribute('data-umm-mteam-signature', signature)

      const { movieDoubanId, musicDoubanId, imdbId } = this.extractMTeamIds(row)

      const matched =
        (movieDoubanId && movieDoubanIds.has(movieDoubanId)) ||
        (musicDoubanId && musicDoubanIds.has(musicDoubanId)) ||
        (imdbId && imdbIds.has(imdbId))

      row.setAttribute(
        'data-umm-mteam-resolved',
        matched || movieDoubanId || musicDoubanId || imdbId ? 'true' : 'false'
      )
      row.setAttribute('data-umm-mteam-matched', matched ? 'true' : 'false')

      if (matched) {
        this.dimElement(row as HTMLElement)
      }
    })
  }

  /**
   * 设置响应式监听循环（用于 M-Team）
   */
  private setupReactiveLoop(
    target: HTMLElement,
    process: () => Promise<void>
  ): void {
    process()

    this.observer = new MutationObserver(
      this.throttle(() => {
        void process()
      }, 180)
    )
    this.observer.observe(target, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    })

    this.pollTimer = window.setInterval(() => {
      void process()
    }, 1400)

    this.scrollTarget = target
    this.scrollHandler = this.throttle(() => {
      void process()
    }, 120)
    this.scrollTarget.addEventListener('scroll', this.scrollHandler, true)
    window.addEventListener('resize', this.scrollHandler!)
  }

  /**
   * 等待元素出现并执行回调
   */
  private waitForElement(
    selector: string,
    callback: () => void,
    timeout = 5000
  ): void {
    const element = document.querySelector(selector)
    if (element) {
      callback()
      return
    }

    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector)
      if (element) {
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
    this.cleanup()

    const handlers = [
      {
        match: () => url.includes('m-team.cc/browse'),
        selector: '#root, #app-content, body',
        process: async () => {
          const { movieDoubanIds, musicDoubanIds, imdbIds } =
            await this.getMTeamSets()
          this.processMTeamRows(
            this.getMTeamRows(document),
            movieDoubanIds,
            musicDoubanIds,
            imdbIds
          )
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
          document.querySelectorAll('tbody > tr').forEach((row) => {
            if (row.querySelector('td.colhead')) return

            const doubanId = row
              .querySelector('a[href*="movie.douban.com/subject/"]')
              ?.getAttribute('href')
              ?.match(/\/subject\/(\d+)/)?.[1]

            const imdbId = row
              .querySelector('a[href*="www.imdb.com/title/"]')
              ?.getAttribute('href')
              ?.match(/\/title\/(tt\d+)/)?.[1]

            if (
              (doubanId && doubanIds.has(doubanId)) ||
              (imdbId && imdbIds.has(imdbId))
            ) {
              this.dimElement(row as HTMLElement)
            }
          })
        },
      },
      {
        match: () =>
          url.includes('ourbits.club') || url.includes('pterclub.net'),
        selector: '#torrenttable, .torrents',
        process: async () => {
          const { doubanIds, imdbIds } = await this.getMovieSets()
          document.querySelectorAll('tbody > tr').forEach((row) => {
            if (row.querySelector('td.colhead')) return

            const doubanId = row
              .querySelector('[data-doubanid]')
              ?.getAttribute('data-doubanid')

            const imdbId = row
              .querySelector('[data-imdbid]')
              ?.getAttribute('data-imdbid')

            if (
              (doubanId && doubanIds.has(doubanId)) ||
              (imdbId &&
                (imdbIds.has(imdbId) || imdbIds.has(`tt${imdbId}`)))
            ) {
              this.dimElement(row as HTMLElement)
            }
          })
        },
      },
    ]

    const active = handlers.find((handler) => handler.match())
    if (!active) return

    this.waitForElement(active.selector, async () => {
      await active.process()

      if (typeof active.setup === 'function') {
        const target =
          document.querySelector(active.selector.split(',')[0].trim()) ||
          document.body
        active.setup(target as HTMLElement, active.process)
        return
      }

      this.observer = new MutationObserver(
        this.throttle(() => {
          void active.process()
        }, 260)
      )
      this.observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
      })
    })
  }
}
