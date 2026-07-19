// ─── Mukaku 处理器类 ──────────────────────────────────

import { RequestQueue } from '@/utils/requestQueue'
import { FloatingToast } from '../../utils/toast'
import { createStatusChip } from '../../utils/dom'
import { t } from '../../i18n'
import { Store } from '@/features/database'
import { MUKAKU_CONFIG, NETWORK_CONFIG } from './config'
import { MukakuToastController } from './toast'
import { extractMvId, extractLinkedIdsFromDOM } from './dom'
import { getApiUrl, extractLinkedIdsFromPayload } from './api'
import { setAddItem, setDeleteItem, expMapAdd, expMapHas, setHasItem, probeCacheSet, probeCacheGet, getIdSet } from './cache'

class MukakuHandler {
  private queue: RequestQueue | null = null
  /** In-memory probe cache: mvId → linked IDs. LRU-limited via MUKAKU_CONFIG.PROBE_CACHE_MAX. */
  private probeCache = new Map<string, { doubanId: string | null; imdbId: string | null }>()
  /** Handler-level watched ID cache: provider → { movieDoubanIds, imdbIds, ts }. 30s TTL reduces dbGetAll calls. */
  private watchedIdCache: { movieDoubanIds: Set<string>; imdbIds: Set<string>; ts: number } | null = null
  /** Batch-read watched set data, populated at start of processVisibleCards. */
  private batchWatchedSet: string[] | null = null
  /** Batch-read unwatched map data, populated at start of processVisibleCards. */
  private batchUnwatchedMap: Record<string, number> | null = null
  private listObserver: MutationObserver | null = null
  /** IntersectionObserver for lazy-loaded cards after initial batch. */
  private listIntersectionObserver: IntersectionObserver | null = null
  private toastScheduled = false
  private isProcessing = false
  private processDebounceTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * 确保请求队列存在（始终复用同一个队列实例）
   */
  private ensureQueue(): RequestQueue {
    if (this.queue) {
      return this.queue
    }

    this.queue = new RequestQueue({
      maxConcurrent: NETWORK_CONFIG.MAX_CONCURRENT,
      minDelayMs: NETWORK_CONFIG.MIN_DELAY_MS,
      maxDelayMs: NETWORK_CONFIG.MAX_DELAY_MS,
      onStateChange: ({ queued, active, currentKey, total }) => {
        if (!queued && !active) {
          if (MukakuToastController.hasActive()) {
            MukakuToastController.success(t('mukaku.queue_done', { total }))
          }
          return
        }

        const completed = total - queued - active
        const progress = total > 0 ? Math.round((completed / total) * 100) : 0

        const parts: string[] = []
        parts.push(t('mukaku.progress', { completed, total }))
        if (active > 0) parts.push(`并发 ${active}`)
        if (currentKey) parts.push(`当前 ${currentKey}`)

        if (!this.toastScheduled) {
          this.toastScheduled = true
          requestAnimationFrame(() => {
            this.toastScheduled = false
            MukakuToastController.update(parts.join(' · '), progress)
          })
        }
      },
    })

    return this.queue
  }

  /**
   * 探测关联 ID（带缓存）
   */
  private async probeLinkedIds(
    mvId: string
  ): Promise<{ doubanId: string | null; imdbId: string | null }> {
    if (!mvId) {
      return { doubanId: null, imdbId: null }
    }

    // 1. 检查内存缓存（最快）
    if (this.probeCache.has(mvId)) {
      return this.probeCache.get(mvId)!
    }

    // 2. 检查 IndexedDB 持久化缓存
    const cached = await probeCacheGet(mvId)
    if (cached) {
      const result = { doubanId: cached.doubanId, imdbId: cached.imdbId }
      this.probeCache.set(mvId, result)
      return result
    }

    // 写入前检查 probeCache 大小，超出上限则淘汰最早条目
    if (this.probeCache.size >= MUKAKU_CONFIG.PROBE_CACHE_MAX) {
      const oldestKey = this.probeCache.keys().next().value
      if (oldestKey !== undefined) this.probeCache.delete(oldestKey)
    }

    // 3. 通过队列执行请求
    const linkedIds = await this.ensureQueue().enqueue(mvId, async () => {
      const response = await fetch(getApiUrl(mvId), {
        method: 'GET',
        signal: AbortSignal.timeout(NETWORK_CONFIG.TIMEOUT_MS),
      })

      if (!response.ok) {
        throw new Error(t('mukaku.probe_failed', { status: response.status }))
      }

      const payload = await response.json()
      return extractLinkedIdsFromPayload(payload)
    })

    // 4. 缓存结果到内存和 IndexedDB
    this.probeCache.set(mvId, linkedIds)
    await probeCacheSet(mvId, { ...linkedIds, ts: Date.now() })
    return linkedIds
  }

