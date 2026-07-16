/**
 * Mukaku 视频平台集成模块
 * 
 * 功能：
 * - 详情页观看状态显示
 * - 列表页批量探测
 * - API 链路查询
 * - 本地缓存管理（已看/未看 TTL）
 */

import { RequestQueue } from '@/utils/requestQueue'
import { FloatingToast, PersistentToast } from '../utils/toast'
import { createStatusChip } from '../utils/dom'
import { t } from '../i18n'
import { Store } from '@/features/database'

// ─── 全局 Toast 单例控制器 ──────────────────────────────────
/**
 * 确保全局只有一个 Mukaku toast 实例
 * 解决多个 toast 同时出现的问题
 */
class MukakuToastController {
  private static instance: PersistentToast | null = null
  private static closeTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * 获取或创建 toast 实例
   */
  static getOrCreate(): PersistentToast {
    // 如果已有实例且未关闭，直接复用
    if (MukakuToastController.instance) {
      // 清除待关闭的定时器（如果有新任务到来）
      if (MukakuToastController.closeTimer) {
        clearTimeout(MukakuToastController.closeTimer)
        MukakuToastController.closeTimer = null
      }
      return MukakuToastController.instance
    }

    // 创建新实例
    MukakuToastController.instance = FloatingToast.persistent(t('mukaku.toast_title'), 'loading')
    return MukakuToastController.instance
  }

  /**
   * 更新 toast 内容
   */
  static update(message: string, progress: number): void {
    const toast = MukakuToastController.getOrCreate()
    toast.update({ message, progress })
  }

  /**
   * 显示成功状态（保持显示，不自动关闭）
   */
  static success(message: string): void {
    const toast = MukakuToastController.instance
    if (!toast) return

    // 使用 successKeep() 显示成功状态但不自动关闭
    toast.successKeep(message)
    
    // toast 会保持显示，直到下次创建新 toast 或调用 close()
  }

  /**
   * 显示错误状态并延迟关闭
   */
  static error(message: string): void {
    const toast = MukakuToastController.instance
    if (!toast) return

    toast.error(message)
    MukakuToastController.closeTimer = setTimeout(() => {
      MukakuToastController.instance = null
      MukakuToastController.closeTimer = null
    }, 3000)
  }

  /**
   * 立即关闭并清理
   */
  static close(): void {
    if (MukakuToastController.closeTimer) {
      clearTimeout(MukakuToastController.closeTimer)
      MukakuToastController.closeTimer = null
    }
    if (MukakuToastController.instance) {
      MukakuToastController.instance.close()
      MukakuToastController.instance = null
    }
  }

  /**
   * 检查是否有活跃的 toast
   */
  static hasActive(): boolean {
    return MukakuToastController.instance !== null
  }
}

/**
 * TTL cache: serialize arbitrary data into ttl_cache store.
 * The underlying IndexedDB accepts any value; we cast to bypass StoreRecord type.
 */
const TTL = 'ttl_cache'

/** Store an array of strings as a set. */
async function setAddItem(setKey: string, id: string): Promise<void> {
  const raw: any = await Store.dbGet(TTL, setKey)
  const arr: string[] = Array.isArray(raw) ? raw : []
  if (!arr.includes(id)) arr.push(id)
  await (Store as any).dbPut(TTL, setKey, arr)
}

/** Check if a set contains an id. */
async function setHasItem(setKey: string, id: string): Promise<boolean> {
  const raw: any = await Store.dbGet(TTL, setKey)
  return Array.isArray(raw) && raw.includes(id)
}

/** Delete an item from a set. */
async function setDeleteItem(setKey: string, id: string): Promise<void> {
  const raw: any = await Store.dbGet(TTL, setKey)
  const arr: string[] = Array.isArray(raw) ? raw : []
  const idx = arr.indexOf(id)
  if (idx !== -1) arr.splice(idx, 1)
  await (Store as any).dbPut(TTL, setKey, arr)
}

