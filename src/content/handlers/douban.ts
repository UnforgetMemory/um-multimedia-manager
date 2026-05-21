/**
 * 豆瓣详情页处理器
 * 功能：检测页面状态并注入状态标签
 */

import { Store, Utils } from '@/shared'
import type { UrlIdentity, StoreRecord } from '@/shared/types'
import { escapeHtml, waitForElement } from '../utils/dom'
import { safeSendMessage } from '@/shared/utils/context'
import { FloatingToast } from '../utils/toast'

// ✅ P2: 提取魔法数字为常量
const STATUS_DONE = 2
// const STATUS_WISH = 1  // 暂未使用
const STATUS_NONE = 0

// ✅ P1: 通知防抖缓存（key: providerId, value: timestamp）
const notificationCache = new Map<string, number>()
const NOTIFICATION_COOLDOWN = 5000 // 5秒冷却时间
const MAX_CACHE_SIZE = 100 // 限制缓存大小
const CACHE_CLEANUP_INTERVAL = 60000 // 每分钟清理一次

/**
 * 清理过期的通知缓存
 */
function cleanupNotificationCache() {
  const now = Date.now()
  let cleanedCount = 0
  
  for (const [key, timestamp] of notificationCache.entries()) {
    // ✅ 修复：使用合理的过期时间（2 倍冷却时间即可）
    if (now - timestamp > NOTIFICATION_COOLDOWN * 2) {
      notificationCache.delete(key)
      cleanedCount++
    }
  }
  
  // 如果仍然过大，删除最旧的条目
  if (notificationCache.size > MAX_CACHE_SIZE) {
    const entries = Array.from(notificationCache.entries())
    entries.sort((a, b) => a[1] - b[1]) // 按时间排序
    // ✅ 优化：使用 LRU 策略，保留最近的 70%
    const targetSize = Math.floor(MAX_CACHE_SIZE * 0.7)
    const toDeleteCount = notificationCache.size - targetSize
    const toDelete = entries.slice(0, toDeleteCount)
    toDelete.forEach(([key]) => notificationCache.delete(key))
    cleanedCount += toDelete.length
  }
  
  if (cleanedCount > 0) {
    console.log(`[UMM Douban] Cleaned ${cleanedCount} expired notification cache entries`)
  }
}

// 启动定期清理
const cacheCleanupTimer = setInterval(cleanupNotificationCache, CACHE_CLEANUP_INTERVAL)

// ✅ 添加最大超时保护（防止无限运行）
setTimeout(() => {
  clearInterval(cacheCleanupTimer)
  console.log('[UMM Douban] Cache cleanup timer timeout cleared')
}, 600000) // 10分钟最大超时

// 在页面卸载时清理定时器
window.addEventListener('beforeunload', () => {
  clearInterval(cacheCleanupTimer)
  notificationCache.clear()
  console.log('[UMM Douban] Notification cache cleared on page unload')
})

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
      
    // ✅ 修复：先获取本地记录
    console.log('[UMM] Calling getLocalRecord...')
    const localRecord = await getLocalRecord(identity)
    console.log('[UMM] getLocalRecord returned:', localRecord ? 'record found' : 'null')
    const isLocalDone = localRecord?.status === STATUS_DONE  // 2 = 已看/已听
      
    // 扫描页面状态（检测“我看过”或“我听过”）
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
      note = '来自本地缓存'
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
    showNotification('❌ 页面处理失败，请刷新重试')
  }
}

/**
 * 同步页面状态到本地存储
 * @param cachedRecord 可选的缓存记录，避免重复查询
 */