  /**
   * 标记为已看
   */
  private async markWatched(mvId: string): Promise<void> {
    if (!mvId) return
    await setAddItem(MUKAKU_CONFIG.WATCHED_SET_KEY, mvId)
    await setDeleteItem(MUKAKU_CONFIG.UNWATCHED_TTL_KEY, mvId)
  }

  /**
   * 标记为未看（带 TTL）
   */
  private async markUnwatched(mvId: string): Promise<void> {
    if (!mvId) return
    await expMapAdd(MUKAKU_CONFIG.UNWATCHED_TTL_KEY, mvId, MUKAKU_CONFIG.UNWATCHED_TTL_MS)
  }

  /**
   * 检查是否在已看缓存中
   */
  private async isCachedWatched(mvId: string): Promise<boolean> {
    return setHasItem(MUKAKU_CONFIG.WATCHED_SET_KEY, mvId)
  }

  /**
   * 检查是否在未看缓存中
   */
  private async isCachedUnwatched(mvId: string): Promise<boolean> {
    return expMapHas(MUKAKU_CONFIG.UNWATCHED_TTL_KEY, mvId)
  }

  /**
   * 处理详情页
   */
  public async handleDetailPage(): Promise<void> {
    const mvId = extractMvId(location.href)
    if (!mvId) return

    // 等待详情区域出现
    const waitForElement = (selector: string, timeout = 12000): Promise<HTMLElement> => {
      return new Promise((resolve, reject) => {
        const element = document.querySelector(selector) as HTMLElement
        if (element) {
          resolve(element)
          return
        }

        const observer = new MutationObserver(() => {
          const element = document.querySelector(selector) as HTMLElement
          if (element) {
            observer.disconnect()
            resolve(element)
          }
        })

        observer.observe(document.body, { childList: true, subtree: true })

        setTimeout(() => {
          observer.disconnect()
          reject(new Error(`Timeout waiting for ${selector}`))
        }, timeout)
      })
    }

    try {
      const infoRoot = await waitForElement('.media-details-area .info')
      await this.renderDetailState(infoRoot, mvId)
    } catch (error) {
      console.error('[Mukaku] Detail page rendering failed:', error)
      if (MukakuToastController.hasActive()) {
        MukakuToastController.error(t('mukaku.detail_failed', { error: String(error) }))
      } else {
        FloatingToast.error(t('mukaku.detail_failed_title'), String(error))
      }
    }
  }

