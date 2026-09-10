/**
 * 色花堂详情懒加载调度（ADR-024 D3）。
 *
 * 链路：卡片进入视口（IntersectionObserver，rootMargin 预取一屏）
 *   → 同批卡片合并为**一次**缓存批量查询（L1 内存 + IndexedDB，单条消息）
 *   → miss 才 fetch 详情页（RequestQueue 并发 4 + 8s 超时）
 *   → 回填卡片（onDetail 回调）+ 写缓存。
 *
 * copy-all 补抓走 loadNow 直载通道（同一缓存与队列，绕过 IO 等待）。
 * 幂等：每卡 data-umm-detail 状态机（'' → loading → done），重复触发合并
 * 到同一 Promise。
 */

import { RequestQueue } from '@/utils/requestQueue'
import { extractThreadIdFromUrl } from '@/entrypoints/content/handlers/sehuatang-extract'
import { getCachedDetails, putCachedDetails } from './detail-cache'

export interface CardDetail {
  imageUrl: string | null
  magnetLink: string | null
}

/** 详情加载状态机标记：'' → loading → done（跨模块读取，如点击跳转判定）。 */
export const DETAIL_FLAG = 'data-umm-detail'

// 详情页抓取并发限流：并发 4 + 8s 超时（N+1 风暴的收敛阀）。
const detailQueue = new RequestQueue({ maxConcurrent: 4, minDelayMs: 0, maxDelayMs: 0 })

/**
 * 在途 fetch 的 AbortController 登记表（模块级单例：同一时刻只有一个活跃
 * loader —— runSehuatangOverlayApp 先 destroy 旧 loader 再建新的）。
 * destroy() 时统一 abort，避免页面离开后请求悬挂。
 */
const activeAborters = new Set<AbortController>()

async function fetchDetailPage(url: string): Promise<CardDetail> {
  return detailQueue.enqueue(url, async () => {
    const controller = new AbortController()
    activeAborters.add(controller)
    const timer = setTimeout(() => controller.abort(), 8000)
    try {
      const res = await fetch(url, { credentials: 'include', signal: controller.signal })
      const html = await res.text()
      const doc = new DOMParser().parseFromString(html, 'text/html')

      const imgEl = doc.querySelector('ignore_js_op > img')
      const imageUrl = imgEl?.getAttribute('zoomfile') || imgEl?.getAttribute('file') || null

      const magnetEl = doc.querySelector('.blockcode > div > ol > li')
      const magnetLink = magnetEl?.textContent?.trim() || null

      return { imageUrl, magnetLink }
    } catch {
      return { imageUrl: null, magnetLink: null }
    } finally {
      clearTimeout(timer)
      activeAborters.delete(controller)
    }
  })
}

export interface DetailLoader {
  /** 观察卡片：进入视口才加载（幂等）。 */
  watch(card: HTMLElement): void
  /** 立即加载（copy-all 补抓）；已加载/加载中合并到同一 Promise。 */
  loadNow(card: HTMLElement): Promise<void>
  /** 已加载完成的卡片数（copy-all 进度展示）。 */
  loadedCount(): number
  /** 断开观察器（页面销毁）。在途 fetch 自然完结，卡片已摘除时回调跳过。 */
  destroy(): void
}

