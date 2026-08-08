// ─── Mukaku 处理器类 ──────────────────────────────────

import { RequestQueue } from '@/utils/requestQueue'
import { initEventBus, onEvent } from '@/utils/event-bus'
import { FloatingToast } from '../../utils/toast'
import { createStatusChip, waitForElement } from '../../utils/dom'
import { t } from '../../i18n'
import { warnLog, infoLog, errorLog, debugLog } from '@/utils/logger'
import { MUKAKU_CONFIG, NETWORK_CONFIG } from './config'
import { MukakuToastController } from './toast'
import { extractMvId, extractLinkedIdsFromDOM, imageFileName } from './dom'
import { getApiUrl, extractLinkedIdsFromPayload, shouldPersistProbe, extractListEntries, getListApiUrl } from './api'
import { probeCacheSet, probeCacheGet, probeCacheGetBulk, getWatchedIdSets, cleanupLegacyMukakuCaches } from './cache'
import { clearProcessedMarkers, createDebouncedScheduler, isDetailContextStale, shouldRefreshForEvent } from './refresh'
import { createSerialRunner } from './processing'
import { resolveCardState, type CardAction } from './resolve'

/** List-API fail cooldown: no retry for 30s after a failed fetch (prevents scan-storm request floods). */
const LIST_API_FAIL_COOLDOWN_MS = 30_000
/** Probe-failure retry cooldown: a card whose probe failed is retried only after 30s (and its processed marker is cleared so it is re-collected). */
const PROBE_FAIL_COOLDOWN_MS = 30_000
/** Per-scan card cap (hostile pages must not drive unbounded probes/state growth). */
const MAX_CARDS_PER_SCAN = 500
/** Session-cooldown set cap (beyond this, new no-association entries are dropped). */
const MAX_SESSION_NO_ASSOCIATION = 2000