async function syncToLocalStorage(
  identity: UrlIdentity,
  pageRating: number,
  cachedRecord?: StoreRecord | null // ✅ P1: 新增参数
): Promise<void> {
  console.log('[UMM Douban] Page shows watched status, saving to database...')
  
  const storeName = `${identity.provider}_records`
  const key = `${identity.type}::${identity.providerId}`
  
  // ✅ P1: 使用缓存的记录，避免重复查询
  const existingRecord = cachedRecord || await Store.dbGet(storeName, key)
  
  // 重新计算变化标志（基于数据库真实数据）
  const isNewRecord = !existingRecord
  const isStatusChanged = existingRecord && existingRecord.status !== STATUS_DONE
  const isRatingChanged = existingRecord && Math.abs(existingRecord.rating - pageRating) > 0.01
  
  // 判断是否有任何实质性变化
  const hasRealChange = isNewRecord || isStatusChanged || isRatingChanged
  
  const recordToSave: StoreRecord = {
    url: identity.url,
    status: STATUS_DONE,  // 已看
    rating: pageRating,
    updatedAt: new Date().toISOString(),
    linkedIds: existingRecord?.linkedIds || {},
  }
  
  console.log('[UMM Douban] Record to save:', recordToSave)
  console.log('[UMM Douban] Change detection:', { isNewRecord, isStatusChanged, isRatingChanged, hasRealChange })
  
  try {
    await Store.dbPut(storeName, key, recordToSave)
    console.log('[UMM Douban] ✅ Record saved successfully')
    
    // ✅ P1: 添加防抖检查
    const cacheKey = `${identity.provider}:${identity.providerId}`
    const lastNotificationTime = notificationCache.get(cacheKey) || 0
    const now = Date.now()
    
    if (now - lastNotificationTime < NOTIFICATION_COOLDOWN) {
      console.log('[UMM Douban] ⏭️ Notification cooldown, skipped')
      return
    }
    
    // ✅ 修复：只在有实质性变化时才发送通知
    if (hasRealChange) {
      if (isNewRecord) {
        showNotification(`✅ 已自动同步${identity.type === 'music' ? '听过' : '看过'}状态`)
      } else if (isStatusChanged) {
        showNotification(`✅ 状态已更新为${identity.type === 'music' ? '已听' : '已看'}`)
      } else if (isRatingChanged) {
        showNotification(`✅ 评分已更新为 ${Utils.formatRating10(pageRating)}/10`)
      }
      
      // 记录通知时间
      notificationCache.set(cacheKey, now)
    } else {
      console.log('[UMM Douban] ⏭️ Data unchanged, skipped notification')
    }
  } catch (error) {
    console.error('[UMM Douban] ❌ Failed to save record:', error)
    showNotification('❌ 同步状态失败')
  }

  // ✅ Auto-sync to NeoDB on FIRST record only (independent of notification cooldown)
  // "首次" = 本地数据库中不存在该豆瓣 key 的记录
  if (isNewRecord) {
    try {
      const settings = await Store.getSettings()
      if (settings.autoSyncNeoDB && settings.neodbToken) {
        console.log('[UMM Douban] 🔄 Auto-syncing to NeoDB (first record)...')
        await safeSendMessage({
          type: 'NEODB_PUSH_RATING',
          payload: {
            record: {
              providerId: identity.providerId,
              rating: pageRating,
              status: STATUS_DONE,
              type: identity.type,
              provider: identity.provider,
            },
          },
        }, { timeout: 10000 })
        console.log('[UMM Douban] ✅ Auto-synced to NeoDB')
      }
    } catch (syncErr) {
      console.warn('[UMM Douban] ⚠️ Auto-sync to NeoDB failed:', syncErr)
    }
  }
}

/**
 * 扫描豆瓣页面状态
 */
function scanDoubanPageStatus(identity: UrlIdentity): { status: string; rating: number } {
  const interestBox = document.getElementById('interest_sect_level')
  if (!interestBox) {
    console.log('[UMM Douban] #interest_sect_level not found')
    return { status: 'none', rating: 0 }
  }
  
  // 检测是否包含"我看过"或"我听过"
  const isMusic = identity.type === 'music'
  const watchedText = isMusic ? '我听过' : '我看过'
    
  const hasWatchedText = interestBox.innerText.includes(watchedText)
  console.log('[UMM Douban] Looking for text:', watchedText, '| Found:', hasWatchedText)
  
  if (!hasWatchedText) {
    return { status: 'none', rating: 0 }
  }
  
  // 获取评分
  let stars = 0
  const nRatingInput = document.getElementById('n_rating') as HTMLInputElement | null
  if (nRatingInput && nRatingInput.value) {
    stars = Number.parseInt(nRatingInput.value, 10) || 0
    console.log('[UMM Douban] Rating from input:', stars)
  }
  
  // 如果没有输入框，尝试从 class 中提取
  if (!stars) {
    const ratingElement = interestBox.querySelector('[class*="rating"]')
    if (ratingElement) {
      const className = Array.from(ratingElement.classList).find(cls => /^rating\d/.test(cls))
      if (className) {
        stars = Number.parseInt(className.replace(/[^\d]/g, ''), 10) || 0
        console.log('[UMM Douban] Rating from class:', stars)
      }
    }
  }
  
  const finalRating = Utils.clampRating10(stars * 2)
  console.log('[UMM Douban] Final rating (stars * 2):', finalRating)
  
  return {
    status: 'done',
    rating: finalRating,
  }
}