  /**
   * 渲染详情页状态
   */
  private async renderDetailState(
    infoRoot: HTMLElement,
    mvId: string
  ): Promise<void> {
    // 查找或创建状态槽位
    let slot = infoRoot.querySelector('.umm-mukaku-status')
    if (!slot) {
      slot = document.createElement('div')
      slot.className = 'umm-mukaku-status'
      infoRoot.prepend(slot)
    }

    // 检查已看缓存
    if (await this.isCachedWatched(mvId)) {
      slot.innerHTML = ''
      const chip = createStatusChip('movie', 2, 0, t('mukaku.cache_hit'))
      slot.appendChild(chip)
      return
    }

    // 检查未看缓存
    if (await this.isCachedUnwatched(mvId)) {
      slot.innerHTML = ''
      const chip = createStatusChip('movie', 0, 0, t('mukaku.cache_miss'))
      slot.appendChild(chip)
      return
    }

    // 从 DOM 提取关联 ID
    let linkedIds = extractLinkedIdsFromDOM(document)

    // 如果 DOM 中没有，调用 API 探测
    if (!linkedIds.doubanId && !linkedIds.imdbId) {
      try {
        linkedIds = await this.probeLinkedIds(mvId)
      } catch (error) {
        console.error('[Mukaku] API probe failed:', error)
        if (MukakuToastController.hasActive()) {
          MukakuToastController.error(t('mukaku.api_failed', { error: String(error) }))
        } else {
          FloatingToast.error(t('mukaku.api_failed_title'), String(error))
        }
        return
      }
    }

    // 根据关联 ID 匹配本地记录
    if (linkedIds.doubanId || linkedIds.imdbId) {
      const movieDoubanIds = await getIdSet('movie', 'douban', this.watchedIdCache)
      const imdbIds = await getIdSet('movie', 'imdb', this.watchedIdCache)

      const matched =
        (linkedIds.doubanId && movieDoubanIds.has(linkedIds.doubanId)) ||
        (linkedIds.imdbId && imdbIds.has(linkedIds.imdbId))

      if (matched) {
        await this.markWatched(mvId)
        slot.innerHTML = ''
        const chip = createStatusChip('movie', 2, 0, t('mukaku.match_found'))
        slot.appendChild(chip)
      } else {
        await this.markUnwatched(mvId)
        slot.innerHTML = ''
        const chip = createStatusChip('movie', 0, 0, t('mukaku.no_match'))
        slot.appendChild(chip)
      }
    } else {
      await this.markUnwatched(mvId)
      slot.innerHTML = ''
      const chip = createStatusChip('movie', 0, 0, t('mukaku.no_id'))
      slot.appendChild(chip)
    }
  }

  public async handleListPage(): Promise<void> {
    await this.processVisibleCards()
    this.setupLazyLoadObserver()
  }

