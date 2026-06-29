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
import { t } from '../i18n'
import { infoLog } from '@/utils/logger'
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
    infoLog('Page not marked as done, skip NeoDB buttons')
    return
  }
  
  const overlay = document.getElementById('umm-detail-mask') ?? document.getElementById('umm-douban-overlay')
  const oldButtons = overlay?.shadowRoot?.getElementById('umm-neodb-push-buttons')
    ?? document.getElementById('umm-neodb-push-buttons')
  if (oldButtons) {
    oldButtons.remove()
  }
  
  // ✅ P1: 使用缓存的记录，避免重复查询
  infoLog('injectNeoDBPushButtons called, record:', !!record)
  const localRecord = record || await getLocalRecord(identity)
  
  // ✅ 调试：输出完整的记录信息
  infoLog('Local record after query:', localRecord ? {
    rating: localRecord.rating,
    status: localRecord.status,
    linkedIds: localRecord.linkedIds
  } : 'null')
  
  // ✅ P1: 创建按钮容器（带 NeoDB 高级感背景，提高对比度）
  const container = document.createElement('div')
  container.id = 'umm-neodb-push-buttons'
  container.className = 'umm-neodb-push-buttons'
  
  // ✅ 检查是否已通过linkedIds同步到 NeoDB
  const isSynced = !!(localRecord?.linkedIds?.neodb)
  infoLog('Checking synced state:', {
    linkedIds: localRecord?.linkedIds,
    isSynced: !!isSynced
  })
  if (isSynced) {
    container.classList.add('umm-neodb-synced')
    infoLog('Applied umm-neodb-synced class to container')
  }

  const watermark = document.createElement('div')
  watermark.className = 'umm-neodb-watermark'
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
  pushMinusBtn.textContent = t('neodb.btn_minus', { rating: ratingMinus })
  pushMinusBtn.title = t('neodb.title_minus')
  container.appendChild(pushMinusBtn)

  const pushPlusBtn = document.createElement('button')
  pushPlusBtn.id = 'umm-push-plus'
  pushPlusBtn.className = 'umm-neodb-btn umm-neodb-btn--plus'
  pushPlusBtn.textContent = t('neodb.btn_plus', { rating: ratingPlus })
  pushPlusBtn.title = t('neodb.title_plus')
  container.appendChild(pushPlusBtn)

  const pushOriginalBtn = document.createElement('button')
  pushOriginalBtn.id = 'umm-push-original'
  pushOriginalBtn.className = 'umm-neodb-btn umm-neodb-btn--original'
  pushOriginalBtn.textContent = t('neodb.btn_original', { rating: currentRating })
  pushOriginalBtn.title = t('neodb.title_original')
  container.appendChild(pushOriginalBtn)
  
  const interestSect = document.getElementById('interest_sect_level')
  const neodbActions = overlay?.shadowRoot?.querySelector('#umm-neodb-actions')
  if (neodbActions) {
    neodbActions.appendChild(container)
  } else if (interestSect) {
    interestSect.parentNode?.insertBefore(container, interestSect)
  }
  
  // ✅ P0: 使用事件委托绑定事件（避免内存泄漏）
  bindNeoDBPushEvents(identity, localRecord, container)
  
  infoLog('NeoDB push buttons injected')
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
      await pushToNeoDB(identity, record, -1, container)
    } else if (target.id === 'umm-push-plus') {
      await pushToNeoDB(identity, record, 1, container)
    } else if (target.id === 'umm-push-original') {
      await pushToNeoDB(identity, record, 0, container)
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
  ratingAdjust: number,
  container: HTMLElement
) {
  // ✅ P0: 验证必要的字段
  const providerId = identity.providerId
  if (!providerId) {
    showPageToast(t('neodb.no_id'), 'error', 3000)
    return
  }
  
  const allButtons = Array.from(
    container.querySelectorAll('#umm-push-minus, #umm-push-plus, #umm-push-original')
  ) as HTMLButtonElement[]
  
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
  const toast = showPageToast(t('neodb.pushing'), 'loading')
  
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
    showPageToast(successMessage || t('neodb.sync_success'), 'success', 3000)
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : t('neodb.sync_failed')
    
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
    throw new Error(t('neodb.no_id'))
  }
  
  // 获取 NeoDB Token
  const settings = await Store.getSettings()
  if (!settings.neodbToken) {
    throw new Error(t('neodb.config_missing'))
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
        showNotification(t('neodb.context_invalid'))
      }
    }
  )
  
  if (!response) {
    // safeSendMessage 已经处理了错误和 fallback
    throw new Error(t('neodb.comm_failed'))
  }
  
  if (response.success) {
    // ✅ 成功：重新查询数据库以获取最新的 neodbUuid
    const updatedRecord = await getLocalRecord(identity)
    infoLog('Updated record after sync:', updatedRecord ? 'Found' : 'Not found')
    if (updatedRecord) {
      infoLog('Updated record after sync:', { linkedIds: updatedRecord.linkedIds })
    }
    
    // ✅ 更新按钮容器的荧光效果状态
    const c = document.getElementById('umm-neodb-push-buttons')
      ?? overlay?.shadowRoot?.getElementById('umm-neodb-push-buttons')
    if (c && updatedRecord) {
      const isSynced = !!(updatedRecord.linkedIds?.neodb)
      if (isSynced) {
        c.classList.add('umm-neodb-synced')
        infoLog('Applied synced glow effect to buttons')
      } else {
        c.classList.remove('umm-neodb-synced')
        infoLog('Removed synced glow effect from buttons')
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
          infoLog('[Douban] ✅ Updated Douban linkedIds.neodb via push:', neodbFullKey)
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
        infoLog('[Douban] ✅ Updated existing NeoDB record via push:', neodbFullKey, 'linkedIds:', existingNeoDB.linkedIds)
      } else {
        const neodbRecord: StoreRecord = {
          url: `https://neodb.social/${identity.type === 'music' ? 'album' : identity.type}/${catalogUuid}/`,
          status: record?.status ?? 0,
          rating: adjustedRating,
          updatedAt: now,
          linkedIds: neodbLinkedIds,
        }
        await Store.dbPut(neodbStoreName, neodbFullKey, neodbRecord)
        infoLog('[Douban] ✅ Created NeoDB local record via push:', neodbFullKey, 'linkedIds:', neodbLinkedIds)
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
            infoLog('[Douban] ✅ Updated IMDB linkedIds.neodb via push:', imdbStoreKey)
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
            infoLog('[Douban] ✅ Updated TMDB linkedIds.neodb via push:', tmdbStoreKey)
          }
        }
      }

      // 在 linkedIds 全部保存后，通过 FloatingToast 确认 ID 关联已保存
      FloatingToast.info('UMM', t('neodb.cross_link_saved'))
    }

    // 成功，返回消息供外层显示
    return response.message || t('neodb.push_success', { rating: adjustedRating })
  } else {
    // ✅ 显示具体错误原因
    const errorMsg = response.message || t('neodb.sync_failed')
    
    // 如果是"未标记已看"的错误，提供引导
    if (errorMsg.includes('请先在豆瓣标记')) {
      console.warn('[UMM] User needs to mark as watched first')
    }
    
    throw new Error(errorMsg)
  }
}