export function createDetailLoader(onDetail: (card: HTMLElement, detail: CardDetail) => void): DetailLoader {
  const inflight = new Map<HTMLElement, Promise<void>>()
  /** 同 URL 归并：置顶帖 / 分页重复行指向同一详情页时只 fetch 一次。 */
  const detailByUrl = new Map<string, Promise<CardDetail>>()
  /** 在途卡的 resolve 句柄（loader 级，便于 destroy 时统一解除挂起）。 */
  const resolversByCard = new Map<HTMLElement, () => void>()
  let loaded = 0
  let destroyed = false

  /** 按 URL 记忆 fetch Promise（loader 生命周期内有效；fetchDetailPage 内部吞错不 reject）。 */
  const loadDetail = (url: string): Promise<CardDetail> => {
    const existing = detailByUrl.get(url)
    if (existing) return existing
    const promise = fetchDetailPage(url)
    detailByUrl.set(url, promise)
    return promise
  }

  /** 批量加载：缓存查询合并为一条消息，fetch 逐卡走队列。 */
  const loadBatch = async (cards: HTMLElement[]): Promise<void> => {
    const fresh = cards.filter((c) => !inflight.has(c) && c.getAttribute(DETAIL_FLAG) !== 'done')
    if (fresh.length === 0) return

    const resolvers = resolversByCard
    for (const card of fresh) {
      inflight.set(card, new Promise<void>((resolve) => resolvers.set(card, resolve)))
      card.setAttribute(DETAIL_FLAG, 'loading')
    }
    const finish = (card: HTMLElement) => {
      card.setAttribute(DETAIL_FLAG, 'done')
      // 已摘除的卡（翻页/重入致 DOM 替换）不计入进度，避免 copy-all 进度虚高。
      if (card.isConnected) loaded++
      inflight.delete(card)
      resolvers.get(card)?.()
      resolvers.delete(card)
    }

    // 1. 缓存批量查询（单条消息；缓存层失败降级为空 miss，不抛错）。
    const tidByCard = new Map<HTMLElement, string>()
    for (const card of fresh) {
      const tid = extractThreadIdFromUrl(card.getAttribute('data-url') ?? '')
      if (tid) tidByCard.set(card, tid)
    }
    const cached = tidByCard.size > 0 ? await getCachedDetails(Array.from(tidByCard.values())) : new Map()
    if (destroyed) return

    const misses: HTMLElement[] = []
    for (const card of fresh) {
      const tid = tidByCard.get(card)
      const hit = tid ? cached.get(tid) : undefined
      if (hit) {
        if (card.isConnected) onDetail(card, { imageUrl: hit.imageUrl, magnetLink: hit.magnetLink })
        finish(card)
      } else {
        misses.push(card)
      }
    }

    // 2. miss → fetch（同 URL 归并 + RequestQueue 并发收敛）→ 回填 + 写缓存。
    await Promise.all(misses.map(async (card) => {
      const url = card.getAttribute('data-url') ?? ''
      if (!url) {
        finish(card)
        return
      }
      const detail = await loadDetail(url)
      if (card.isConnected) onDetail(card, detail)
      const tid = tidByCard.get(card)
      // 命中的详情数据即使卡片已摘除也照常入缓存（可复用，成本为零）。
      if (tid && (detail.imageUrl || detail.magnetLink)) {
        putCachedDetails([{ tid, imageUrl: detail.imageUrl, magnetLink: detail.magnetLink, cachedAt: Date.now() }])
      }
      finish(card)
    }))
  }

  const io = new IntersectionObserver((entries) => {
    const batch: HTMLElement[] = []
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      const card = entry.target as HTMLElement
      io.unobserve(card)
      batch.push(card)
    }
    if (batch.length > 0) void loadBatch(batch)
  }, { root: null, rootMargin: '100% 0px' })

  return {
    watch(card: HTMLElement) {
      if (card.getAttribute(DETAIL_FLAG)) return
      io.observe(card)
    },
    loadNow(card: HTMLElement) {
      const existing = inflight.get(card)
      if (existing) return existing
      void loadBatch([card])
      return inflight.get(card) ?? Promise.resolve()
    },
    loadedCount() {
      return loaded
    },
    destroy() {
      destroyed = true
      io.disconnect()
      // 取消在途 fetch（页面离开/重入时不留悬挂请求）。
      for (const controller of activeAborters) controller.abort()
      activeAborters.clear()
      // 销毁后不会再走 finish()：把在途 Promise 全部 resolve 并清表，
      // 否则 `if (destroyed) return` 提前分支会让 loadNow 的调用方永久 await。
      for (const resolve of resolversByCard.values()) resolve()
      resolversByCard.clear()
      inflight.clear()
    },
  }
}
