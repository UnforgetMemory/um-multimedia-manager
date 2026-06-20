/**
 * 豆瓣搜索页增强器
 * 功能：在豆瓣搜索结果列表和排行榜中批量显示状态徽章（已看/未看）
 */

import { Store } from '@/features/database'
import type { StoreRecord } from '@/types'
import { Utils } from '@/utils'
import { debugLog } from '@/utils/logger'
import { t } from '../i18n'
import { escapeHtml, waitForElement } from '../utils/dom'
import { enhanceSearchPageSearch } from './douban-search-bar'

/**
 * 豆瓣搜索页配置
 */
interface SearchPageConfig {
  type: 'movie' | 'music' | 'book'
  containerSelector: string // 结果容器选择器
  cardSelector: string // 单个卡片选择器
  titleSelector: string // 标题选择器
  idExtractor: (card: Element) => string | null // ID 提取函数
}

/**
 * 获取搜索页配置
 */
function getSearchPageConfig(): SearchPageConfig | null {
  const url = location.href
  
  // 电影搜索页
  if (url.includes('search.douban.com/movie/subject_search')) {
    return {
      type: 'movie',
      containerSelector: '#root',
      cardSelector: '.item-root',
      titleSelector: '.title-text',
      idExtractor: (card) => {
        // .title-text 本身就是链接元素
        const link = card.querySelector('.title-text')?.getAttribute('href')
          || card.querySelector('.title a')?.getAttribute('href') // 降级方案
        
        if (!link) return null
        
        // 跳过非影视条目（如影人搜索结果）
        const match = link.match(/\/subject\/(\d+)/)
        return match?.[1] || null
      },
    }
  }
  
  // 音乐搜索页
  if (url.includes('search.douban.com/music/subject_search')) {
    return {
      type: 'music',
      containerSelector: '#root',
      cardSelector: '.item-root',
      titleSelector: '.title-text',
      idExtractor: (card) => {
        // .title-text 本身就是链接元素
        const link = card.querySelector('.title-text')?.getAttribute('href')
          || card.querySelector('.title a')?.getAttribute('href') // 降级方案
        
        if (!link) return null
        
        // 跳过非音乐条目（如音乐人搜索结果）
        const match = link.match(/\/subject\/(\d+)/)
        return match?.[1] || null
      },
    }
  }
  
  // 电影排行榜
  if (url.includes('movie.douban.com/chart') || url.includes('movie.douban.com/typerank')) {
    return {
      type: 'movie',
      containerSelector: '.article',
      cardSelector: '.item',
      titleSelector: '.pl2 a',
      idExtractor: (card) => {
        const link = card.querySelector('.pl2 a')?.getAttribute('href')
        return link?.match(/\/subject\/(\d+)/)?.[1] || null
      },
    }
  }
  
  // 音乐 Top 250
  if (url.includes('music.douban.com/top250')) {
    return {
      type: 'music',
      containerSelector: '#content',
      cardSelector: '.item',
      titleSelector: '.pl2 a',
      idExtractor: (card) => {
        const link = card.querySelector('.pl2 a')?.getAttribute('href')
        return link?.match(/\/subject\/(\d+)/)?.[1] || null
      },
    }
  }
  
  return null
}

/**
 * 创建搜索徽章
 */
function createSearchBadge(status: number, rating: number): HTMLElement {
  const badge = document.createElement('span')
  badge.className = 'umm-search-badge'
  badge.dataset.status = status === 2 ? 'done' : 'none'
  
  const label = status === 2 ? '✅' : '⏳'
  const ratingText = rating > 0 ? ` ${Utils.formatRating10(rating)}/10` : ''
  
  // XSS 防护
  const escapedLabel = escapeHtml(label)
  const escapedRatingText = ratingText ? escapeHtml(ratingText) : ''
  
  badge.innerHTML = `${escapedLabel}${escapedRatingText}`
  
  // ARIA 属性
  const ariaLabel = status === 2 ? t('search.aria_done') : t('search.aria_none')
  badge.setAttribute('role', 'status')
  badge.setAttribute('aria-label', `${ariaLabel}${ratingText ? `,${ratingText}` : ''}`)
  
  return badge
}

/**
 * 渲染单个卡片的徽章
 */
async function renderCardBadge(
  card: Element,
  config: SearchPageConfig,
  watchedMap: Map<string, StoreRecord>
): Promise<void> {
  // 检查是否已存在徽章
  const existingBadge = card.querySelector('.umm-search-badge')
  if (existingBadge) {
    return
  }
  
  // 提取豆瓣 ID
  const doubanId = config.idExtractor(card)
  if (!doubanId) {
    debugLog('Skipping non-subject card:', card)
    return
  }
  
  // 从 Map 中直接获取记录
  const record = watchedMap.get(doubanId)
  if (record) {
    console.log(`[UMM] Found record for ID ${doubanId}: status=${record.status}, rating=${record.rating}`)
  }
  
  const isWatched = record?.status === 2  // 2 = 已看/已听
  const status = isWatched ? 2 : 0
  const rating = record?.rating || 0
  
  // 创建徽章
  const badge = createSearchBadge(status, rating)
  
  // 找到合适的位置插入徽章
  const titleElement = card.querySelector(config.titleSelector)
  if (titleElement) {
    titleElement.insertAdjacentElement('afterend', badge)
  } else {
    // 降级方案：添加到卡片末尾
    card.appendChild(badge)
  }
}