  private setupLazyLoadObserver(): void {
    if (this.listIntersectionObserver) {
      this.listIntersectionObserver.disconnect()
    }

    this.listIntersectionObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            if (this.processDebounceTimer) {
              clearTimeout(this.processDebounceTimer)
            }
            this.processDebounceTimer = setTimeout(() => {
              this.processDebounceTimer = null
              this.processVisibleCards()
            }, 150)
          }
        }
      },
      {
        rootMargin: '500px 0px',
        threshold: 0.1,
      },
    )

    this.listObserver = new MutationObserver(() => {
      if (this.processDebounceTimer) {
        clearTimeout(this.processDebounceTimer)
      }
      this.processDebounceTimer = setTimeout(() => {
        this.processDebounceTimer = null
        this.processVisibleCards()
      }, 300)
    })

    this.listObserver.observe(document.body, {
      childList: true,
      subtree: true,
    })
  }

  /**
   * 处理可见的视频卡片
   */
  private async processVisibleCards(): Promise<void> {
    if (this.isProcessing) {
      console.log('[Mukaku] Already processing, skipping...')
      return
    }

    if (this.queue) this.queue.resetTotal()

    const cards = document.querySelectorAll('.video-card')

    // 收集未处理的卡片
    const unprocessed: Array<{ cardEl: HTMLElement; mvId: string }> = []
    for (const card of Array.from(cards)) {
      const cardEl = card as HTMLElement
      if (cardEl.getAttribute('data-umm-mukaku-processed') === 'true') continue
      const mvId = extractMvId(cardEl)
      if (!mvId) continue
      cardEl.setAttribute('data-umm-mukaku-processed', 'true')
      unprocessed.push({ cardEl, mvId })
    }

    if (unprocessed.length === 0) return

    this.isProcessing = true

    try {
      const watchedRaw = await Store.dbGet('ttl_cache', MUKAKU_CONFIG.WATCHED_SET_KEY)
      this.batchWatchedSet = Array.isArray(watchedRaw) ? watchedRaw : []
      const unwatchedRaw = await Store.dbGet('ttl_cache', MUKAKU_CONFIG.UNWATCHED_TTL_KEY)
      this.batchUnwatchedMap = (unwatchedRaw && typeof unwatchedRaw === 'object' && !Array.isArray(unwatchedRaw))
        ? (unwatchedRaw as unknown as Record<string, number>)
        : {}

      const now = Date.now()
      if (!this.watchedIdCache || now - this.watchedIdCache.ts >= MUKAKU_CONFIG.WATCHED_ID_CACHE_TTL) {
        const movieDoubanIds = await getIdSet('movie', 'douban', null)
        const imdbIds = await getIdSet('movie', 'imdb', null)
        this.watchedIdCache = { movieDoubanIds, imdbIds, ts: now }
      }
      const { movieDoubanIds, imdbIds } = this.watchedIdCache

      for (const { cardEl, mvId } of unprocessed) {
        const isWatched = this.batchWatchedSet.includes(mvId)
        if (isWatched) {
          cardEl.classList.add('umm-dimmed')
          continue
        }
        const expiry = this.batchUnwatchedMap[mvId]
        if (expiry !== undefined && Date.now() < expiry) {
          continue
        }

        if (this.probeCache.has(mvId)) {
          const result = this.probeCache.get(mvId)!
          const matched =
            (result.doubanId && movieDoubanIds.has(result.doubanId)) ||
            (result.imdbId && imdbIds.has(result.imdbId))
          if (matched) {
            this.addToBatchWatched(mvId)
            cardEl.classList.add('umm-dimmed')
          } else {
            this.addToBatchUnwatched(mvId)
          }
          continue
        }

        const cached = await probeCacheGet(mvId)
        if (cached) {
          const result = { doubanId: cached.doubanId, imdbId: cached.imdbId }
          this.probeCache.set(mvId, result)
          const matched =
            (result.doubanId && movieDoubanIds.has(result.doubanId)) ||
            (result.imdbId && imdbIds.has(result.imdbId))
          if (matched) {
            this.addToBatchWatched(mvId)
            cardEl.classList.add('umm-dimmed')
          } else {
            this.addToBatchUnwatched(mvId)
          }
          continue
        }

        await this.probeAndProcessCard(cardEl, mvId, movieDoubanIds, imdbIds)
      }
    } finally {
      this.isProcessing = false
    }
  }

  private async probeAndProcessCard(
    cardEl: HTMLElement,
    mvId: string,
    movieDoubanIds: Set<string>,
    imdbIds: Set<string>,
  ): Promise<void> {
    try {
      const linkedIds = await this.probeLinkedIds(mvId)

      if (linkedIds.doubanId || linkedIds.imdbId) {
        const matched =
          (linkedIds.doubanId && movieDoubanIds.has(linkedIds.doubanId)) ||
          (linkedIds.imdbId && imdbIds.has(linkedIds.imdbId))

        if (matched) {
          this.addToBatchWatched(mvId)
          cardEl.classList.add('umm-dimmed')
        } else {
          this.addToBatchUnwatched(mvId)
        }
      } else {
        this.addToBatchUnwatched(mvId)
      }
    } catch (error) {
      console.error('[Mukaku] Card processing failed:', error)
    }
  }

  private addToBatchWatched(mvId: string): void {
    if (this.batchWatchedSet && !this.batchWatchedSet.includes(mvId)) {
      this.batchWatchedSet.push(mvId)
    }
    setAddItem(MUKAKU_CONFIG.WATCHED_SET_KEY, mvId)
    setDeleteItem(MUKAKU_CONFIG.UNWATCHED_TTL_KEY, mvId)
    this.watchedIdCache = null
  }

  private addToBatchUnwatched(mvId: string): void {
    if (this.batchUnwatchedMap && !(mvId in this.batchUnwatchedMap)) {
      this.batchUnwatchedMap[mvId] = Date.now() + MUKAKU_CONFIG.UNWATCHED_TTL_MS
    }
    expMapAdd(MUKAKU_CONFIG.UNWATCHED_TTL_KEY, mvId, MUKAKU_CONFIG.UNWATCHED_TTL_MS)
  }

  /**
   * 清理资源
   */
  public cleanup(): void {
    if (this.listObserver) {
      this.listObserver.disconnect()
      this.listObserver = null
    }
    if (this.listIntersectionObserver) {
      this.listIntersectionObserver.disconnect()
      this.listIntersectionObserver = null
    }
    if (this.processDebounceTimer) {
      clearTimeout(this.processDebounceTimer)
      this.processDebounceTimer = null
    }
    this.queue = null
    MukakuToastController.close()
    this.probeCache.clear()
    this.watchedIdCache = null
    this.batchWatchedSet = null
    this.batchUnwatchedMap = null
  }
}

export { MukakuHandler }