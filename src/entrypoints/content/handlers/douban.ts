/**
 * 豆瓣详情页处理器
 * 功能：检测页面状态并注入状态标签
 *
 * 职责：入口文件，协调各子模块
 * - douban-scanner: 页面状态扫描、评论提取、跨平台链接
 * - douban-sync: 本地存储同步、通知缓存管理
 * - douban-neodb: NeoDB 推送按钮、事件绑定、推送逻辑
 * - douban-toast: 页面通知显示
 */

import { Utils } from '@/utils'
import type { UrlIdentity } from '@/types'
import { escapeHtml, waitForElement } from '../utils/dom'
import { scanDoubanPageStatus } from './douban-scanner'
import { getLocalRecord, syncToLocalStorage } from './douban-sync'
import { injectNeoDBPushButtons } from './douban-neodb'
import { showNotification } from './douban-toast'
import { t } from '../i18n'
import { enhanceDetailPageSearch } from '../enhancers/douban-search-bar'

// ✅ P2: 提取魔法数字为常量
const STATUS_DONE = 2
// const STATUS_WISH = 1  // 暂未使用
const STATUS_NONE = 0

/**
 * 处理豆瓣详情页面
 */
export async function handleDoubanDetailPage(identity: UrlIdentity): Promise<void> {
  console.log('[UMM] ========== handleDoubanDetailPage START ==========')
  console.log('[UMM] Handling Douban detail page:', identity)
  
  try {
    // ✅ P1-3: 添加全局错误边界
    // 等待 #interest_sect_level 元素加载
    await waitForElement('#interest_sect_level', 5000)

    enhanceDetailPageSearch()

    // ✅ 修复：先获取本地记录
    console.log('[UMM] Calling getLocalRecord...')
    const localRecord = await getLocalRecord(identity)
    console.log('[UMM] getLocalRecord returned:', localRecord ? 'record found' : 'null')
    const isLocalDone = localRecord?.status === STATUS_DONE  // 2 = 已看/已听
      
    // 扫描页面状态（检测"我看过"或"我听过"）
    const pageState = scanDoubanPageStatus(identity)
    const isPageDone = pageState.status === 'done'
      
    // ✅ 修复：数据优先级 - 页面状态优先，其次本地记录
    // 如果页面显示已看/已听，使用页面数据；否则使用本地数据
    let finalStatus: number
    let finalRating: number
    let note = ''
      
    if (isPageDone) {
      // 页面显示已看/已听，使用页面数据并同步到本地
      finalStatus = STATUS_DONE
      finalRating = Utils.clampRating10(pageState.rating)
        
      // ✅ P1: 传递已查询的记录，避免重复查询
      await syncToLocalStorage(identity, pageState.rating, localRecord)
    } else if (isLocalDone) {
      // 页面未显示，但本地有记录，使用本地数据并标记来源
      finalStatus = STATUS_DONE
      finalRating = Utils.clampRating10(localRecord?.rating || 0)
      note = t('common.cache_hint')
    } else {
      // 都没有，显示未看状态
      finalStatus = STATUS_NONE
      finalRating = 0
    }
      
    // 渲染状态标签
    renderDoubanStatusChip(identity, finalStatus, finalRating, note)
      
    // ✅ P1: 传递已查询的记录，避免重复查询
    console.log('[UMM] About to call injectNeoDBPushButtons...')
    await injectNeoDBPushButtons(identity, localRecord)
    console.log('[UMM] injectNeoDBPushButtons completed')
  } catch (error) {
    console.error('[UMM Douban] Failed to handle detail page:', error)
    // 可选：显示用户友好的错误提示
    showNotification(t('neodb.no_response'))
  }
}

/**
 * 渲染豆瓣状态标签
 */
function renderDoubanStatusChip(
  identity: UrlIdentity,
  status: number,  // 0/1/2
  rating: number,
  note: string = ''
) {
  // ✅ P0-1 & P0-2: 优化的 DOM 元素查找逻辑 - 支持电影和音乐页面结构
  let anchor: Element | null = null
  
  // 策略 1: 最精确的选择器（电影/书籍标题 span）
  const titleSpan = document.querySelector('span[property="v:itemreviewed"]')
  if (titleSpan) {
    // 优先查找最近的 h1 祖先元素
    const h1Ancestor = titleSpan.closest('h1')
    if (h1Ancestor) {
      anchor = h1Ancestor
    } else {
      // 降级：检查父元素是否为 h1
      const parent = titleSpan.parentElement
      if (parent && parent.tagName === 'H1') {
        anchor = parent
      }
    }
  }
  
  // 策略 2: ID 选择器（最快）
  if (!anchor) {
    const contentElement = document.getElementById('content')
    const wrapperElement = document.getElementById('wrapper')
    anchor = contentElement?.querySelector('h1') || wrapperElement?.querySelector('h1') || null
  }
  
  // 策略 3: 降级方案（限制搜索范围）
  if (!anchor) {
    const firstH1 = document.querySelector('main h1, #content h1, #wrapper h1')
    if (firstH1) {
      anchor = firstH1
    }
  }
  
  if (!anchor) {
    console.warn('[UMM] Could not find anchor element for status chip')
    console.log('[UMM] Available h1 elements:', document.querySelectorAll('h1').length)
    return
  }
  
  // 检查是否已存在状态标签
  const existingChip = anchor.parentElement?.querySelector('.umm-status-chip[data-umm-owner]')
  
  // 创建新标签
  const chip = createDoubanStatusChip(identity, status, rating, note)
  chip.dataset.ummOwner = `douban-${identity.type}`
  
  if (existingChip) {
    // 替换现有标签
    existingChip.replaceWith(chip)
  } else {
    // 插入到锚点元素之后
    anchor.insertAdjacentElement('afterend', chip)
  }
}

/**
 * 创建豆瓣状态标签
 */
function createDoubanStatusChip(
  identity: UrlIdentity,
  status: number,  // 0/1/2
  rating: number,
  note: string = ''
): HTMLElement {
  const chip = document.createElement('div')
  chip.className = 'umm-status-chip'
  chip.dataset.status = status === 2 ? 'done' : 'none'
  
  const label = status === 2
    ? (note 
        ? t(identity.type === 'music' ? 'status.done_local_music' : 'status.done_local')
        : t(identity.type === 'music' ? 'status.done_music' : 'status.done'))
    : t(identity.type === 'music' ? 'status.none_music' : 'status.none')
  
  const ratingText = rating > 0 ? `${Utils.formatRating10(rating)}/10` : ''
  
  // XSS 防护：转义所有用户输入
  const escapedLabel = escapeHtml(label)
  const escapedRatingText = ratingText ? escapeHtml(ratingText) : ''
  // ✅ 修复：当 label 已包含"(本地)"标识时，不再显示 note，避免语义重复
  const shouldShowNote = note && !label.includes('(本地)')
  const escapedNote = shouldShowNote ? escapeHtml(note) : ''
  
  chip.innerHTML = `
    <span class="umm-label">${escapedLabel}</span>
    ${escapedRatingText ? `<span class="umm-rating">${escapedRatingText}</span>` : ''}
    ${escapedNote ? `<span class="umm-note">${escapedNote}</span>` : ''}
  `
  
  // 添加 ARIA 属性 - 提升无障碍性
  chip.setAttribute('role', 'status')
  chip.setAttribute('aria-live', 'polite')
  chip.setAttribute('aria-label', `${label}${ratingText ? `, ${ratingText}` : ''}${shouldShowNote && note ? `, ${note}` : ''}`)
  
  return chip
}