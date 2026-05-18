/**
 * 豆瓣搜索页增强器
 * 功能：在豆瓣搜索结果列表和排行榜中批量显示状态徽章（已看/未看）
 */

import { Store } from '../../shared'
import { Utils } from '../../shared/utils'
import { escapeHtml, waitForElement } from '../utils/dom'

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
      cardSelector: '.result-list .result',
      titleSelector: '.title a',
      idExtractor: (card) => {
        const link = card.querySelector('.title a')?.getAttribute('href')
        return link?.match(/\/subject\/(\d+)/)?.[1] || null
      },
    }
  }
  
  // 音乐搜索页
  if (url.includes('search.douban.com/music/subject_search')) {
    return {
      type: 'music',
      containerSelector: '#root',
      cardSelector: '.result-list .result',
      titleSelector: '.title a',
      idExtractor: (card) => {
        const link = card.querySelector('.title a')?.getAttribute('href')
        return link?.match(/\/subject\/(\d+)/)?.[1] || null
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
  const ariaLabel = status === 2 ? '已标记为已看' : '未标记'
  badge.setAttribute('role', 'status')
  badge.setAttribute('aria-label', `${ariaLabel}${ratingText ? `, 评分${ratingText}` : ''}`)
  
  return badge
}

/**
 * 渲染单个卡片的徽章
 */
async function renderCardBadge(
  card: Element,
  config: SearchPageConfig,
  watchedSet: Set<string>
): Promise<void> {
  // 检查是否已存在徽章
  const existingBadge = card.querySelector('.umm-search-badge')
  if (existingBadge) {
    return
  }
  
  // 提取豆瓣 ID
  const doubanId = config.idExtractor(card)
  if (!doubanId) {
    return
  }
  
  // 检查是否在已看列表中 (status === 2 表示已看)
  const isWatched = watchedSet.has(doubanId)
  const status = isWatched ? 2 : 0
  
  // 从本地记录获取评分
  await Store.initialize()
  const map = await Store.getDatasetMap(config.type, 'douban')
  const record = map.get(doubanId)
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
 * 批量渲染所有卡片的徽章
 */
async function renderAllBadges(container: Element, config: SearchPageConfig): Promise<void> {
  // 初始化 Store
  await Store.initialize()
  
  // 获取所有已看的记录 ID
  const map = await Store.getDatasetMap(config.type, 'douban')
  const watchedSet = new Set<string>()
  
  for (const [id, record] of map.entries()) {
    if (record.status === 2) {  // 2 = 已看
      watchedSet.add(id)
    }
  }
  
  // 查找所有卡片
  const cards = container.querySelectorAll(config.cardSelector)
  
  // 批量处理（使用 Promise.all 并行处理）
  const promises = Array.from(cards).map((card) =>
    renderCardBadge(card, config, watchedSet)
  )
  
  await Promise.all(promises)
  
  console.log(`[UMM] Rendered badges for ${cards.length} cards on ${config.type} search page`)
}

/**
 * 监听容器变化并更新徽章
 */
function observeContainerChanges(container: Element, config: SearchPageConfig): () => void {
  // 使用节流函数限制回调频率
  const throttledRender = Utils.throttle(() => {
    renderAllBadges(container, config).catch(console.error)
  }, 280)
  
  const observer = new MutationObserver(throttledRender)
  
  observer.observe(container, {
    childList: true,
    subtree: true,
  })
  
  // 立即执行一次初始渲染
  renderAllBadges(container, config).catch(console.error)
  
  // 返回清理函数
  return () => {
    observer.disconnect()
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
    
    // 开始监听并渲染
    const cleanup = observeContainerChanges(container, config)
    
    console.log('[UMM] Search enhancer started successfully')
    
    return cleanup
  } catch (error) {
    console.error('[UMM] Failed to start search enhancer:', error)
    return null
  }
}