/**
 * 获取本地记录
 */
async function getLocalRecord(identity: UrlIdentity) {
  try {
    console.log('[UMM] getLocalRecord called with:', identity)
    
    const storeName = `${identity.provider}_records`
    const key = `${identity.type}::${identity.providerId}`
    const record = await Store.dbGet(storeName, key)
    
    if (record) {
      console.log('[UMM] getLocalRecord success:', {
        rating: record.rating,
        status: record.status,
        linkedIds: record.linkedIds
      })
      return record
    } else {
      console.log('[UMM] getLocalRecord: record not found')
      return null
    }
  } catch (error) {
    console.error('[UMM] Failed to load local record:', error)
    return null
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
        ? (identity.type === 'music' ? '📦 已听(本地)' : '📦 已看(本地)')
        : (identity.type === 'music' ? '✅ 已听' : '✅ 已看'))
    : (identity.type === 'music' ? '⏳ 未听' : '⏳ 未看')
  
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
  chip.setAttribute('aria-label', `${label}${ratingText ? `, 评分${ratingText}` : ''}${shouldShowNote && note ? `, ${note}` : ''}`)
  
  return chip
}

/**
 * 在 #interest_sect_level 上方注入 NeoDB 推送按钮
 */
/**
 * 注入 NeoDB 推送按钮
 * @param cachedRecord 可选的缓存记录，避免重复查询
 */