class MukakuHandler {
  private queue: RequestQueue | null = null
  /** In-memory probe cache: mvId → linked IDs. LRU-limited via MUKAKU_CONFIG.PROBE_CACHE_MAX. */
  private probeCache = new Map<string, { doubanId: string | null; imdbId: string | null }>()
  /** Handler-level watched ID cache: provider → { movieDoubanIds, imdbIds, ts }. 30s TTL reduces dbGetAll calls. */
  private watchedIdCache: { movieDoubanIds: Set<string>; imdbIds: Set<string>; ts: number } | null = null
  /** Session-scoped cooldown: mvIds confirmed to have no douban/imdb association this page session. Cleared on resetForPage/cleanup. */
  private sessionNoAssociation = new Set<string>()
  /** Per-card probe-failure cooldown: mvId → ts; failed probes are retried only after the cooldown expires (and the processed marker is cleared so the card is re-collected). */
  private probeFailCooldown = new Map<string, number>()
  /** Generation counter for the watched-id cache: bumped by onRecordChange/resetForPage so an in-flight scan never resurrects an invalidated cache (R3). */
  private watchedCacheEpoch = 0
  /** List-API mapping cache: image filename → linked ids (keyed by sb:page, page-session scoped; failed fetches cool down 30s to prevent request storms). */
  private listMappingCache: { sb: string; map: Map<string, { doubanId: string; imdbId: string | null }> } | null = null
  /** Per-key (sb:page) list-API fail timestamps — one term's failure must not block another (O3). */
  private listMappingFailTs: Record<string, number> = {}
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
   * Probe linked IDs (cached).
   *
   * Failure semantics (GOAL 1): network error / timeout / non-200 / invalid
   * payload all THROW — no memory write, no IDB write, no session cooldown;
   * the card is re-probed on the next scan.
   * Persistence semantics (GOAL 2): persist only on a successful fetch with
   * >=1 valid id (gated by shouldPersistProbe). Confirmed no association
   * (both ids null) enters the session cooldown set only — never persisted.
   */
  private async probeLinkedIds(
    mvId: string
  ): Promise<{ doubanId: string | null; imdbId: string | null }> {
    if (!mvId) {
      return { doubanId: null, imdbId: null }
    }

    // 1. Session cooldown: confirmed no association this page session — skip network
    if (this.sessionNoAssociation.has(mvId)) {
      debugLog('[Mukaku] probe cooldown hit:', mvId)
      return { doubanId: null, imdbId: null }
    }

    // 1a. Failure cooldown: a recent failed probe is not retried within the window
    const failTs = this.probeFailCooldown.get(mvId)
    if (failTs !== undefined && Date.now() - failTs < PROBE_FAIL_COOLDOWN_MS) {
      return { doubanId: null, imdbId: null }
    }

    // 2. In-memory cache (fastest)
    if (this.probeCache.has(mvId)) {
      debugLog('[Mukaku] probe memory hit:', mvId)
      return this.probeCache.get(mvId)!
    }

    // 3. Persistent IDB cache (null-null entries are filtered as miss at the cache layer)
    const cached = await probeCacheGet(mvId)
    if (cached) {
      debugLog('[Mukaku] probe IDB hit:', mvId)
      const result = { doubanId: cached.doubanId, imdbId: cached.imdbId }
      this.probeCache.set(mvId, result)
      return result
    }

    // LRU eviction before write: drop the oldest entry when at capacity
    if (this.probeCache.size >= MUKAKU_CONFIG.PROBE_CACHE_MAX) {
      const oldestKey = this.probeCache.keys().next().value
      if (oldestKey !== undefined) this.probeCache.delete(oldestKey)
    }

    // 4. Queue the network request
    const extraction = await this.ensureQueue().enqueue(mvId, async () => {
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

    // 5. Dispatch by result semantics
    if (extraction.status === 'invalid') {
      // Unusable response = failure: no memory/IDB/cooldown write — re-probed next scan
      throw new Error('invalid payload')
    }
    if (shouldPersistProbe(extraction)) {
      this.probeCache.set(mvId, { doubanId: extraction.doubanId, imdbId: extraction.imdbId })
      await probeCacheSet(mvId, {
        doubanId: extraction.doubanId,
        imdbId: extraction.imdbId,
        ts: Date.now(),
      })
    } else {
      // Confirmed no association: session cooldown only (cleared on navigation/cleanup), never persisted
      if (this.sessionNoAssociation.size < MAX_SESSION_NO_ASSOCIATION) {
        this.sessionNoAssociation.add(mvId)
      }
    }
    // A successful probe clears any failure cooldown for this card
    this.probeFailCooldown.delete(mvId)
    return { doubanId: extraction.doubanId, imdbId: extraction.imdbId }
  }

  /**
   * List-API mapping (image-match fallback for linkless cards).
   *
   * Fetches getVideoList?sb=xxx → data.data[] (image/doub_id/IMDB_number) →
   * image-filename → linked-ids map. Cached per sb:page session; failed
   * fetches cool down for 30s; returns null when the page has no sb param.
   */
  private async getListMapping(): Promise<Map<string, { doubanId: string; imdbId: string | null }> | null> {
    const params = new URLSearchParams(location.search)
    const sb = params.get('sb')
    if (!sb) return null
    const page = params.get('page') || '1'
    const cacheKey = `${sb}:${page}`

    if (this.listMappingCache?.sb === cacheKey) return this.listMappingCache.map
    const failTs = this.listMappingFailTs[cacheKey]
    if (failTs !== undefined && Date.now() - failTs < LIST_API_FAIL_COOLDOWN_MS) return null

    try {
      const entries = await this.ensureQueue().enqueue(`list:${cacheKey}`, async () => {
        const response = await fetch(getListApiUrl(sb, page), {
          signal: AbortSignal.timeout(NETWORK_CONFIG.TIMEOUT_MS),
        })
        if (!response.ok) {
          throw new Error(t('mukaku.probe_failed', { status: response.status }))
        }
        const payload = await response.json()
        return extractListEntries(payload)
      })
      const map = new Map<string, { doubanId: string; imdbId: string | null }>()
      for (const entry of entries) {
        const key = imageFileName(entry.image)
        if (key) map.set(key, { doubanId: entry.doubanId, imdbId: entry.imdbId })
      }
      this.listMappingCache = { sb: cacheKey, map }
      infoLog('[Mukaku] list mapping:', map.size, 'entries for', sb)
      return map
    } catch (error: unknown) {
      this.listMappingFailTs[cacheKey] = Date.now()
      warnLog('[Mukaku] list API failed:', error)
      return null
    }
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
    // Best-effort one-shot cleanup of the legacy judgment-cache keys (idempotent, fire-and-forget)
    void cleanupLegacyMukakuCaches().catch(() => {})
  }

  /**
   * record event callback: clear processed markers first (otherwise handled cards are
   * skipped forever and a re-run is a no-op), then invalidate watchedIdCache, and
   * finally re-run the scan after a 300ms debounce.
   */
  private onRecordChange(data: unknown): void {
    if (!shouldRefreshForEvent(data)) return
    clearProcessedMarkers(document)
    // Bump the epoch so any in-flight scan does not resurrect the cache we are about
    // to invalidate (R3); the field itself is also nulled for immediate reads.
    this.watchedCacheEpoch++
    this.watchedIdCache = null
    // NOTE: sessionNoAssociation is intentionally NOT cleared here — a record event
    // (e.g. user added a douban record for a card previously confirmed no-association)
    // must not re-trigger probing; the cooldown only expires on page navigation.
    this.refreshScheduler.schedule(() => this.runRefresh())
  }

  /** Event-triggered full rescan (serialized via the runner to avoid interleaving with page scans). */
  private runRefresh(): void {
    this.runner.run(() => this.processVisibleCards())
  }

  /**
   * Handle the detail page.
   */
  public async handleDetailPage(): Promise<void> {
    this.resetForPage()
    this.activate()
    const mvId = extractMvId(location.href)
    if (!mvId) return

    // Wait for the detail info area (shared impl in utils/dom)
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
   * Batch-fetch watched-id sets with epoch-guarded write-back (shared by
   * renderDetailState + processVisibleCards — extracted 2026-08-07 D2 to
   * eliminate the byte-identical duplicate).
   *
   * R2: a failed fetch must NOT be cached — the cache stays untouched so the
   * next scan retries; the caller degrades to empty sets.
   * R3: the write-back is epoch-guarded — if a record event invalidated the
   * cache while we awaited, we skip the write-back so the stale cache is not
   * resurrected.
   */
  private async refreshWatchedIdSets(): Promise<{ movieDoubanIds: Set<string>; imdbIds: Set<string> }> {
    const epoch = this.watchedCacheEpoch
    const prevWatchedCache = this.watchedIdCache
    let watchedSets: { movieDoubanIds: Set<string>; imdbIds: Set<string> }
    try {
      watchedSets = await getWatchedIdSets(prevWatchedCache)
    } catch (error: unknown) {
      errorLog('[Mukaku] watchedIds query failed — degrade to empty sets, cache not written:', error)
      watchedSets = { movieDoubanIds: new Set<string>(), imdbIds: new Set<string>() }
    }
    const now = Date.now()
    if (this.watchedCacheEpoch === epoch) {
      const watchedCacheFresh =
        prevWatchedCache !== null && now - prevWatchedCache.ts < MUKAKU_CONFIG.WATCHED_ID_CACHE_TTL
      this.watchedIdCache = {
        ...watchedSets,
        ts: watchedCacheFresh ? prevWatchedCache.ts : now,
      }
    }
    return watchedSets
  }

  /**
   * Render the detail-page status chip (realtime, read-only — never writes caches).
   */
  private async renderDetailState(
    infoRoot: HTMLElement,
    mvId: string
  ): Promise<void> {
    // Find or create the status slot
    let slot = infoRoot.querySelector('.umm-mukaku-status')
    if (!slot) {
      slot = document.createElement('div')
      slot.className = 'umm-mukaku-status'
      infoRoot.prepend(slot)
    }

    // Extract linked ids from the DOM
    let linkedIds = extractLinkedIdsFromDOM(document)

    // Fall back to the API probe when the DOM carries no ids
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

    // Realtime watched-id sets (getWatchedIdSets owns the 30s TTL; ts refresh matches
    // processVisibleCards). Epoch-guarded write-back (R3) + graceful failure (F1):
    // a DB error degrades to empty sets without failing the detail render.
    const { movieDoubanIds, imdbIds } = await this.refreshWatchedIdSets()

    // Match against local records (read-only decision — this method writes no cache)
    if (linkedIds.doubanId || linkedIds.imdbId) {
      const matched =
        (linkedIds.doubanId && movieDoubanIds.has(linkedIds.doubanId)) ||
        (linkedIds.imdbId && imdbIds.has(linkedIds.imdbId))

      slot.innerHTML = ''
      if (matched) {
        const chip = createStatusChip('movie', 2, 0, t('mukaku.match_found'))
        slot.appendChild(chip)
      } else {
        const chip = createStatusChip('movie', 0, 0, t('mukaku.no_match'))
        slot.appendChild(chip)
      }
    } else {
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
    this.sessionNoAssociation.clear()
    this.probeFailCooldown.clear()
    this.watchedCacheEpoch++
    this.listMappingCache = null
    this.listMappingFailTs = {}
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

    // Collect unprocessed cards; linkless cards (search-page div.video-card, mvId
    // lives only in Vue state) are parked in noIdCards for the list-API fallback.
    const unprocessed: Array<{ cardEl: HTMLElement; mvId: string }> = []
    const noIdCards: HTMLElement[] = []
    for (const card of Array.from(cards)) {
      // Per-scan cap: hostile pages must not drive unbounded probes/state growth (S2)
      if (unprocessed.length + noIdCards.length >= MAX_CARDS_PER_SCAN) break
      const cardEl = card as HTMLElement
      if (cardEl.getAttribute('data-umm-mukaku-processed') === 'true') continue
      const mvId = extractMvId(cardEl)
      if (!mvId) {
        noIdCards.push(cardEl)
        continue
      }
      cardEl.setAttribute('data-umm-mukaku-processed', 'true')
      unprocessed.push({ cardEl, mvId })
    }

    // List-API image matching: one getVideoList request yields the linked ids for
    // the whole page (data.data[] carries image/doub_id/IMDB_number, verified 2026-08-07).
    if (noIdCards.length > 0) {
      const mapping = await this.getListMapping()
      if (mapping) {
        for (const cardEl of noIdCards) {
          const imgEl = cardEl.querySelector('img')
          const imgSrc = imgEl?.getAttribute('src') || imgEl?.getAttribute('data-src') || ''
          const key = imageFileName(imgSrc)
          const entry = key ? mapping.get(key) : undefined
          if (!entry) continue
          cardEl.setAttribute('data-umm-mukaku-processed', 'true')
          const mvId = entry.doubanId
          unprocessed.push({ cardEl, mvId })
          // Mapping known (successful list-API data) → fill memory; persist only when not already held (O1)
          if (!this.probeCache.has(mvId)) {
            this.probeCache.set(mvId, { doubanId: entry.doubanId, imdbId: entry.imdbId })
            void probeCacheSet(mvId, {
              doubanId: entry.doubanId,
              imdbId: entry.imdbId,
              ts: Date.now(),
            }).catch(() => {})
          }
        }
      }
    }

    debugLog('[Mukaku] scan: found', cards.length, 'cards,', unprocessed.length, 'unprocessed,', noIdCards.length, 'linkless')
    if (unprocessed.length === 0) return

    // Batch-fetch watched IDs: getWatchedIdSets has its own 30s TTL (cache hit → 0 DB
    // calls). On hit keep the original ts (TTL continues); on refill refresh ts.
    // R2/R3 semantics live in refreshWatchedIdSets (shared with renderDetailState).
    const { movieDoubanIds, imdbIds } = await this.refreshWatchedIdSets()
    debugLog('[Mukaku] watched ids: douban=', movieDoubanIds.size, 'imdb=', imdbIds.size)

    // Batch-prefill probe cache: one dbGetBulk for cards that would reach 'needs-probe',
    // replacing the per-card probeCacheGet in the loop (S2: N serial DB messages → 1).
    // Filter conditions match resolveCardState's needs-probe decision.
    const needsProbeIds: string[] = []
    for (const { mvId } of unprocessed) {
      // Skip cards in session cooldown or failure cooldown; skip cards already in the in-memory probeCache
      if (this.sessionNoAssociation.has(mvId)) continue
      const failTs = this.probeFailCooldown.get(mvId)
      if (failTs !== undefined && Date.now() - failTs < PROBE_FAIL_COOLDOWN_MS) continue
      if (this.probeCache.has(mvId)) continue
      needsProbeIds.push(mvId)
    }
    const bulkProbes = await probeCacheGetBulk(needsProbeIds).catch((error: unknown) => {
      // DB bulk read failure must not abort the scan — cards fall through to network probes.
      errorLog('[Mukaku] probe prefill failed — fall through to network:', error)
      return new Map<string, { doubanId: string | null; imdbId: string | null; ts: number }>()
    })
    for (const [mvId, entry] of bulkProbes) {
      this.probeCache.set(mvId, { doubanId: entry.doubanId, imdbId: entry.imdbId })
    }
    debugLog('[Mukaku] probe prefill:', bulkProbes.size, 'hits of', needsProbeIds.length)

    // Phase 1 — resolve every card; fire all network probes CONCURRENTLY.
    // The RequestQueue enforces maxConcurrent=10 + random delay; awaiting each
    // probe inside the loop would serialize them to 1 at a time, starving the
    // queue (the pre-campaign bug this restores real concurrency for).
    const actions = new Map<string, CardAction>()
    const probePromises = new Map<string, Promise<{ doubanId: string | null; imdbId: string | null } | null>>()
    for (const { mvId } of unprocessed) {
      const action = resolveCardState({
        probe: this.probeCache.get(mvId) ?? null,
        noAssociation: this.sessionNoAssociation.has(mvId),
        watchedDouban: movieDoubanIds,
        watchedImdb: imdbIds,
      })
      debugLog('[Mukaku] resolve', mvId, '→', action)
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
          break
        case 'skip':
          // No association / no match: nothing to write
          break
        case 'needs-probe': {
          const linkedIds = await probePromises.get(mvId)!
          if (linkedIds === null) {
            // Probe failed (network/timeout/invalid payload) — no cache write, no
            // session cooldown. R4: clear the processed marker + set a short failure
            // cooldown so the card is RE-COLLECTED and re-probed after the window
            // (GOAL 1: failures are re-probed, never permanently skipped).
            warnLog('[Mukaku] Probe failed for card', mvId)
            this.probeFailCooldown.set(mvId, Date.now())
            if (this.probeFailCooldown.size > 1000) this.probeFailCooldown.clear()
            cardEl.removeAttribute('data-umm-mukaku-processed')
            break
          }
          debugLog('[Mukaku] probe', mvId, '→ douban:', linkedIds.doubanId, 'imdb:', linkedIds.imdbId)
          if (linkedIds.doubanId || linkedIds.imdbId) {
            const matched =
              (linkedIds.doubanId && movieDoubanIds.has(linkedIds.doubanId)) ||
              (linkedIds.imdbId && imdbIds.has(linkedIds.imdbId))
            if (matched) {
              cardEl.classList.add('umm-dimmed')
            }
            // not matched → nothing (no write)
          }
          // both ids null → nothing (cooldown was registered inside probeLinkedIds)
          break
        }
      }
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
    this.sessionNoAssociation.clear()
    this.probeFailCooldown.clear()
    this.listMappingCache = null
    this.listMappingFailTs = {}
  }
}

export { MukakuHandler }