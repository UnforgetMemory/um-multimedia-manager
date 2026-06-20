/**
 * PT 站点扫描队列
 * 后台请求详情页并提取平台 ID，使用信号量控制并发
 */

import { Store } from '@/features/database'
import type { PtIdCacheEntry } from '@/types'
import type { SiteScannerConfig } from '../types'
import { Semaphore } from './semaphore'
import { SITE_CONFIGS } from '../config/sites'

const ALLOWED_ORIGINS = new Set<string>(
  SITE_CONFIGS.flatMap(config => [`https://${config.domain}`, `http://${config.domain}`]),
)

function validateFetchUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
    return ALLOWED_ORIGINS.has(parsed.origin)
  } catch {
    return false
  }
}

/** 扫描任务 */
export interface ScanTask {
  /** 详情页 URL */
  url: string
  /** 站点配置 */
  config: SiteScannerConfig
  /** 优先级（数字越小优先级越高） */
  priority?: number
}

/** 扫描结果 */
export interface ScanResult {
  /** 详情页 URL */
  url: string
  /** 提取的 ID */
  entry: PtIdCacheEntry
  /** 是否成功 */
  success: boolean
  /** 错误信息 */
  error?: string
}

/**
 * 扫描队列 - 后台请求详情页并提取平台 ID
 *
 * 特性：
 * - 信号量控制并发
 * - 随机延迟避免风控
 * - 缓存优先（已缓存不重复请求）
 * - 冷却时间（60秒内不重复扫描）
 */
export class ScanQueue {
  private semaphore: Semaphore
  delayRange: [number, number]
  private processing = new Set<string>() // URLs currently being processed
  private cooldowns = new Map<string, number>() // Cooldown timestamps
  private static COOLDOWN_MS = 60_000 // 1 minute cooldown

  constructor(concurrency: number, delayRange: [number, number]) {
    this.semaphore = new Semaphore(concurrency)
    this.delayRange = delayRange
  }

  /** Update concurrency (creates new semaphore) */
  updateConcurrency(concurrency: number): void {
    this.semaphore = new Semaphore(concurrency)
  }

  /**
   * 检查 URL 是否在冷却期
   */
  private isOnCooldown(url: string): boolean {
    const until = this.cooldowns.get(url)
    if (until && Date.now() < until) return true
    return false
  }

  /**
   * 设置冷却时间
   */
  private setCooldown(url: string): void {
    this.cooldowns.set(url, Date.now() + ScanQueue.COOLDOWN_MS)
  }

  /**
   * 随机延迟
   */
  private async randomDelay(): Promise<void> {
    const [min, max] = this.delayRange
    const delay = Math.floor(Math.random() * (max - min + 1)) + min
    return new Promise((resolve) => setTimeout(resolve, delay))
  }

  /**
   * 处理单个扫描任务
   */
  private async processTask(task: ScanTask, onTaskComplete?: (result: ScanResult) => void): Promise<ScanResult> {
    const { url, config } = task

    if (this.processing.has(url)) {
      const result: ScanResult = { url, entry: { ptUrl: url, updatedAt: '' }, success: false, error: 'Already processing' }
      return result
    }

    if (this.isOnCooldown(url)) {
      const result: ScanResult = { url, entry: { ptUrl: url, updatedAt: '' }, success: false, error: 'On cooldown' }
      return result
    }

    const cached = await Store.ptIdCacheGet(url)
    if (cached) {
      const result: ScanResult = { url, entry: cached, success: true }
      if (onTaskComplete) onTaskComplete(result)
      return result
    }

    this.processing.add(url)

    try {
      await this.semaphore.acquire()
      await this.randomDelay()

      if (!validateFetchUrl(url)) {
        throw new Error('Blocked fetch to non-allowlisted origin')
      }
      const response = await fetch(url, { credentials: 'include' })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const html = await response.text()
      const parser = new DOMParser()
      const doc = parser.parseFromString(html, 'text/html')

      const { doubanId, imdbId } = config.extractIdsFromDetail(doc)

      if (!doubanId && !imdbId) {
        this.setCooldown(url)
        const allLinks = doc.querySelectorAll('a[href]')
        const doubanLinks = doc.querySelectorAll('a[href*="douban.com"]')
        const imdbLinks = doc.querySelectorAll('a[href*="imdb.com"]')
        console.warn(`[PT Scanner] No IDs found (total links: ${allLinks.length}, douban links: ${doubanLinks.length}, imdb links: ${imdbLinks.length})`)
        const emptyEntry: PtIdCacheEntry = { ptUrl: url, updatedAt: new Date().toISOString() }
        await Store.ptIdCachePut(emptyEntry)
        const result: ScanResult = { url, entry: emptyEntry, success: false, error: 'No IDs found' }
        if (onTaskComplete) onTaskComplete(result)
        return result
      }

      const entry: PtIdCacheEntry = {
        ptUrl: url,
        doubanId: doubanId ? `movie::${doubanId}` : undefined,
        imdbId: imdbId ? `movie::${imdbId}` : undefined,
        updatedAt: new Date().toISOString(),
      }

      await Store.ptIdCachePut(entry)
      this.setCooldown(url)

      console.log(`[PT Scanner] Cached successfully`)
      const result: ScanResult = { url, entry, success: true }
      if (onTaskComplete) onTaskComplete(result)
      return result
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      console.warn(`[PT Scanner] Failed: ${errorMsg}`)
      const result: ScanResult = {
        url,
        entry: { ptUrl: url, updatedAt: '' },
        success: false,
        error: errorMsg,
      }
      if (onTaskComplete) onTaskComplete(result)
      return result
    } finally {
      this.processing.delete(url)
      this.semaphore.release()
    }
  }

  /**
   * 批量扫描
   */
  async scanBatch(tasks: ScanTask[], onTaskComplete?: (result: ScanResult) => void): Promise<ScanResult[]> {
    const results: ScanResult[] = []

    const validTasks = tasks.filter((task) =>
      !this.processing.has(task.url) && !this.isOnCooldown(task.url),
    )

    validTasks.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100))

    const promises = validTasks.map((task) => this.processTask(task, onTaskComplete))
    const batchResults = await Promise.allSettled(promises)

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value)
      }
    }

    return results
  }

  /**
   * 获取队列状态
   */
  getStatus(): { processing: number; cooldowns: number } {
    return {
      processing: this.processing.size,
      cooldowns: this.cooldowns.size,
    }
  }
}

// Global singleton
let globalScanner: ScanQueue | null = null

/**
 * Get or update the global scanner instance.
 * Subsequent calls with different params update the existing instance.
 */
export function getScanner(
  concurrency = 3,
  delayRange: [number, number] = [1000, 2000],
): ScanQueue {
  if (!globalScanner) {
    globalScanner = new ScanQueue(concurrency, delayRange)
  } else {
    globalScanner.updateConcurrency(concurrency)
    globalScanner.delayRange = delayRange
  }
  return globalScanner
}