async function injectNeoDBPushButtons(
  identity: UrlIdentity,
  record: StoreRecord | null
) {
  // 扫描页面状态（检测"我看过"或"我听过"）
  const pageState = scanDoubanPageStatus(identity)
  if (pageState.status !== 'done') {
    console.log('[UMM] Page not marked as done, skip NeoDB buttons')
    return
  }
  
  // 移除旧的按钮
  const oldButtons = document.getElementById('umm-neodb-push-buttons')
  if (oldButtons) {
    oldButtons.remove()
  }
  
  // 注入样式（只注入一次）
  const styleId = 'umm-neodb-buttons-style'
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style')
    style.id = styleId
    style.textContent = `
      .umm-neodb-btn {
        padding: 6px 12px;
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 600;
        transition: all 0.2s;
      }
      .umm-neodb-btn:hover {
        transform: translateY(-1px);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        opacity: 0.9;
      }
      .umm-neodb-btn--minus { background: #dc2626; }  /* 红色 - 减少 */
      .umm-neodb-btn--plus { background: #16a34a; }   /* 绿色 - 增加 */
      .umm-neodb-btn--original { background: #2563eb; }  /* 蓝色 - 原始 */
      
      /* ✅ 新增：已同步状态的绿色荧光效果 - 应用于 NEODB 背景文字 */
      .umm-neodb-synced .umm-neodb-watermark {
        animation: neodb-watermark-glow 2s ease-in-out 3 alternate; /* ✅ 只播放 3 次，避免永久运行 */
        animation-fill-mode: forwards; /* ✅ 保持最后状态 */
        will-change: color, text-shadow; /* ✅ 提示浏览器优化 */
        color: rgba(16, 185, 129, 0.25) !important; /* ✅ 降低透明度到 25%，更柔和 */
        text-shadow: 
          0 0 10px rgba(16, 185, 129, 0.4),
          0 0 20px rgba(16, 185, 129, 0.25),
          0 0 30px rgba(16, 185, 129, 0.15);
      }
      
      @keyframes neodb-watermark-glow {
        from {
          color: rgba(16, 185, 129, 0.25);
          text-shadow: 
            0 0 10px rgba(16, 185, 129, 0.4),
            0 0 20px rgba(16, 185, 129, 0.25),
            0 0 30px rgba(16, 185, 129, 0.15);
        }
        to {
          color: rgba(52, 211, 153, 0.35); /* ✅ 降低亮度到 35% */
          text-shadow: 
            0 0 15px rgba(52, 211, 153, 0.5),
            0 0 30px rgba(52, 211, 153, 0.35),
            0 0 45px rgba(52, 211, 153, 0.25),
            0 0 60px rgba(16, 185, 129, 0.15);
        }
      }
      
      /* ✅ 尊重用户的减少动画偏好设置 */
      @media (prefers-reduced-motion: reduce) {
        .umm-neodb-synced .umm-neodb-watermark {
          animation: none;
          color: rgba(16, 185, 129, 0.3) !important; /* 静态效果 */
          text-shadow: 0 0 15px rgba(16, 185, 129, 0.4);
        }
      }
    `
    document.head.appendChild(style)
  }
  
  // ✅ P1: 使用缓存的记录，避免重复查询
  console.log('[UMM] injectNeoDBPushButtons called, record:', !!record)
  const localRecord = record || await getLocalRecord(identity)
  
  // ✅ 调试：输出完整的记录信息
  console.log('[UMM] Local record after query:', localRecord ? {
    rating: localRecord.rating,
    status: localRecord.status,
    linkedIds: localRecord.linkedIds
  } : 'null')
  
  // ✅ P1: 创建按钮容器（带 NeoDB 高级感背景，提高对比度）
  const container = document.createElement('div')
  container.id = 'umm-neodb-push-buttons'
  
  // ✅ 检查是否已通过linkedIds同步到 NeoDB
  const isSynced = !!(localRecord?.linkedIds?.neodb)
  console.log('[UMM] Checking synced state:', {
    linkedIds: localRecord?.linkedIds,
    isSynced: !!isSynced
  })
  if (isSynced) {
    container.classList.add('umm-neodb-synced')
    console.log('[UMM] Applied umm-neodb-synced class to container')
  }
  
  container.style.cssText = `
    margin-top: 12px;
    margin-bottom: 12px;
    padding: 16px;
    border-radius: 12px;
    background: linear-gradient(135deg, rgba(15, 122, 67, 0.1), rgba(23, 87, 214, 0.1));
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border: 2px solid rgba(15, 122, 67, 0.3);
    box-shadow: 
      0 4px 16px rgba(0, 0, 0, 0.15),
      inset 0 1px 0 rgba(255, 255, 255, 0.2);
    display: flex;
    gap: 10px;
    justify-content: flex-start;
    align-items: center;
    position: relative;
    overflow: hidden;
  `
  
  // ✅ P1: 添加 NeoDB 背景艺术字（增强视觉效果）
  const watermark = document.createElement('div')
  watermark.className = 'umm-neodb-watermark' // ✅ 新增：添加类名以便应用荧光效果
  watermark.style.cssText = `
    position: absolute;
    right: 20px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 72px;
    font-weight: 900;
    font-family: 'Arial Black', 'Helvetica Neue', sans-serif;
    color: rgba(15, 122, 67, 0.12); /* ✅ P1: 提高对比度到 12% */
    letter-spacing: 4px;
    pointer-events: none;
    user-select: none;
    z-index: 0;
    text-transform: uppercase;
    line-height: 1;
    white-space: nowrap;
    text-shadow: 
      2px 2px 0 rgba(15, 122, 67, 0.06),
      4px 4px 0 rgba(23, 87, 214, 0.04);
  `
  watermark.textContent = 'NEODB'
  watermark.setAttribute('aria-hidden', 'true') // ✅ P1: 对屏幕阅读器隐藏
  container.appendChild(watermark)
  
  // 获取当前评分（如果没有记录则为 0）
  const currentRating = localRecord?.rating || 0
  const ratingMinus = Utils.clampRating10(currentRating - 1)
  const ratingPlus = Utils.clampRating10(currentRating + 1)
  
  // ✅ P2: 创建三个按钮（使用 createElement 避免 XSS，添加工具提示）
  const pushMinusBtn = document.createElement('button')
  pushMinusBtn.id = 'umm-push-minus'
  pushMinusBtn.className = 'umm-neodb-btn umm-neodb-btn--minus'
  pushMinusBtn.textContent = `-1分 (${ratingMinus})`
  pushMinusBtn.title = '降低 1 分后推送到 NeoDB'
  
  const pushPlusBtn = document.createElement('button')
  pushPlusBtn.id = 'umm-push-plus'
  pushPlusBtn.className = 'umm-neodb-btn umm-neodb-btn--plus'
  pushPlusBtn.textContent = `+1分 (${ratingPlus})`
  pushPlusBtn.title = '提高 1 分后推送到 NeoDB'
  
  const pushOriginalBtn = document.createElement('button')
  pushOriginalBtn.id = 'umm-push-original'
  pushOriginalBtn.className = 'umm-neodb-btn umm-neodb-btn--original'
  pushOriginalBtn.textContent = `原分推送 (${currentRating})`
  pushOriginalBtn.title = '使用当前评分推送到 NeoDB'
  
  pushMinusBtn.style.position = 'relative'
  pushMinusBtn.style.zIndex = '1'
  container.appendChild(pushMinusBtn)
  
  pushPlusBtn.style.position = 'relative'
  pushPlusBtn.style.zIndex = '1'
  container.appendChild(pushPlusBtn)
  
  pushOriginalBtn.style.position = 'relative'
  pushOriginalBtn.style.zIndex = '1'
  container.appendChild(pushOriginalBtn)
  
  // 插入到 #interest_sect_level 上方
  const interestSect = document.getElementById('interest_sect_level')
  if (interestSect) {
    interestSect.parentNode?.insertBefore(container, interestSect)
  }
  
  // ✅ P0: 使用事件委托绑定事件（避免内存泄漏）
  bindNeoDBPushEvents(identity, localRecord, container)
  
  console.log('[UMM] NeoDB push buttons injected')
}

