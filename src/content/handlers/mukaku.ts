/**
 * Mukaku 视频平台集成模块
 * 
 * 功能：
 * - 详情页观看状态显示
 * - 列表页批量探测
 * - API 链路查询
 * - 本地缓存管理（已看/未看 TTL）
 */

import { RequestQueue } from '@/shared/utils/requestQueue'
import { FloatingToast } from '../utils/toast'
import { createStatusChip } from '../utils/dom'
import { Store } from '@/shared'

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

/** Get IDs with status ≥ 1 for a given type + provider. Replaces old Store.getIdSet. */
async function getIdSet(type: string, provider: string): Promise<Set<string>> {
  const storeName = `${provider}_records`
  const entries = await Store.dbGetAll(storeName)
  const ids = new Set<string>()
  const prefix = `${type}::`
  for (const { key, record } of entries) {
    if (key.startsWith(prefix) && record.status >= 1) {
      ids.add(key.slice(prefix.length))
    }
  }
  return ids
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
}

const NETWORK_CONFIG = {
  MAX_CONCURRENT: 2,
  MIN_DELAY_MS: 420,
  MAX_DELAY_MS: 980,
  TIMEOUT_MS: 15000,
}

// ==================== Mukaku 类 ====================

class MukakuHandler {
  private queue: RequestQueue | null = null
  private probeCache = new Map<string, { doubanId: string | null; imdbId: string | null }>()
  private listObserver: MutationObserver | null = null

  /**
   * 确保请求队列存在
   */
  private ensureQueue(): RequestQueue {
    if (this.queue) return this.queue

    this.queue = new RequestQueue({
      maxConcurrent: NETWORK_CONFIG.MAX_CONCURRENT,
      minDelayMs: NETWORK_CONFIG.MIN_DELAY_MS,
      maxDelayMs: NETWORK_CONFIG.MAX_DELAY_MS,
      onStateChange: ({ queued, active, currentKey }) => {
        if (!queued && !active) return
        
        const parts: string[] = []
        parts.push(`并发 ${active}/${NETWORK_CONFIG.MAX_CONCURRENT}`)
        parts.push(`排队 ${queued}`)
        if (currentKey) {
          parts.push(`当前 ${currentKey}`)
        }
        
        FloatingToast.info('Mukaku 链路队列中', parts.join(' · '))
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

    // 检查缓存
    if (this.probeCache.has(mvId)) {
      return this.probeCache.get(mvId)!
    }

    // 通过队列执行请求
    const linkedIds = await this.ensureQueue().enqueue(mvId, async () => {
      const response = await fetch(this.getApiUrl(mvId), {
        method: 'GET',
        signal: AbortSignal.timeout(NETWORK_CONFIG.TIMEOUT_MS),
      })

      if (!response.ok) {
        throw new Error(`Mukaku 探测失败 [${response.status}]`)
      }

      const payload = await response.json()
      return this.extractLinkedIdsFromPayload(payload)
    })

    // 缓存结果
    this.probeCache.set(mvId, linkedIds)
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
      FloatingToast.error('Mukaku 详情探测失败', String(error))
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
      const chip = createStatusChip('movie', 2, 0, '命中本地 Mukaku 关联缓存')
      slot.appendChild(chip)
      return
    }

    // 检查未看缓存
    if (await this.isCachedUnwatched(mvId)) {
      slot.innerHTML = ''
      const chip = createStatusChip('movie', 0, 0, '最近探测未命中本地影视记录')
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
        FloatingToast.error('Mukaku API 探测失败', String(error))
        return
      }
    }

    // 根据关联 ID 匹配本地记录
    if (linkedIds.doubanId || linkedIds.imdbId) {
      const movieDoubanIds = await getIdSet('movie', 'douban')
      const imdbIds = await getIdSet('movie', 'imdb')

      const matched =
        (linkedIds.doubanId && movieDoubanIds.has(linkedIds.doubanId)) ||
        (linkedIds.imdbId && imdbIds.has(linkedIds.imdbId))

      if (matched) {
        await this.markWatched(mvId)
        slot.innerHTML = ''
        const chip = createStatusChip('movie', 2, 0, '通过 Mukaku 链路匹配到本地记录')
        slot.appendChild(chip)
      } else {
        await this.markUnwatched(mvId)
        slot.innerHTML = ''
        const chip = createStatusChip('movie', 0, 0, 'Mukaku 链路未匹配到本地记录')
        slot.appendChild(chip)
      }
    } else {
      await this.markUnwatched(mvId)
      slot.innerHTML = ''
      const chip = createStatusChip('movie', 0, 0, '无法获取关联 ID')
      slot.appendChild(chip)
    }
  }

  /**
   * 处理列表页
   */
  public async handleListPage(): Promise<void> {
    // 监听新卡片出现
    this.listObserver = new MutationObserver(() => {
      this.processVisibleCards()
    })

    this.listObserver.observe(document.body, {
      childList: true,
      subtree: true,
    })

    // 立即处理一次
    await this.processVisibleCards()
  }

  /**
   * 处理可见的视频卡片
   */
  private async processVisibleCards(): Promise<void> {
    const cards = document.querySelectorAll('.video-card')
    
    for (const card of Array.from(cards)) {
      const cardEl = card as HTMLElement
      
      // 跳过已处理的卡片
      if (cardEl.getAttribute('data-umm-mukaku-processed') === 'true') continue
      
      // 提取 mvId
      const mvId = this.extractMvId(cardEl)
      if (!mvId) continue

      // 标记为已处理
      cardEl.setAttribute('data-umm-mukaku-processed', 'true')

      // 检查缓存
      if (await this.isCachedWatched(mvId)) {
        cardEl.classList.add('umm-dimmed')
        continue
      }

      if (await this.isCachedUnwatched(mvId)) {
        continue
      }

      // 探测关联 ID
      try {
        const linkedIds = await this.probeLinkedIds(mvId)

        // 匹配本地记录
        if (linkedIds.doubanId || linkedIds.imdbId) {
          const movieDoubanIds = await getIdSet('movie', 'douban')
          const imdbIds = await getIdSet('movie', 'imdb')

          const matched =
            (linkedIds.doubanId && movieDoubanIds.has(linkedIds.doubanId)) ||
            (linkedIds.imdbId && imdbIds.has(linkedIds.imdbId))

          if (matched) {
            await this.markWatched(mvId)
            cardEl.classList.add('umm-dimmed')
          } else {
            await this.markUnwatched(mvId)
          }
        } else {
          await this.markUnwatched(mvId)
        }
      } catch (error) {
        console.error('[Mukaku] Card processing failed:', error)
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
    this.queue = null
    this.probeCache.clear()
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