/** Add an expiring id (stored as map of id → expiry timestamp). */
async function expMapAdd(mapKey: string, id: string, ttlMs: number): Promise<void> {
  const raw: any = await Store.dbGet(TTL, mapKey)
  const map: Record<string, number> = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {}
  map[id] = Date.now() + ttlMs
  await (Store as any).dbPut(TTL, mapKey, map)
}

/** Check if an id exists in expiring map and hasn't expired. */
async function expMapHas(mapKey: string, id: string): Promise<boolean> {
  const raw: any = await Store.dbGet(TTL, mapKey)
  const map: Record<string, number> = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {}
  const expiry = map[id]
  return expiry !== undefined && Date.now() < expiry
}

/**
 * Get watched IDs (status >= 2) for a given type + provider.
 * Uses handler-level cache with 30s TTL to avoid repeated dbGetAll calls.
 */
async function getIdSet(type: string, provider: string, cache?: { movieDoubanIds: Set<string>; imdbIds: Set<string>; ts: number } | null): Promise<Set<string>> {
  // Use handler-level cache if available and fresh
  if (cache) {
    const now = Date.now()
    if (now - cache.ts < MUKAKU_CONFIG.WATCHED_ID_CACHE_TTL) {
      if (provider === 'douban') return cache.movieDoubanIds
      if (provider === 'imdb') return cache.imdbIds
    }
  }

  const storeName = `${provider}_records`
  const entries = await Store.dbGetAll(storeName)
  const ids = new Set<string>()
  const prefix = `${type}::`
  for (const { key, record } of entries) {
    if (key.startsWith(prefix) && record.status >= 2) {
      ids.add(key.slice(prefix.length))
    }
  }
  return ids
}

/** Probe cache entry structure. */
interface ProbeCacheEntry {
  doubanId: string | null
  imdbId: string | null
  ts: number
}

/** Save probe result to IndexedDB persistent cache. */
async function probeCacheSet(mvId: string, entry: ProbeCacheEntry): Promise<void> {
  await (Store as any).dbPut(TTL, `${MUKAKU_CONFIG.PROBE_CACHE_KEY}:${mvId}`, entry)
}

/** Get probe result from IndexedDB persistent cache (returns null if expired or missing). */
async function probeCacheGet(mvId: string): Promise<ProbeCacheEntry | null> {
  const raw: any = await Store.dbGet(TTL, `${MUKAKU_CONFIG.PROBE_CACHE_KEY}:${mvId}`)
  if (!raw || typeof raw !== 'object' || typeof raw.ts !== 'number') return null
  if (Date.now() - raw.ts > MUKAKU_CONFIG.PROBE_CACHE_TTL_MS) return null
  return raw as ProbeCacheEntry
}

// ==================== 常量配置 ====================

const MUKAKU_CONFIG = {
  API_PATH: '/prod/api/v1/getVideoDetail',
  LIST_API_PATH: '/prod/api/v1/getVideoList',
  APP_ID: '83768d9ad4',
  IDENTITY: '23734adac0301bccdcb107c4aa21f96c',
  WATCHED_SET_KEY: 'umm:cache:mukaku:watched',
  UNWATCHED_TTL_KEY: 'umm:cache:mukaku:unwatched',
  UNWATCHED_TTL_MS: 60 * 60 * 1000, // 1小时
  PROBE_CACHE_KEY: 'umm:cache:mukaku:probe',
  PROBE_CACHE_TTL_MS: 7 * 24 * 60 * 60 * 1000, // 7天
  // 内存缓存限制
  WATCHED_ID_CACHE_TTL: 30_000,        // watchedIdCache 30s TTL
  PROBE_CACHE_MAX: 500,                // probeCache 最大条目
}

const NETWORK_CONFIG = {
  MAX_CONCURRENT: 10,
  MIN_DELAY_MS: 420,
  MAX_DELAY_MS: 980,
  TIMEOUT_MS: 15000,
}