/**
 * ✅ P0: 使用事件委托绑定 NeoDB 推送按钮事件（避免内存泄漏）
 */
function bindNeoDBPushEvents(
  identity: UrlIdentity, 
  record: StoreRecord | null,
  container: HTMLElement
) {
  // ✅ P0: 使用事件委托：在容器上监听点击事件
  container.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement
    
    // ✅ P0: 确保只处理直接子元素按钮，阻止事件冒泡
    if (!target.matches('#umm-push-minus, #umm-push-plus, #umm-push-original')) {
      return
    }
    
    // 阻止事件冒泡，避免触发父元素的其他点击处理
    e.stopPropagation()
    
    if (target.id === 'umm-push-minus') {
      await pushToNeoDB(identity, record, -1)
    } else if (target.id === 'umm-push-plus') {
      await pushToNeoDB(identity, record, 1)
    } else if (target.id === 'umm-push-original') {
      await pushToNeoDB(identity, record, 0)
    }
  })
}

/**
 * 推送到 NeoDB
 * @param ratingAdjust 评分调整值：-1, 0, +1
 */
async function pushToNeoDB(
  identity: UrlIdentity, 
  record: StoreRecord | null, 
  ratingAdjust: number
) {
  // ✅ P0: 验证必要的字段
  const providerId = identity.providerId
  if (!providerId) {
    showPageToast('无法获取作品ID', 'error', 3000)
    return
  }
  
  // ✅ 获取所有三个 NeoDB 按钮
  const allButtons = [
    document.getElementById('umm-push-minus'),
    document.getElementById('umm-push-plus'),
    document.getElementById('umm-push-original')
  ].filter(btn => btn !== null) as HTMLButtonElement[]
  
  // ✅ 保存原始状态
  const originalStates = allButtons.map(btn => ({
    disabled: btn.disabled,
    text: btn.textContent || '',
    opacity: btn.style.opacity,
    pointerEvents: btn.style.pointerEvents,
    cursor: btn.style.cursor
  }))
  
  // ✅ 禁用所有按钮并显示 Loading
  allButtons.forEach(btn => {
    btn.disabled = true
    btn.style.pointerEvents = 'none'
    btn.style.cursor = 'wait'
    btn.style.opacity = '0.6'
  })
  
  // ✅ 显示顶部居中的 Loading Toast
  const toast = showPageToast('正在同步到 NeoDB...', 'loading')
  
  const startTime = Date.now()
  
  try {
    const successMessage = await performNeoDBPush(identity, record, ratingAdjust)
    
    // ✅ 成功：更新 Toast 为绿色
    const elapsed = Date.now() - startTime
    const minLoadingTime = 800 // 最小 loading 时间（毫秒）
    
    if (elapsed < minLoadingTime) {
      await new Promise(resolve => setTimeout(resolve, minLoadingTime - elapsed))
    }
    
    // 移除 Loading Toast，显示成功 Toast
    toast.remove()
    showPageToast(successMessage || '同步成功！', 'success', 3000)
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : '同步失败'
    
    // ✅ 区分预期错误和意外错误
    const expectedErrors = [
      '未在 NeoDB 找到对应作品',
      '请先在豆瓣标记',
      '请先在设置中配置 NeoDB Token',
      '扩展上下文已失效'
    ]
    
    const isExpectedError = expectedErrors.some(msg => errorMsg.includes(msg))
    
    if (isExpectedError) {
      // 预期错误：只输出警告，不显示堆栈
      console.warn(`[UMM] Push failed: ${errorMsg}`)
    } else {
      // 意外错误：输出完整错误信息
      console.error('[UMM] Push failed:', error)
    }
    
    // ✅ 失败：更新 Toast 为红色
    const elapsed = Date.now() - startTime
    const minLoadingTime = 800
    
    if (elapsed < minLoadingTime) {
      await new Promise(resolve => setTimeout(resolve, minLoadingTime - elapsed))
    }
    
    // 移除 Loading Toast，显示错误 Toast
    toast.remove()
    showPageToast(errorMsg, 'error', 4000)
    
  } finally {
    // ✅ 恢复所有按钮状态
    allButtons.forEach((btn, index) => {
      const state = originalStates[index]
      btn.disabled = state.disabled
      btn.style.pointerEvents = state.pointerEvents || 'auto'
      btn.style.cursor = state.cursor || 'pointer'
      btn.textContent = state.text
      btn.style.opacity = state.opacity
    })
  }
}

