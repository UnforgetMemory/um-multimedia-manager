/**
 * 豆瓣 NeoDB 推送函数
 * 功能：注入 NeoDB 推送按钮、事件绑定、推送核心逻辑
 */

import { Store } from '@/features/database'
import { Utils } from '@/utils'
import { safeSendMessage } from '@/utils/context'
import type { UrlIdentity, StoreRecord } from '@/types'
import { FloatingToast } from '../utils/toast'
import { scanDoubanPageStatus, extractCrossPlatformLinks } from './douban-scanner'
import { getLocalRecord } from './douban-sync'
import { showPageToast, showNotification } from './douban-toast'

/**
 * 在 #interest_sect_level 上方注入 NeoDB 推送按钮
 */
/**
 * 注入 NeoDB 推送按钮
 * @param cachedRecord 可选的缓存记录，避免重复查询
 */
export async function injectNeoDBPushButtons(
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
  
  // 获取当前评分：优先从页面 DOM 实时读取，降级到本地记录
  const livePageState = scanDoubanPageStatus(identity)
  const currentRating = livePageState.rating || localRecord?.rating || 0
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
  
  // 计算调整后的评分：优先从页面 DOM 实时读取，降级到记录
  const livePageState = scanDoubanPageStatus(identity)
  const baseRating = livePageState.rating || record?.rating || 0
  const adjustedRating = Utils.clampRating10(baseRating + ratingAdjust)
  
  // 构建推送数据
  const neodbData = {
    providerId,
    rating: adjustedRating,
    status: record?.status ?? 0,
    type: identity.type,
    provider: identity.provider,
    url: window.location.href,  // ✅ 修复：使用原始 URL，与旧脚本一致
    comment: record?.comment ?? '',
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

    // ✅ 创建/更新本地 NeoDB 记录并建立跨平台关联
    const catalogUuid = response.catalogUuid
    if (catalogUuid) {
      const neodbFullKey = `${identity.type}::${catalogUuid}`
      const doubanFullKey = `${identity.type}::${identity.providerId}`
      const storeName = `${identity.provider}_records`
      const now = new Date().toISOString()

      // 1. 更新豆瓣记录的 linkedIds.neodb
      const existingDouban = await Store.dbGet(storeName, doubanFullKey)
      if (existingDouban) {
        existingDouban.linkedIds = existingDouban.linkedIds || {}
        if (existingDouban.linkedIds.neodb !== neodbFullKey) {
          existingDouban.linkedIds.neodb = neodbFullKey
          await Store.dbPut(storeName, doubanFullKey, existingDouban)
          console.log('[UMM Douban] ✅ Updated Douban linkedIds.neodb via push:', neodbFullKey)
        }
      }

      // 2. 从页面提取跨平台关联（IMDB/TMDB）
      const pageLinks = extractCrossPlatformLinks(identity)
      const neodbLinkedIds: Record<string, string> = { douban: doubanFullKey }
      if (pageLinks.imdb) neodbLinkedIds.imdb = pageLinks.imdb
      if (pageLinks.tmdb) neodbLinkedIds.tmdb = pageLinks.tmdb

      // 3. 创建/更新 NeoDB 本地记录
      const neodbStoreName = 'neodb_records'
      const existingNeoDB = await Store.dbGet(neodbStoreName, neodbFullKey)
      if (existingNeoDB) {
        existingNeoDB.linkedIds = {
          ...(existingNeoDB.linkedIds || {}),
          ...neodbLinkedIds,
        }
        await Store.dbPut(neodbStoreName, neodbFullKey, existingNeoDB)
        console.log('[UMM Douban] ✅ Updated existing NeoDB record via push:', neodbFullKey, 'linkedIds:', existingNeoDB.linkedIds)
      } else {
        const neodbRecord: StoreRecord = {
          url: `https://neodb.social/${identity.type === 'music' ? 'album' : identity.type}/${catalogUuid}/`,
          status: record?.status ?? 0,
          rating: adjustedRating,
          updatedAt: now,
          linkedIds: neodbLinkedIds,
        }
        await Store.dbPut(neodbStoreName, neodbFullKey, neodbRecord)
        console.log('[UMM Douban] ✅ Created NeoDB local record via push:', neodbFullKey, 'linkedIds:', neodbLinkedIds)
      }

      // 4. 反方向：更新 IMDB/TMDB 记录的 linkedIds 以包含 neodb
      const imdbKey = pageLinks.imdb
      if (imdbKey) {
        const [imdbType, imdbId] = imdbKey.split('::')
        const imdbStoreKey = `${imdbType}::${imdbId}`
        const existingImdb = await Store.dbGet('imdb_records', imdbStoreKey)
        if (existingImdb) {
          existingImdb.linkedIds = existingImdb.linkedIds || {}
          if (existingImdb.linkedIds.neodb !== neodbFullKey) {
            existingImdb.linkedIds.neodb = neodbFullKey
            await Store.dbPut('imdb_records', imdbStoreKey, existingImdb)
            console.log('[UMM Douban] ✅ Updated IMDB linkedIds.neodb via push:', imdbStoreKey)
          }
        }
      }
      const tmdbKey = pageLinks.tmdb
      if (tmdbKey) {
        const [tmdbType, tmdbId] = tmdbKey.split('::')
        const tmdbStoreKey = `${tmdbType}::${tmdbId}`
        const existingTmdb = await Store.dbGet('tmdb_records', tmdbStoreKey)
        if (existingTmdb) {
          existingTmdb.linkedIds = existingTmdb.linkedIds || {}
          if (existingTmdb.linkedIds.neodb !== neodbFullKey) {
            existingTmdb.linkedIds.neodb = neodbFullKey
            await Store.dbPut('tmdb_records', tmdbStoreKey, existingTmdb)
            console.log('[UMM Douban] ✅ Updated TMDB linkedIds.neodb via push:', tmdbStoreKey)
          }
        }
      }

      // 在 linkedIds 全部保存后，通过 FloatingToast 确认 ID 关联已保存
      FloatingToast.info('UMM', '🔗 跨平台 ID 关联已保存')
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
