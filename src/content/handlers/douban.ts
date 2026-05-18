/**
 * 豆瓣详情页处理器
 * 功能：检测页面状态并注入状态标签
 */

import { Store, Utils } from '@/shared'
import type { UrlIdentity, MediaRecord } from '@/shared/types'
import { escapeHtml, waitForElement } from '../utils/dom'

/**
 * 处理豆瓣详情页面
 */
export async function handleDoubanDetailPage(identity: UrlIdentity): Promise<void> {
  console.log('[UMM] Handling Douban detail page:', identity)
  
  // 等待 #interest_sect_level 元素加载
  await waitForElement('#interest_sect_level', 5000)
  
  // 扫描页面状态（检测"我看过"或"我听过"）
  const pageState = scanDoubanPageStatus(identity)
  
  // 获取本地记录状态
  const localRecord = await getLocalRecord(identity)
  const isLocalDone = localRecord?.status === 2  // 2 = 已看/已听
  const isPageDone = pageState.status === 'done'
  
  // 合并状态：页面状态优先，其次本地记录
  const finalStatus = isPageDone || isLocalDone ? 2 : 0  // 2=已看, 0=未看
  const finalRating = Utils.clampRating10(
    isPageDone ? pageState.rating : localRecord?.rating || 0
  )
  
  // 生成备注信息
  const note = isLocalDone && !isPageDone ? '来自本地缓存' : ''
  
  // 渲染状态标签
  renderDoubanStatusChip(identity, finalStatus, finalRating, note)
  
  // 如果页面显示已看/已听，更新本地记录
  if (isPageDone) {
    console.log('[UMM Douban] Page shows watched status, saving to database...')
    
    // 生成复合主键 id
    const id = `${identity.provider}:${identity.type}:${identity.providerId}`
    
    const recordToSave: MediaRecord = {
      provider: identity.provider,
      type: identity.type,
      providerId: identity.providerId,
      id,  // 添加复合主键
      url: identity.url,
      status: 2,  // 已看
      rating: pageState.rating,
      updatedAt: new Date().toISOString(),
    }
    
    console.log('[UMM Douban] Record to save:', recordToSave)
    
    try {
      await Store.upsertRecord(recordToSave)
      console.log('[UMM Douban] ✅ Record saved successfully')
    } catch (error) {
      console.error('[UMM Douban] ❌ Failed to save record:', error)
    }
    
    console.log('[UMM] Updated local record from page state')
  } else {
    console.log('[UMM Douban] Page does not show watched status, skipping save')
  }
  
  // 注入 NeoDB 推送按钮
  injectNeoDBPushButtons(identity)
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
  
  // 检测是否包含“我看过”或“我听过”
  const isMovie = identity.type === 'movie' || identity.type === 'book'
  const watchedText = isMovie ? '我看过' : '我听过'
  
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
    const records = await Store.getRecordsByProviderType(identity.provider, identity.type)
    return records.find(r => r.providerId === identity.providerId) || null
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
  // 查找锚点元素（标题附近）
  const anchor = document.querySelector('#content h1') 
    || document.querySelector('span[property="v:itemreviewed"]')
  
  if (!anchor) {
    console.warn('[UMM] Could not find anchor element for status chip')
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
    ? (identity.type === 'music' ? '✅ 已听' : '✅ 已看')
    : (identity.type === 'music' ? '⏳ 未听' : '⏳ 未看')
  
  const ratingText = rating > 0 ? `${Utils.formatRating10(rating)}/10` : ''
  
  // XSS 防护：转义所有用户输入
  const escapedLabel = escapeHtml(label)
  const escapedRatingText = ratingText ? escapeHtml(ratingText) : ''
  const escapedNote = note ? escapeHtml(note) : ''
  
  chip.innerHTML = `
    <span class="umm-label">${escapedLabel}</span>
    ${escapedRatingText ? `<span class="umm-rating">${escapedRatingText}</span>` : ''}
    ${escapedNote ? `<span class="umm-note">${escapedNote}</span>` : ''}
  `
  
  // 添加 ARIA 属性 - 提升无障碍性
  chip.setAttribute('role', 'status')
  chip.setAttribute('aria-live', 'polite')
  chip.setAttribute('aria-label', `${label}${ratingText ? `, 评分${ratingText}` : ''}${note ? `, ${note}` : ''}`)
  
  return chip
}

/**
 * 在 #interest_sect_level 上方注入 NeoDB 推送按钮
 */
async function injectNeoDBPushButtons(identity: UrlIdentity) {
  const interestSect = document.querySelector('#interest_sect_level')
  if (!interestSect) {
    console.warn('[UMM] Could not find #interest_sect_level for NeoDB buttons')
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
      .umm-neodb-btn--minus { background: #a55a06; }
      .umm-neodb-btn--plus { background: #0f7a43; }
      .umm-neodb-btn--original { background: #1757d6; }
    `
    document.head.appendChild(style)
  }
  
  // 获取当前记录
  const localRecord = await getLocalRecord(identity)
  
  // 创建按钮容器
  const container = document.createElement('div')
  container.id = 'umm-neodb-push-buttons'
  container.style.cssText = `
    margin-top: 8px;
    margin-bottom: 8px;
    display: flex;
    gap: 8px;
    justify-content: flex-start;
    align-items: center;
  `
  
  // 获取当前评分（如果没有记录则为 0）
  const currentRating = localRecord?.rating || 0
  const ratingMinus = Utils.clampRating10(currentRating - 1)
  const ratingPlus = Utils.clampRating10(currentRating + 1)
  
  // 创建三个按钮（使用 createElement 避免 XSS）
  const pushMinusBtn = document.createElement('button')
  pushMinusBtn.id = 'umm-push-minus'
  pushMinusBtn.className = 'umm-neodb-btn umm-neodb-btn--minus'
  pushMinusBtn.textContent = `-1分 (${ratingMinus})`
  
  const pushPlusBtn = document.createElement('button')
  pushPlusBtn.id = 'umm-push-plus'
  pushPlusBtn.className = 'umm-neodb-btn umm-neodb-btn--plus'
  pushPlusBtn.textContent = `+1分 (${ratingPlus})`
  
  const pushOriginalBtn = document.createElement('button')
  pushOriginalBtn.id = 'umm-push-original'
  pushOriginalBtn.className = 'umm-neodb-btn umm-neodb-btn--original'
  pushOriginalBtn.textContent = `原分推送 (${currentRating})`
  
  container.appendChild(pushMinusBtn)
  container.appendChild(pushPlusBtn)
  container.appendChild(pushOriginalBtn)
  
  // 插入到 #interest_sect_level 上方
  interestSect.parentNode?.insertBefore(container, interestSect)
  
  // 绑定事件
  bindNeoDBPushEvents(identity, localRecord)
  
  console.log('[UMM] NeoDB push buttons injected')
}

/**
 * 绑定 NeoDB 推送按钮事件
 */
function bindNeoDBPushEvents(identity: UrlIdentity, record: any) {
  const pushMinusBtn = document.getElementById('umm-push-minus')
  const pushPlusBtn = document.getElementById('umm-push-plus')
  const pushOriginalBtn = document.getElementById('umm-push-original')
  
  if (pushMinusBtn) {
    pushMinusBtn.addEventListener('click', async () => {
      await pushToNeoDB(identity, record, -1)
    })
  }
  
  if (pushPlusBtn) {
    pushPlusBtn.addEventListener('click', async () => {
      await pushToNeoDB(identity, record, 1)
    })
  }
  
  if (pushOriginalBtn) {
    pushOriginalBtn.addEventListener('click', async () => {
      await pushToNeoDB(identity, record, 0)
    })
  }
}

/**
 * 推送到 NeoDB
 * @param ratingAdjust 评分调整值：-1, 0, +1
 */
async function pushToNeoDB(identity: UrlIdentity, record: any, ratingAdjust: number) {
  // 验证必要的字段
  const providerId = record?.providerId || identity.providerId
  if (!providerId) {
    showNotification('❌ 无法获取作品ID')
    return
  }
  
  try {
    // 获取 NeoDB Token
    const settings = await Store.getSettings()
    if (!settings.neodbToken) {
      showNotification('❌ 请先在设置中配置 NeoDB Token')
      return
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
    }
    
    // 调用 Background Service Worker 进行推送
    let response: any
    try {
      response = await chrome.runtime.sendMessage({
        type: 'NEODB_PUSH_RATING',
        payload: {
          record: neodbData,
          // 不在这里传递 token，由 Background 从存储中获取
        },
      })
    } catch (commError) {
      console.error('[UMM] Communication with background failed:', commError)
      showNotification('❌ 与后台服务通信失败，请重试')
      return
    }
    
    if (!response) {
      showNotification('❌ 后台服务未响应，请刷新页面')
      return
    }
    
    if (response.success) {
      showNotification(`✅ 已推送到 NeoDB (${adjustedRating}/10)`)
    } else {
      showNotification(`❌ 推送失败: ${response.message || '未知错误'}`)
    }
  } catch (error) {
    console.error('[UMM] Push to NeoDB failed:', error)
    showNotification('❌ 推送失败')
  }
}

/**
 * 显示通知
 */
function showNotification(message: string) {
  // 尝试使用 Chrome Notifications API
  if (chrome && chrome.notifications) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon-48.svg'),
      title: 'UMM',
      message,
    })
  } else {
    // ✅ 修复：通过 Background 发送 toast 消息,替代 alert
    if (chrome.runtime?.id) {
      chrome.runtime.sendMessage({
        type: 'SHOW_TOAST',
        payload: { type: 'info', title: '提示', message }
      }).catch(err => {
        console.warn('[Douban] Failed to send toast message:', err)
      })
    } else {
      console.warn('[Douban]', message)
    }
  }
}