/**
 * 执行 NeoDB 推送的核心逻辑
 */
async function performNeoDBPush(
  identity: UrlIdentity, 
  record: StoreRecord | null,
  ratingAdjust: number
) {
  
  // ✅ P2: 验证必要的字段
  const providerId = identity.providerId
  if (!providerId) {
    throw new Error('无法获取作品ID')
  }
  
  // 获取 NeoDB Token
  const settings = await Store.getSettings()
  if (!settings.neodbToken) {
    throw new Error('请先在设置中配置 NeoDB Token')
  }
  
  // 计算调整后的评分（如果没有记录则为 0）
  const baseRating = record?.rating || 0
  const adjustedRating = Utils.clampRating10(baseRating + ratingAdjust)
  
  // 构建推送数据
  const neodbData = {
    providerId,
    rating: adjustedRating,
    status: record?.status ?? 0,
    type: identity.type,
    provider: identity.provider,
    url: window.location.href,  // ✅ 修复：使用原始 URL，与旧脚本一致
  }
  
  // 调用 Background Service Worker 进行推送
  const response = await safeSendMessage(
    {
      type: 'NEODB_PUSH_RATING',
      payload: {
        record: neodbData,
        // 不在这里传递 token，由 Background 从存储中获取
      },
    },
    {
      timeout: 15000,
      retries: 2,
      fallback: () => {
        showNotification('❌ 扩展上下文已失效，请刷新页面')
      }
    }
  )
  
  if (!response) {
    // safeSendMessage 已经处理了错误和 fallback
    throw new Error('与后台服务通信失败')
  }
  
  if (response.success) {
    // ✅ 成功：重新查询数据库以获取最新的 neodbUuid
    const updatedRecord = await getLocalRecord(identity)
    console.log('[UMM] Updated record after sync:', updatedRecord ? 'Found' : 'Not found')
    if (updatedRecord) {
      console.log('[UMM] Updated record after sync:', { linkedIds: updatedRecord.linkedIds })
    }
    
    // ✅ 更新按钮容器的荧光效果状态
    const container = document.getElementById('umm-neodb-push-buttons')
    if (container && updatedRecord) {
      const isSynced = !!(updatedRecord.linkedIds?.neodb)
      if (isSynced) {
        container.classList.add('umm-neodb-synced')
        console.log('[UMM] Applied synced glow effect to buttons')
      } else {
        container.classList.remove('umm-neodb-synced')
        console.log('[UMM] Removed synced glow effect from buttons')
      }
    }
    
    // 成功，返回消息供外层显示
    return response.message || `已推送到 NeoDB (${adjustedRating}/10)`
  } else {
    // ✅ 显示具体错误原因
    const errorMsg = response.message || '推送失败'
    
    // 如果是"未标记已看"的错误，提供引导
    if (errorMsg.includes('请先在豆瓣标记')) {
      console.warn('[UMM] User needs to mark as watched first')
    }
    
    throw new Error(errorMsg)
  }
}