/**
 * 使用缓存的 recordMap 渲染所有徽章
 */
async function renderAllBadgesWithMap(
  container: Element,
  config: SearchPageConfig,
  recordMap: Map<string, StoreRecord>
): Promise<void> {
  // 查找所有卡片
  const cards = container.querySelectorAll(config.cardSelector)
  
  if (cards.length === 0) {
    console.log(`[UMM] No cards found on ${config.type} search page`)
    return
  }
  
  console.log(`[UMM] Found ${cards.length} cards, checking against ${recordMap.size} records`)
  
  // 批量处理（使用 Promise.all 并行处理）
  const promises = Array.from(cards).map((card) =>
    renderCardBadge(card, config, recordMap)
  )
  
  await Promise.all(promises)
  
  console.log(`[UMM] Rendered badges for ${cards.length} cards on ${config.type} search page`)
}

/**
 * 监听容器变化并更新徽章
 */
function observeContainerChanges(container: Element, config: SearchPageConfig): () => void {
  // 初始化 Store 并获取数据（只执行一次）
  let recordMap: Map<string, StoreRecord> | null = null
  let initializationPromise: Promise<Map<string, StoreRecord>> | null = null
  let isCleanupCalled = false
  
  console.log(`[UMM] Observer initialized for ${config.type} search page`)
  console.log(`[UMM] Current URL: ${location.href}`)
  
  // 使用节流函数限制回调频率
  const throttledRender = Utils.throttle(async () => {
    // 检查是否已清理
    if (isCleanupCalled) {
      return
    }
    
    // 首次调用时获取数据，后续复用
    if (!recordMap) {
      // 如果正在初始化，等待同一个 Promise（避免竞态条件）
      if (!initializationPromise) {
        console.log('[UMM] Initializing Store and fetching records...')
        initializationPromise = (async () => {
          const entries = await Store.dbGetAll('douban_records')
          const map = new Map<string, StoreRecord>()
          const prefix = `${config.type}::`
          for (const { key, record } of entries) {
            if (key.startsWith(prefix)) {
              map.set(key.slice(prefix.length), record)
            }
          }
          return map
        })()
      }
      
      try {
        recordMap = await initializationPromise
        console.log(`[UMM] Loaded ${recordMap.size} records from Store`)
        
        // 输出前5个ID用于调试
        if (recordMap.size > 0) {
          const sampleIds = Array.from(recordMap.keys()).slice(0, 5)
          console.log('[UMM] Sample record IDs:', sampleIds)
          
          // 检查是否有已看的记录
          const watchedRecords = Array.from(recordMap.values()).filter(r => r.status === 2)
          console.log(`[UMM] Found ${watchedRecords.length} watched records`)
          if (watchedRecords.length > 0) {
            console.log('[UMM] Sample watched records:', watchedRecords.slice(0, 3).map(r => ({
              status: r.status,
              rating: r.rating
            })))
          }
        }
      } catch (error) {
        console.error('[UMM] Failed to initialize Store or fetch records:', error)
        initializationPromise = null  // 允许重试
        return
      }
    }
    
    // 再次检查，防止在异步操作期间被清理
    if (isCleanupCalled || !recordMap) {
      return
    }
    
    try {
      await renderAllBadgesWithMap(container, config, recordMap)
    } catch (error) {
      console.error('[UMM] Failed to render badges:', error)
    }
  }, 280)
  
  const observer = new MutationObserver(throttledRender)
  
  observer.observe(container, {
    childList: true,
    subtree: true,
  })
  
  console.log('[UMM] MutationObserver started')
  
  // 立即执行一次初始渲染
  throttledRender()
  
  // 返回清理函数
  return () => {
    isCleanupCalled = true
    observer.disconnect()
    recordMap = null
    initializationPromise = null
  }
}

/**
 * 启动搜索页增强器
 */
export async function startSearchEnhancer(): Promise<(() => void) | null> {
  const config = getSearchPageConfig()
  if (!config) {
    return null
  }
  
    console.log(`[UMM] Starting search enhancer for ${config.type}`)

    try {
      // 等待容器加载
      const container = await waitForElement(config.containerSelector, 5000)

      enhanceSearchPageSearch()

      // 开始监听并渲染
      const cleanup = observeContainerChanges(container, config)
    
    console.log('[UMM] Search enhancer started successfully')
    
    return cleanup
  } catch (error) {
    console.error('[UMM] Failed to start search enhancer:', error)
    return null
  }
}
