// ─── Mukaku 处理器类 ──────────────────────────────────

import { RequestQueue } from '@/utils/requestQueue'
import { initEventBus, onEvent } from '@/utils/event-bus'
import { FloatingToast } from '../../utils/toast'
import { createStatusChip, waitForElement } from '../../utils/dom'
import { t } from '../../i18n'
import { Store } from '@/features/database'
import { warnLog } from '@/utils/logger'
import { MUKAKU_CONFIG, NETWORK_CONFIG } from './config'
import { MukakuToastController } from './toast'
import { extractMvId, extractLinkedIdsFromDOM } from './dom'
import { getApiUrl, extractLinkedIdsFromPayload } from './api'
import { setAddItem, setDeleteItem, expMapAdd, expMapHas, setHasItem, probeCacheSet, probeCacheGet, getIdSet, probeCacheGetBulk, getWatchedIdSets, writeBatchedSets } from './cache'
import { clearProcessedMarkers, createDebouncedScheduler, isDetailContextStale, shouldRefreshForEvent } from './refresh'
import { createSerialRunner } from './processing'
import { resolveCardState, type CardAction } from './resolve'

class MukakuHandler {
  private queue: RequestQueue | null = null
  /** In-memory probe cache: mvId → linked IDs. LRU-limited via MUKAKU_CONFIG.PROBE_CACHE_MAX. */
  private probeCache = new Map<string, { doubanId: string | null; imdbId: string | null }>()
  /** Handler-level watched ID cache: provider → { movieDoubanIds, imdbIds, ts }. 30s TTL reduces dbGetAll calls. */
  private watchedIdCache: { movieDoubanIds: Set<string>; imdbIds: Set<string>; ts: number } | null = null
  /** Batch-read watched set data, populated at start of processVisibleCards. */
  private batchWatchedSet: Set<string> | null = null
  /** Batch-read unwatched map data, populated at start of processVisibleCards. */
  private batchUnwatchedMap: Record<string, number> | null = null
  private listObserver: MutationObserver | null = null
  /** IntersectionObserver for lazy-loaded cards after initial batch. */
  private listIntersectionObserver: IntersectionObserver | null = null
  private toastScheduled = false
  private processDebounceTimer: ReturnType<typeof setTimeout> | null = null
  /** Serial runner: coalesces re-entrant scans (route change during in-flight scan is re-run, not dropped). */
  private runner = createSerialRunner()
  /** 300ms trailing-edge debounce — coalesces record event storms (bulk import). */
  private refreshScheduler = createDebouncedScheduler(300, {
    setTimeout: (cb, ms) => window.setTimeout(cb, ms),
    clearTimeout: (handle) => window.clearTimeout(handle),
  })
  /** Event-bus unsubscribe fns (record:updated / record:deleted). */
  private eventBusUnsubscribers: Array<() => void> = []
  /** Guards activate() against double subscription. */
  private activated = false

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
    // Detail page just marked watched → invalidate list-path caches so the list reflects it immediately
    this.watchedIdCache = null
    this.batchWatchedSet = null
    this.batchUnwatchedMap = null
  }

  /**
   * 标记为未看（带 TTL）
   */
  private async markUnwatched(mvId: string): Promise<void> {
    if (!mvId) return
    await expMapAdd(MUKAKU_CONFIG.UNWATCHED_TTL_KEY, mvId, MUKAKU_CONFIG.UNWATCHED_TTL_MS)
    // Detail page just marked unwatched → invalidate list-path caches so the list reflects it immediately
    this.watchedIdCache = null
    this.batchWatchedSet = null
    this.batchUnwatchedMap = null
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
   * Subscribe to background record events (idempotent). record:updated/deleted are
   * broadcast after every IndexedDB write (background/handlers/db.ts etc.) — the only
   * data source for Mukaku's real-time dimming.
   */
  public activate(): void {
    if (this.activated) return
    this.activated = true
    initEventBus()
    this.eventBusUnsubscribers = [
      onEvent('record:updated', (data) => this.onRecordChange(data)),
      onEvent('record:deleted', (data) => this.onRecordChange(data)),
    ]
  }

  /**
   * record event callback: clear processed markers first (otherwise handled cards are
   * skipped forever and a re-run is a no-op), then invalidate watchedIdCache / batch
   * sets, and finally re-run the scan after a 300ms debounce.
   */
  private onRecordChange(data: unknown): void {
    if (!shouldRefreshForEvent(data)) return
    clearProcessedMarkers(document)
    this.watchedIdCache = null
    this.batchWatchedSet = null
    this.batchUnwatchedMap = null
    this.refreshScheduler.schedule(() => this.runRefresh())
  }

  /** Event-triggered full rescan (serialized via the runner to avoid interleaving with page scans). */
  private runRefresh(): void {
    this.runner.run(() => this.processVisibleCards())
  }

  /**
   * 处理详情页
   */
  public async handleDetailPage(): Promise<void> {
    this.resetForPage()
    this.activate()
    const mvId = extractMvId(location.href)
    if (!mvId) return

    // 等待详情区域出现（统一实现见 utils/dom）
    try {
      const infoRoot = (await waitForElement('.media-details-area .info', 12000)) as HTMLElement
      // SPA navigation race: the route changed while waiting (mvId stale) or the old
      // detail node left the document → abandon silently; the new navigation's own
      // handleDetailPage will render.
      if (isDetailContextStale(mvId, location.href) || !infoRoot.isConnected) return
      await this.renderDetailState(infoRoot, mvId)
    } catch (error: unknown) {
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
      } catch (error: unknown) {
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
    this.resetForPage()
    this.activate()
    this.runner.run(() => this.processVisibleCards())
    this.setupLazyLoadObserver()
  }

  /**
   * SPA navigation reset: disconnect old observers (prevent leaks), clear caches so the
   * new page is evaluated from scratch. Does not touch cleanup() (that is
   * beforeunload-level teardown). Observers are rebuilt by setupLazyLoadObserver.
   */
  private resetForPage(): void {
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
    this.watchedIdCache = null
    this.batchWatchedSet = null
    this.batchUnwatchedMap = null
    this.probeCache.clear()
    this.refreshScheduler.cancel()
  }

  private setupLazyLoadObserver(): void {
    if (this.listObserver) {
      this.listObserver.disconnect()
      this.listObserver = null
    }
    if (this.listIntersectionObserver) {
      this.listIntersectionObserver.disconnect()
      this.listIntersectionObserver = null
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
              this.runner.run(() => this.processVisibleCards())
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
        this.runner.run(() => this.processVisibleCards())
      }, 300)
    })

    this.listObserver.observe(document.body, {
      childList: true,
      subtree: true,
    })
  }

  /**
   * Process visible video cards.
   * Concurrency is serialized by this.runner (all callers go through runner.run);
   * this method only performs the pure scan.
   */
  private async processVisibleCards(): Promise<void> {
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

    // Capture local references (before the first await): addToBatch* in the loop and the
    // cycle-end flush both depend on these refs — if onRecordChange/resetForPage null
    // the fields mid-flight, the flush writes the accumulated state (never an empty
    // set), so the DB watched set is never wiped to empty.
    const batchWatchedSet: Set<string> = this.batchWatchedSet ?? new Set()
    const batchUnwatchedMap: Record<string, number> = this.batchUnwatchedMap ?? {}
    const watchedRaw = await Store.dbGet('ttl_cache', MUKAKU_CONFIG.WATCHED_SET_KEY)
    // WATCHED_SET_KEY is stored as string[] (setAddItem shape) → convert to a Set for resolveCardState
    this.batchWatchedSet = batchWatchedSet // keep in sync with the captured local ref (same object; field-nulling still points at accumulated state)
    for (const id of Array.isArray(watchedRaw) ? watchedRaw : []) batchWatchedSet.add(id)
    const unwatchedRaw = await Store.dbGet('ttl_cache', MUKAKU_CONFIG.UNWATCHED_TTL_KEY)
    this.batchUnwatchedMap = batchUnwatchedMap
    if (unwatchedRaw && typeof unwatchedRaw === 'object' && !Array.isArray(unwatchedRaw)) {
      Object.assign(batchUnwatchedMap, unwatchedRaw)
    }
    const now = Date.now()

    // Batch-fetch watched IDs: getWatchedIdSets has its own 30s TTL (cache hit → 0 DB
    // calls). On hit keep the original ts (TTL continues); on refill refresh ts.
    const prevWatchedCache = this.watchedIdCache
    const watchedSets = await getWatchedIdSets(prevWatchedCache)
    const watchedCacheFresh =
      prevWatchedCache !== null && now - prevWatchedCache.ts < MUKAKU_CONFIG.WATCHED_ID_CACHE_TTL
    this.watchedIdCache = {
      ...watchedSets,
      ts: watchedCacheFresh ? prevWatchedCache.ts : now,
    }
    const { movieDoubanIds, imdbIds } = this.watchedIdCache

    // Batch-prefill probe cache: one dbGetBulk for cards that would reach 'needs-probe',
    // replacing the per-card probeCacheGet in the loop (S2: N serial DB messages → 1).
    // Filter conditions match resolveCardState's needs-probe decision.
    const needsProbeIds: string[] = []
    for (const { mvId } of unprocessed) {
      if (batchWatchedSet.has(mvId)) continue
      const expiry = batchUnwatchedMap[mvId]
      if (expiry !== undefined && now < expiry) continue
      if (this.probeCache.has(mvId)) continue
      needsProbeIds.push(mvId)
    }
    const bulkProbes = await probeCacheGetBulk(needsProbeIds)
    for (const [mvId, entry] of bulkProbes) {
      this.probeCache.set(mvId, { doubanId: entry.doubanId, imdbId: entry.imdbId })
    }

    // Phase 1 — resolve every card; fire all network probes CONCURRENTLY.
    // The RequestQueue enforces maxConcurrent=10 + random delay; awaiting each
    // probe inside the loop would serialize them to 1 at a time, starving the
    // queue (the pre-campaign bug this restores real concurrency for).
    const actions = new Map<string, CardAction>()
    const probePromises = new Map<string, Promise<{ doubanId: string | null; imdbId: string | null } | null>>()
    for (const { mvId } of unprocessed) {
      const action = resolveCardState(mvId, {
        watched: batchWatchedSet,
        unwatchedExpiry: batchUnwatchedMap,
        now,
        probe: this.probeCache.get(mvId) ?? null,
        watchedDouban: movieDoubanIds,
        watchedImdb: imdbIds,
      })
      actions.set(mvId, action)
      if (action === 'needs-probe') {
        // Fire now, settle later — probeLinkedIds has internal caching
        // (memory → IDB → network), so already-cached cards resolve instantly.
        probePromises.set(mvId, this.probeLinkedIds(mvId).catch(() => null))
      }
    }

    // Phase 2 — apply results in card order; probes are already in flight.
    for (const { cardEl, mvId } of unprocessed) {
      const action = actions.get(mvId)!
      switch (action) {
        case 'dim':
          cardEl.classList.add('umm-dimmed')
          this.addToBatchWatched(mvId)
          break
        case 'skip-unwatched': {
          // Mirrors old behavior: unwatchedExpiry hit → nothing to write; probe miss → persist to DB.
          const expiry = batchUnwatchedMap[mvId]
          if (expiry === undefined || !(now < expiry)) {
            this.addToBatchUnwatched(mvId)
          }
          break
        }
        case 'needs-probe': {
          const linkedIds = await probePromises.get(mvId)!
          if (linkedIds === null) {
            // Probe failed (network/timeout) — skip silently, re-probed next scan.
            // Do NOT mark as unwatched: a transient error must not suppress dimming for 1h.
            warnLog('[Mukaku] Probe failed for card', mvId)
            break
          }
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
          break
        }
      }
    }

    // Cycle-end persistence: the loop's accumulated markers land in just 2 dbPuts
    // (replacing per-card setAddItem/setDeleteItem/expMapAdd read-modify-write).
    // Note: a crash between accumulation and flush loses that round's markers
    // (pre-existing risk pattern; events re-trigger a scan and probeCache memory hits
    // self-heal). Flush failure does not block the scan.
    try {
      await writeBatchedSets(batchWatchedSet, batchUnwatchedMap)
    } catch (error: unknown) {
      warnLog('[Mukaku] batch flush failed:', error)
    }
  }

  private addToBatchWatched(mvId: string): void {
    if (this.batchWatchedSet) {
      this.batchWatchedSet.add(mvId)
      // Mirrors old setDeleteItem semantics: watched cards keep no unwatched TTL entry (accumulated in memory, flushed with the cycle)
      delete this.batchUnwatchedMap?.[mvId]
    }
  }

  private addToBatchUnwatched(mvId: string): void {
    if (this.batchUnwatchedMap) {
      // Always write a fresh expiry (mirrors expMapAdd behavior), persisted once at cycle-end flush
      this.batchUnwatchedMap[mvId] = Date.now() + MUKAKU_CONFIG.UNWATCHED_TTL_MS
    }
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
    this.eventBusUnsubscribers.forEach((unsub) => unsub())
    this.eventBusUnsubscribers = []
    this.activated = false
    this.refreshScheduler.cancel()
    this.queue = null
    MukakuToastController.close()
    this.probeCache.clear()
    this.watchedIdCache = null
    this.batchWatchedSet = null
    this.batchUnwatchedMap = null
  }
}

export { MukakuHandler }