// ==================== Mukaku 类 ====================

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
   * 提取 Mukaku 视频 ID
   */
  private extractMvId(value: string | HTMLElement): string | null {
    const raw = typeof value === 'string' ? value : value.getAttribute('href') || value.textContent || ''
    const match = raw.match(/\/mv\/(\d+)/i)
    return match ? match[1] : null
  }

  /**
   * 从 DOM 中提取关联的 Douban/IMDb ID
   */
  private extractLinkedIdsFromDOM(root: HTMLElement | Document): {
    doubanId: string | null
    imdbId: string | null
  } {
    const result = { doubanId: null as string | null, imdbId: null as string | null }
    
    const links = root.querySelectorAll('a[href*="douban.com/subject/"], a[href*="imdb.com/title/"]')
    
    for (const link of Array.from(links)) {
      const anchor = link as HTMLAnchorElement
      const href = anchor.href || anchor.getAttribute('href') || ''
      
      if (!result.doubanId) {
        const match = href.match(/movie\.douban\.com\/subject\/(\d+)/i)
        if (match) result.doubanId = match[1]
      }
      
      if (!result.imdbId) {
        const match = href.match(/imdb\.com\/title\/((?:tt)?\d+)/i)
        if (match) {
          const id = match[1]
          result.imdbId = id.startsWith('tt') ? id : `tt${id}`
        }
      }
      
      if (result.doubanId && result.imdbId) break
    }
    
    return result
  }

  /**
   * 从 API 响应中提取关联 ID
   */
  private extractLinkedIdsFromPayload(payload: any): {
    doubanId: string | null
    imdbId: string | null
  } {
    const data = payload?.data || payload || {}
    
    return {
      doubanId: data.doub_id ? String(data.doub_id) : null,
      imdbId: data.IMDB_number
        ? (() => {
            const id = String(data.IMDB_number)
            return id.startsWith('tt') ? id : `tt${id}`
          })()
        : null,
    }
  }

  /**
   * 构建 API URL
   */
  private getApiUrl(mvId: string): string {
    const url = new URL(MUKAKU_CONFIG.API_PATH, 'https://web5.mukaku.com')
    url.searchParams.set('id', mvId)
    url.searchParams.set('app_id', MUKAKU_CONFIG.APP_ID)
    url.searchParams.set('identity', MUKAKU_CONFIG.IDENTITY)
    return url.href
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
      const response = await fetch(this.getApiUrl(mvId), {
        method: 'GET',
        signal: AbortSignal.timeout(NETWORK_CONFIG.TIMEOUT_MS),
      })

      if (!response.ok) {
        throw new Error(t('mukaku.probe_failed', { status: response.status }))
      }

      const payload = await response.json()
      return this.extractLinkedIdsFromPayload(payload)
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
    const mvId = this.extractMvId(location.href)
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
    let linkedIds = this.extractLinkedIdsFromDOM(document)

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
      const mvId = this.extractMvId(cardEl)
      if (!mvId) continue
      cardEl.setAttribute('data-umm-mukaku-processed', 'true')
      unprocessed.push({ cardEl, mvId })
    }

    if (unprocessed.length === 0) return

    this.isProcessing = true

    try {
      const watchedRaw: any = await Store.dbGet('ttl_cache', MUKAKU_CONFIG.WATCHED_SET_KEY)
      this.batchWatchedSet = Array.isArray(watchedRaw) ? watchedRaw : []
      const unwatchedRaw: any = await Store.dbGet('ttl_cache', MUKAKU_CONFIG.UNWATCHED_TTL_KEY)
      this.batchUnwatchedMap = (unwatchedRaw && typeof unwatchedRaw === 'object' && !Array.isArray(unwatchedRaw))
        ? (unwatchedRaw as Record<string, number>)
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

// ==================== 导出单例方法 ====================

const handler = new MukakuHandler()

export async function handleMukakuDetailPage(): Promise<void> {
  await handler.handleDetailPage()
}

export async function handleMukakuListPage(): Promise<void> {
  await handler.handleListPage()
}

export function cleanupMukaku(): void {
  handler.cleanup()
}