/**
 * ✅ 显示页面内 Toast 通知（右下角）
 */
function showPageToast(
  message: string,
  type: 'loading' | 'success' | 'error' = 'loading',
  duration: number = 0 // 0 表示不自动消失
): HTMLElement {
  // 移除旧的 Toast
  const oldToast = document.getElementById('umm-page-toast')
  if (oldToast) {
    oldToast.remove()
  }
  
  // 创建 Toast 容器
  const toast = document.createElement('div')
  toast.id = 'umm-page-toast'
  
  // ✅ 优化颜色系统：添加彩色阴影
  const colors = {
    loading: { 
      bg: '#3b82f6',      // blue-500
      border: '#2563eb',  // blue-600
      icon: '⏳',
      shadow: 'rgba(59, 130, 246, 0.3)'
    },
    success: { 
      bg: '#10b981',      // emerald-500
      border: '#059669',  // emerald-600
      icon: '✅',
      shadow: 'rgba(16, 185, 129, 0.3)'
    },
    error: { 
      bg: '#ef4444',      // red-500
      border: '#dc2626',  // red-600
      icon: '❌',
      shadow: 'rgba(239, 68, 68, 0.3)'
    }
  }
  
  const color = colors[type]
  
  // ✅ 修改位置到右下角，优化样式
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: ${color.bg};
    color: white;
    padding: 16px 24px;
    border-radius: 12px;
    box-shadow: 0 8px 24px ${color.shadow}, 0 4px 8px rgba(0, 0, 0, 0.1);
    z-index: 999999;
    font-size: 14px;
    font-weight: 500;
    letter-spacing: 0.01em;
    line-height: 1.5;
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 300px;
    max-width: 400px;
    justify-content: flex-start;
    border: 2px solid ${color.border};
    animation: slideInRight 0.3s ease-out;
    cursor: default;
  `
  
  // ✅ 更新动画样式：右侧滑入 + 淡出下移
  if (!document.getElementById('umm-toast-animation')) {
    const style = document.createElement('style')
    style.id = 'umm-toast-animation'
    style.textContent = `
      @keyframes slideInRight {
        from {
          opacity: 0;
          transform: translateX(100%);
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }
      
      @keyframes fadeOutDown {
        from {
          opacity: 1;
          transform: translateY(0);
        }
        to {
          opacity: 0;
          transform: translateY(10px);
        }
      }
    `
    document.head.appendChild(style)
  }
  
  // ✅ 修复：使用 textContent 防止 XSS
  const iconSpan = document.createElement('span')
  iconSpan.style.fontSize = '20px'
  iconSpan.textContent = color.icon
  
  const messageSpan = document.createElement('span')
  messageSpan.textContent = message  // ✅ 自动转义，防止 XSS
  
  toast.innerHTML = ''  // 清空
  toast.appendChild(iconSpan)
  toast.appendChild(messageSpan)
  
  document.body.appendChild(toast)
  
  // ✅ 如果设置了持续时间，自动消失（带悬停交互）
  if (duration > 0) {
    let autoHideTimer: number | null = window.setTimeout(() => {
      // ✅ 使用 CSS 动画而非简单的 opacity 过渡
      toast.style.animation = 'fadeOutDown 0.3s ease-out forwards'
      setTimeout(() => toast.remove(), 300)
      autoHideTimer = null
    }, duration)
    
    // ✅ 悬停时取消自动消失
    toast.addEventListener('mouseenter', () => {
      if (autoHideTimer) {
        clearTimeout(autoHideTimer)
        autoHideTimer = null
      }
    })
    
    // ✅ 离开后重新计时（缩短一半时间）
    toast.addEventListener('mouseleave', () => {
      if (!autoHideTimer && duration > 0) {
        autoHideTimer = window.setTimeout(() => {
          toast.style.animation = 'fadeOutDown 0.3s ease-out forwards'
          setTimeout(() => toast.remove(), 300)
        }, duration / 2)
      }
    })
  }
  
  return toast
}

/**
 * ✅ 显示通知（统一使用 FloatingToast）
 */
function showNotification(message: string) {
  FloatingToast.info('UMM', message)
}
