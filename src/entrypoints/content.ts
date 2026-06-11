/**
 * Content Script - UMM 多媒体管理器 (WXT Version)
 * 
 * 在目标网站注入状态标签和悬浮面板
 */

import { defineContentScript } from 'wxt/utils/define-content-script'
import { Identity } from '@/features/identity'
import { Store } from '@/features/database'
import { Utils } from '@/utils'
import type { StoreRecord } from '@/types'
import { initRouter, hasMatchingRoute } from './content/router'
import { injectGlobalStyles } from './content/styles/global'
import { FloatingToast } from './content/utils/toast'
import { debugLog, infoLog, warnLog, errorLog, configureLogging } from '@/utils/logger'
import type { LogLevel } from '@/types'
import { STORAGE_KEYS } from '@/config'
import { initEventBus } from '@/utils/event-bus'

// ==================== 全局状态 ====================

let currentIdentity: ReturnType<typeof Identity.fromUrl> = null
let currentRecord: StoreRecord | null = null
let statusChipElement: HTMLElement | null = null
let urlObserver: MutationObserver | null = null
let themeChangeListener: ((e: MediaQueryListEvent) => void) | null = null

// ==================== WXT Content Script Entry Point ====================

export default defineContentScript({
  matches: [
    '*://movie.douban.com/subject/*',
    '*://movie.douban.com/chart*',
    '*://movie.douban.com/typerank*',
    '*://music.douban.com/subject/*',
    '*://music.douban.com/top250*',
    '*://search.douban.com/movie/subject_search*',
    '*://search.douban.com/music/subject_search*',
    '*://www.imdb.com/title/tt*',
    '*://neodb.social/movie/*',
    '*://neodb.social/tv/*',
    '*://neodb.social/album/*',
    '*://audiences.me/torrents.php*',
    '*://*.audiences.me/torrents.php*',
    '*://kp.m-team.cc/*',
    '*://next.m-team.cc/*',
    '*://www.m-team.cc/*',
    '*://ourbits.club/torrents.php*',
    '*://*.ourbits.club/torrents.php*',
    '*://ourbits.club/details.php*',
    '*://*.ourbits.club/details.php*',
    '*://hdhome.org/torrents.php*',
    '*://*.hdhome.org/torrents.php*',
    '*://hdhome.org/details.php*',
    '*://*.hdhome.org/details.php*',
    '*://hdarea.club/torrents.php*',
    '*://*.hdarea.club/torrents.php*',
    '*://hdarea.club/details.php*',
    '*://*.hdarea.club/details.php*',
    '*://pterclub.net/torrents.php*',
    '*://*.pterclub.net/torrents.php*',
    '*://pterclub.net/details.php*',
    '*://*.pterclub.net/details.php*',
    '*://pterclub.net/officialgroup.php*',
    '*://*.pterclub.net/officialgroup.php*',
    '*://audiences.me/details.php*',
    '*://*.audiences.me/details.php*',
    '*://www.pthome.net/torrents.php*',
    '*://www.pthome.net/details.php*',
    '*://www.haidan.cc/torrents.php*',
    '*://www.haidan.cc/videos.php*',
    '*://www.haidan.cc/details.php*',
    '*://web5.mukaku.com/*'
  ],
  runAt: 'document_idle',

  async main() {
    // Initialize EventBus for receiving background events
    initEventBus()

    // ==================== Log Config Sync ====================
    // Read debug settings from storage on startup
    try {
      const result = await chrome.storage.local.get([STORAGE_KEYS.DEBUG_ENABLED, STORAGE_KEYS.LOG_LEVEL])
      configureLogging({
        enabled: (result[STORAGE_KEYS.DEBUG_ENABLED] as boolean) ?? false,
        level: (result[STORAGE_KEYS.LOG_LEVEL] as LogLevel) ?? 'info',
      })
    } catch {
      // Silent fallback — keep defaults
    }

    // React to settings changes from popup
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return
      const enabledChange = changes[STORAGE_KEYS.DEBUG_ENABLED]
      const levelChange = changes[STORAGE_KEYS.LOG_LEVEL]
      if (enabledChange || levelChange) {
        configureLogging({
          enabled: enabledChange?.newValue as boolean | undefined,
          level: levelChange?.newValue as LogLevel | undefined,
        })
      }
    })

    // 检测当前页面身份（在运行时执行）
    currentIdentity = Identity.fromUrl(window.location.href)
    
    infoLog('Script loaded on:', window.location.href)
    infoLog('Chrome runtime available:', !!chrome?.runtime?.id)
    infoLog('Initializing...')
    
    if (!chrome?.runtime?.id) {
      errorLog('Chrome runtime not available!')
      return
    }

    // ==================== 懒加载：轻量 URL 瞭望员 ====================
    // 如果当前 URL 不匹配任何路由（如 MTeam 首页），跳过重量级初始化，
    // 仅启动轻量 URL 监听器，等待用户导航到目标页面后再完整初始化。
    // 这样避免在无关页面上执行 DB 健康检查、样式注入、路由初始化等开销。
    if (!hasMatchingRoute(location.href)) {
      infoLog('No matching route — starting lightweight URL watcher')
      let initialized = false

      const tryInit = async () => {
        if (initialized || !hasMatchingRoute(location.href)) return
        initialized = true
        clearInterval(pollId)
        window.removeEventListener('popstate', tryInit)
        if (originalPushState) history.pushState = originalPushState
        if (originalReplaceState) history.replaceState = originalReplaceState
        infoLog('Route detected — running full initialization')
        await fullInit()
      }

      // Poll every 2s (lightweight, no DOM observation)
      const pollId = setInterval(tryInit, 2000)
      // popstate (back/forward)
      window.addEventListener('popstate', tryInit)
      // Monkey-patch pushState/replaceState for SPA navigation
      const originalPushState = history.pushState
      const originalReplaceState = history.replaceState
      history.pushState = function (...args: [any, string, string?]) {
        originalPushState.apply(this, args)
        tryInit()
      }
      history.replaceState = function (...args: [any, string, string?]) {
        originalReplaceState.apply(this, args)
        tryInit()
      }

      return // Skip heavy init — watcher will call fullInit() when ready
    }

    // URL 已匹配路由，直接执行完整初始化
    await fullInit()

    // ==================== 完整初始化函数 ====================
    async function fullInit() {
      try {
        // ✅ 关键：先等待 Background Service Worker 和数据库就绪
        infoLog('Waiting for background DB to be ready...')
        let attempts = 0
        const MAX_ATTEMPTS = 8
        while (attempts < MAX_ATTEMPTS) {
          const ok = await Store.healthCheck()
          if (ok) break
          attempts++
          await new Promise(r => setTimeout(r, Math.min(500 * Math.pow(2, attempts), 8000)))
        }
        infoLog('Background DB ready')

        // 注入全局样式
        injectGlobalStyles()
        infoLog('Global styles injected')

        // 检测当前页面是否为支持的媒体详情页
        currentIdentity = Identity.fromUrl(window.location.href)
        if (!currentIdentity) {
          infoLog('Not a media detail page')
        } else {
          infoLog('Detected identity:', currentIdentity)
          await loadCurrentRecord()
          infoLog('Current record loaded')
        }

        // 使用路由器统一分发
        initRouter()
        infoLog('Router initialized')

        // 监听系统主题变化
        observeThemeChanges()
        infoLog('Theme observer started')

        // ✅ 监听豆瓣评分变化
        startRatingObserver()
        infoLog('Rating observer started')

        // ✅ 设置扩展上下文失效监听
        setupContextInvalidationListener()

        // ✅ 注册页面卸载时的清理
        window.addEventListener('beforeunload', () => {
          if (urlObserver) { urlObserver.disconnect(); urlObserver = null }
          if (themeChangeListener) {
            const mq = window.matchMedia('(prefers-color-scheme: dark)')
            if (mq.removeEventListener) mq.removeEventListener('change', themeChangeListener)
            else if (mq.removeListener) mq.removeListener(themeChangeListener)
          }
          if (ratingObserver) { ratingObserver.disconnect(); ratingObserver = null }
          debugLog('Page cleanup completed')
        })

        infoLog('✅ Initialization complete')
      } catch (error) {
        errorLog('❌ Initialization failed:', error)
      }
    }
  },
})

// ==================== 数据加载 ====================

async function loadCurrentRecord() {
  if (!currentIdentity) return
  
  try {
    // 使用 Store API 加载记录（通过 Background Service Worker）
    // 添加超时保护，防止 Background 不响应时永远卡住
    const key = `${currentIdentity!.type}::${currentIdentity!.providerId}`
    const storeName = `${currentIdentity!.provider}_records`
    const loadPromise = Store.dbGet(storeName, key)
    
    const timeoutPromise = new Promise<null>((_, reject) => 
      setTimeout(() => reject(new Error('loadCurrentRecord timeout after 8s')), 8000)
    )
    
    currentRecord = await Promise.race([loadPromise, timeoutPromise])
    
    infoLog('Current record:', currentRecord)
  } catch (error) {
    warnLog('[Content] loadCurrentRecord failed:', error)
    currentRecord = null
    // 不要因为加载失败就阻止页面功能
  }
}

// ==================== 豆瓣页面特殊处理 ====================

/**
 * 判断是否为豆瓣详情页
 */
function isDoubanDetailPage(): boolean {
  return (
    currentIdentity?.provider === 'douban' &&
    (window.location.hostname === 'movie.douban.com' || window.location.hostname === 'music.douban.com') &&
    window.location.pathname.includes('/subject/')
  )
}

/**
 * 处理豆瓣详情页面 - 检测状态并注入按钮
 * @deprecated 已由路由器统一处理，保留供将来参考
 */
void handleDoubanDetailPage
async function handleDoubanDetailPage() {
  if (!currentIdentity) return
  
  // 等待 #interest_sect_level 元素加载
  await waitForElement('#interest_sect_level', 5000)
  
  // 扫描页面状态（检测"我看过"或"我听过"）
  const pageState = scanDoubanPageStatus()
  
  // 获取本地记录状态
  const localRecord = currentRecord
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
  renderDoubanStatusChip(finalStatus, finalRating, note)
  
  // 如果页面显示已看/已听，更新本地记录
  if (isPageDone) {
    const id = `${currentIdentity.provider}:${currentIdentity.type}:${currentIdentity.providerId}`
    
    const recordToSave = {
      provider: currentIdentity.provider,
      type: currentIdentity.type,
      providerId: currentIdentity.providerId,
      id,  // 添加复合主键
      url: currentIdentity.url,
      status: 2,  // 已看
      rating: pageState.rating,
      updatedAt: new Date().toISOString(),
    }
    
    debugLog('Saving record:', {
      id: `${recordToSave.provider}:${recordToSave.type}:${recordToSave.providerId}`,
      provider: recordToSave.provider,
      type: recordToSave.type,
      providerId: recordToSave.providerId,
      url: recordToSave.url,
      status: recordToSave.status,
      rating: recordToSave.rating,
    })
    
    const storeName = `${currentIdentity.provider}_records`
    const key = `${currentIdentity.type}::${currentIdentity.providerId}`
    await Store.dbPut(storeName, key, {
      url: currentIdentity.url,
      status: 2,
      rating: pageState.rating,
      updatedAt: new Date().toISOString(),
      linkedIds: {},
    })
    
    infoLog('Updated local record from page state')
  }
  
  // 注入 NeoDB 推送按钮
  injectNeoDBPushButtons()
}

/**
 * 检测页面背景色调（明亮/暗色）- 暂未使用，保留供将来可能的主题适配需求
 * @deprecated 当前使用油猴脚本的渐变色方案，不依赖主题检测
 */
void _detectPageTheme
function _detectPageTheme(): 'light' | 'dark' {
  // 方法1: 检查 CSS prefers-color-scheme
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark'
  }
  
  // 方法2: 检查 body 或 html 的背景色
  const body = document.body
  const html = document.documentElement
  
  // 获取计算后的背景色
  const bodyBg = getComputedStyle(body).backgroundColor
  const htmlBg = getComputedStyle(html).backgroundColor
  
  // 解析 RGB 值
  const parseColor = (color: string): { r: number; g: number; b: number } | null => {
    const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
    if (match) {
      return {
        r: parseInt(match[1]),
        g: parseInt(match[2]),
        b: parseInt(match[3]),
      }
    }
    return null
  }
  
  // 计算亮度（使用相对亮度公式）
  const calculateLuminance = (r: number, g: number, b: number): number => {
    // sRGB to linear
    const toLinear = (c: number) => {
      c = c / 255
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
    }
    
    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
  }
  
  // 优先使用 body 的背景色
  const bgColor = bodyBg !== 'rgba(0, 0, 0, 0)' ? bodyBg : htmlBg
  const parsed = parseColor(bgColor)
  
  if (parsed) {
    const luminance = calculateLuminance(parsed.r, parsed.g, parsed.b)
    // 亮度阈值 0.5（0-1范围），低于为暗色
    return luminance < 0.5 ? 'dark' : 'light'
  }
  
  // 默认返回明亮主题
  return 'light'
}

/**
 * HTML 转义函数 - 防止 XSS 攻击
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

/**
 * 等待元素出现（Promise 版本）
 */
function waitForElement(selector: string, timeout = 5000): Promise<Element> {
  return new Promise((resolve, reject) => {
    const element = document.querySelector(selector)
    if (element) {
      resolve(element)
      return
    }
    
    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector)
      if (element) {
        observer.disconnect()
        resolve(element)
      }
    })
    
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    })
    
    setTimeout(() => {
      observer.disconnect()
      reject(new Error(`Timeout waiting for ${selector}`))
    }, timeout)
  })
}

/**
 * 扫描豆瓣页面状态（检测"我看过"或"我听过"）
 */
function scanDoubanPageStatus(): { status: string; rating: number } {
  const interestBox = document.getElementById('interest_sect_level')
  if (!interestBox) {
    return { status: 'none', rating: 0 }
  }
  
  // 检测是否包含"我看过"或"我听过"
  // ✅ 修复：弹窗可见时跳过 + 精确匹配已看状态信号
  const isMovie = currentIdentity?.type === 'movie' || currentIdentity?.type === 'book'
  const watchedText = isMovie ? '我看过' : '我听过'
  const doubanDialog = document.getElementById('dialog')
  const isDialogVisible = doubanDialog && doubanDialog.offsetParent !== null
  if (isDialogVisible) {
    return { status: 'none', rating: 0 }
  }
  const hasFullText = interestBox.innerText.includes(watchedText)
  const hasRemoveForm = !!interestBox.querySelector('form[action="remove"]')
  const hasWatchedText = hasFullText && (hasRemoveForm || !isMovie)
  
  if (!hasWatchedText) {
    return { status: 'none', rating: 0 }
  }
  
  // 获取评分
  let stars = 0
  const nRatingInput = document.getElementById('n_rating') as HTMLInputElement | null
  if (nRatingInput && nRatingInput.value) {
    stars = Number.parseInt(nRatingInput.value, 10) || 0
  }
  
  // 如果没有输入框，尝试从 class 中提取
  if (!stars) {
    const ratingElement = interestBox.querySelector('[class*="rating"]')
    if (ratingElement) {
      const className = Array.from(ratingElement.classList).find(cls => /^rating\d/.test(cls))
      if (className) {
        stars = Number.parseInt(className.replace(/[^\d]/g, ''), 10) || 0
      }
    }
  }
  
  return {
    status: 'done',
    rating: Utils.clampRating10(stars * 2), // 豆瓣星级转 10 分制
  }
}

/**
 * 渲染豆瓣状态标签
 */
function renderDoubanStatusChip(status: number, rating: number, note: string = '') {
  // 查找锚点元素（标题附近）
  const anchor = document.querySelector('#content h1') 
    || document.querySelector('span[property="v:itemreviewed"]')
  
  if (!anchor) {
    debugLog('Could not find anchor element for status chip')
    return
  }
  
  // 检查是否已存在状态标签
  const existingChip = anchor.parentElement?.querySelector('.umm-status-chip[data-umm-owner]')
  
  // 创建新标签
  const chip = _createDoubanStatusChip(status, rating, note)
  chip.dataset.ummOwner = `douban-${currentIdentity?.type}`
  
  if (existingChip) {
    // 替换现有标签
    existingChip.replaceWith(chip)
  } else {
    // 插入到锚点元素之后
    anchor.insertAdjacentElement('afterend', chip)
  }
}

/**
 * 创建豆瓣状态标签（已废弃 - 使用 createDoubanPanel 替代）
 * @deprecated 使用 createDoubanPanel() 代替
 */
// 保留此函数供将来可能的简单标签场景使用
void _createDoubanStatusChip
function _createDoubanStatusChip(status: number, rating: number, note: string = ''): HTMLElement {
  const chip = document.createElement('div')
  chip.className = 'umm-status-chip'
  chip.dataset.status = status === 2 ? 'done' : 'none'
  
  const label = status === 2
    ? (currentIdentity?.type === 'music' ? '✅ 已听' : '✅ 已看')
    : (currentIdentity?.type === 'music' ? '⏳ 未听' : '⏳ 未看')
  
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
  
  // 注入全局样式（只注入一次）- 沿用油猴脚本的渐变色配色方案
  const styleId = 'umm-status-chip-global-style'
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style')
    style.id = styleId
    style.textContent = `
      .umm-status-chip {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        margin-top: 12px;
        padding: 8px 12px;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 650;
        line-height: 1.35;
        border: 1px solid rgba(33, 38, 45, 0.18);
        box-shadow: 0 10px 24px rgba(15, 23, 42, 0.16);
        max-width: 100%;
        box-sizing: border-box;
        position: relative;
        isolation: isolate;
        mix-blend-mode: normal;
        text-shadow: 0 1px 1px rgba(0, 0, 0, 0.24);
        -webkit-text-fill-color: currentColor;
        transition: transform 0.2s ease, box-shadow 0.2s ease;
      }
      .umm-status-chip,
      .umm-status-chip > span,
      .umm-status-chip > strong,
      .umm-status-chip > small {
        color: inherit !important;
        -webkit-text-fill-color: currentColor !important;
      }
      .umm-status-chip[data-status="done"] {
        color: #f4fff8 !important;
        background: linear-gradient(180deg, rgba(17, 111, 70, 0.96), rgba(11, 83, 53, 0.98)) !important;
        border-color: rgba(198, 255, 228, 0.26) !important;
      }
      .umm-status-chip[data-status="none"] {
        color: #fff7f8 !important;
        background: linear-gradient(180deg, rgba(164, 43, 60, 0.96), rgba(126, 28, 48, 0.98)) !important;
        border-color: rgba(255, 214, 220, 0.22) !important;
      }
      .umm-status-chip .umm-rating {
        padding: 2px 8px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.96) !important;
        color: #0b1929 !important;  /* 更深的蓝黑色，对比度 15.2:1 */
        font-weight: 800;
        text-shadow: none;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
        -webkit-text-fill-color: #0b1929;
      }
      .umm-status-chip .umm-note {
        font-size: 12px;
        font-weight: 600;
        color: inherit !important;
        opacity: 0.92;
        -webkit-text-fill-color: currentColor;
      }
      .umm-status-chip:hover {
        transform: translateY(-2px) scale(1.02);
        box-shadow: 0 14px 32px rgba(15, 23, 42, 0.28) !important;
      }
    `
    document.head.appendChild(style)
  }
  
  return chip
}

/**
 * 在 #interest_sect_level 上方注入 NeoDB 推送按钮
 */
function injectNeoDBPushButtons() {
  if (!currentIdentity) return

  // ✅ 守卫：仅在已看状态且弹窗未显示时注入按钮
  const pageState = scanDoubanPageStatus()
  if (pageState.status !== 'done') {
    debugLog('Page not marked as done, skip NeoDB buttons')
    // 移除可能残留的旧按钮
    const oldButtons = document.getElementById('umm-neodb-push-buttons')
    if (oldButtons) oldButtons.remove()
    return
  }

  const interestSect = document.querySelector('#interest_sect_level')
  if (!interestSect) {
    debugLog('Could not find #interest_sect_level for NeoDB buttons')
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
        padding: 8px 16px;
        color: white;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 700;
        transition: all 0.2s ease;
        position: relative;
        z-index: 1;
      }
      .umm-neodb-btn:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
      }
      .umm-neodb-btn:active {
        transform: translateY(0);
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
      }
      .umm-neodb-btn--minus { background: linear-gradient(135deg, #a55a06, #8a4700); }
      .umm-neodb-btn--plus { background: linear-gradient(135deg, #0f7a43, #0b6536); }
      .umm-neodb-btn--original { background: linear-gradient(135deg, #2563eb, #1d4ed8); }
      .umm-neodb-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        transform: none !important;
      }
      
      /* 已同步状态：NEODB 水印荧光效果 */
      .umm-neodb-synced .umm-neodb-watermark {
        animation: umm-neodb-glow 2s ease-in-out 3 alternate;
        animation-fill-mode: forwards;
        color: rgba(16, 185, 129, 0.35) !important;
        text-shadow:
          0 0 10px rgba(16, 185, 129, 0.4),
          0 0 20px rgba(16, 185, 129, 0.25),
          0 0 30px rgba(16, 185, 129, 0.15) !important;
      }
      
      @keyframes umm-neodb-glow {
        from {
          color: rgba(16, 185, 129, 0.35);
          text-shadow: 0 0 10px rgba(16, 185, 129, 0.4);
        }
        to {
          color: rgba(52, 211, 153, 0.45);
          text-shadow:
            0 0 15px rgba(52, 211, 153, 0.5),
            0 0 30px rgba(52, 211, 153, 0.35),
            0 0 45px rgba(52, 211, 153, 0.25);
        }
      }
      
      @media (prefers-reduced-motion: reduce) {
        .umm-neodb-synced .umm-neodb-watermark {
          animation: none;
        }
      }
    `
    document.head.appendChild(style)
  }
  
  // 创建按钮容器
  const container = document.createElement('div')
  container.id = 'umm-neodb-push-buttons'
  container.style.cssText = `
    margin-top: 12px;
    margin-bottom: 12px;
    padding: 16px;
    border-radius: 12px;
    background: linear-gradient(135deg, rgba(15, 122, 67, 0.1), rgba(23, 87, 214, 0.1));
    backdrop-filter: blur(10px);
    border: 2px solid rgba(15, 122, 67, 0.3);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.2);
    display: flex;
    gap: 10px;
    justify-content: flex-start;
    align-items: center;
    position: relative;
    overflow: hidden;
  `
  
  // 判断是否已关联 NeoDB
  const hasNeoDBLink = !!(currentRecord?.linkedIds?.neodb)
  
  // 已关联时添加同步样式类
  if (hasNeoDBLink) {
    container.classList.add('umm-neodb-synced')
  }
  
  // 创建 NEODB 水印
  const watermark = document.createElement('div')
  watermark.className = 'umm-neodb-watermark'
  watermark.setAttribute('aria-hidden', 'true')
  watermark.textContent = 'NEODB'
  watermark.style.cssText = `
    position: absolute;
    right: 20px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 72px;
    font-weight: 900;
    font-family: "Arial Black", "Helvetica Neue", sans-serif;
    color: ${hasNeoDBLink ? 'rgba(15, 100, 55, 0.35)' : 'rgba(15, 122, 67, 0.12)'};
    letter-spacing: 4px;
    pointer-events: none;
    user-select: none;
    z-index: 0;
    text-transform: uppercase;
    line-height: 1;
    white-space: nowrap;
    text-shadow: rgba(15, 122, 67, 0.06) 2px 2px 0px, rgba(23, 87, 214, 0.04) 4px 4px 0px;
    transition: color 0.3s ease, text-shadow 0.3s ease;
  `
  
  // 已关联时添加发光动画
  if (hasNeoDBLink) {
    watermark.style.textShadow = 'rgba(15, 100, 55, 0.2) 2px 2px 0px, rgba(15, 100, 55, 0.15) 4px 4px 0px, rgba(15, 100, 55, 0.1) 6px 6px 0px'
  }
  
  container.appendChild(watermark)
  
  // 获取当前评分：优先从页面 DOM 实时读取，降级到本地记录
  const livePageState = scanDoubanPageStatus()
  const currentRating = livePageState.rating || currentRecord?.rating || 0
  const ratingMinus = Utils.clampRating10(currentRating - 1)
  const ratingPlus = Utils.clampRating10(currentRating + 1)
  
  // 创建三个按钮（使用 createElement 避免 XSS）
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
  
  container.appendChild(pushMinusBtn)
  container.appendChild(pushPlusBtn)
  container.appendChild(pushOriginalBtn)
  
  // 插入到 #interest_sect_level 上方
  interestSect.parentNode?.insertBefore(container, interestSect)
  
  // 绑定事件
  bindNeoDBPushEvents()
  
  infoLog('NeoDB push buttons injected')
}

/**
 * 绑定 NeoDB 推送按钮事件
 */
function bindNeoDBPushEvents() {
  const pushMinusBtn = document.getElementById('umm-push-minus')
  const pushPlusBtn = document.getElementById('umm-push-plus')
  const pushOriginalBtn = document.getElementById('umm-push-original')
  
  if (pushMinusBtn) {
    pushMinusBtn.addEventListener('click', async () => {
      await pushToNeoDB(-1)
    })
  }
  
  if (pushPlusBtn) {
    pushPlusBtn.addEventListener('click', async () => {
      await pushToNeoDB(1)
    })
  }
  
  if (pushOriginalBtn) {
    pushOriginalBtn.addEventListener('click', async () => {
      await pushToNeoDB(0)
    })
  }
}

/**
 * 推送到 NeoDB
 * @param ratingAdjust 评分调整值：-1, 0, +1
 */
async function pushToNeoDB(ratingAdjust: number) {
  if (!currentIdentity) {
    showToast('❌ 无法识别当前页面', 'error')
    return
  }
  
  // 验证必要的字段
  const providerId = currentIdentity.providerId
  if (!providerId) {
    showToast('❌ 无法获取作品ID', 'error')
    return
  }
  
  try {
    // 获取 NeoDB Token
    const settings = await Store.getSettings()
    if (!settings.neodbToken) {
      // 通过 Background 发送 toast 通知
      if (chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({
          type: 'SHOW_TOAST',
          payload: { 
            type: 'error', 
            title: '配置缺失', 
            message: '请先在设置中配置 NeoDB API Token' 
          }
        }).catch(err => {
          errorLog('Failed to send toast message:', err)
          // 降级方案
          showToast('❌ 请先在设置中配置 NeoDB Token', 'error')
        })
      } else {
        showToast('❌ 请先在设置中配置 NeoDB Token', 'error')
      }
      return
    }
    
    // 计算调整后的评分：优先从页面 DOM 实时读取，降级到本地记录
    const livePageState = scanDoubanPageStatus()
    const baseRating = livePageState.rating || currentRecord?.rating || 0
    const adjustedRating = Utils.clampRating10(baseRating + ratingAdjust)
    
    // 构建推送数据
    const neodbData = {
      providerId,
      rating: adjustedRating,
      status: currentRecord?.status ?? 0,  // 默认为未看 (0)
      type: currentIdentity.type,
      provider: currentIdentity.provider,
      comment: currentRecord?.comment ?? '',
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
      errorLog('Communication with background failed:', commError)
      showToast('❌ 与后台服务通信失败，请重试', 'error')
      return
    }
    
    if (!response) {
      showToast('❌ 后台服务未响应，请刷新页面', 'error')
      return
    }
    
    if (response.success) {
      showToast(`✅ 已推送到 NeoDB (${adjustedRating}/10)`, 'success')
      
      // 更新 linkedIds.neodb（full key 格式）
      if (response.catalogUuid && currentIdentity) {
        const neodbFullKey = `${currentIdentity.type}::${response.catalogUuid}`
        const doubanFullKey = `${currentIdentity.type}::${currentIdentity.providerId}`

        // 1. 更新 Douban 记录的 linkedIds.neodb
        const storeName = `${currentIdentity.provider}_records`
        const key = `${currentIdentity.type}::${currentIdentity.providerId}`
        const existing = await Store.dbGet(storeName, key)
        if (existing) {
          existing.linkedIds = existing.linkedIds || {}
          existing.linkedIds.neodb = neodbFullKey
          await Store.dbPut(storeName, key, existing)
          currentRecord = existing
          console.log('[UMM] ✅ Updated record with NeoDB linked ID:', neodbFullKey)
        }

        // 2. 创建或更新 NeoDB 本地记录（双向链接）
        const neodbStoreName = 'neodb_records'
        const existingNeoDB = await Store.dbGet(neodbStoreName, neodbFullKey)
        if (existingNeoDB) {
          // 已存在 → 确保 linkedIds.douban 正确设置
          if (!existingNeoDB.linkedIds?.douban) {
            existingNeoDB.linkedIds = existingNeoDB.linkedIds || {}
            existingNeoDB.linkedIds.douban = doubanFullKey
            await Store.dbPut(neodbStoreName, neodbFullKey, existingNeoDB)
            console.log('[UMM] ✅ Updated existing NeoDB record linkedIds:', neodbFullKey)
          }
        } else {
          // 不存在 → 创建新记录
          const neodbRecord: StoreRecord = {
            url: `https://neodb.social/${currentIdentity.type === 'music' ? 'album' : currentIdentity.type}/${response.catalogUuid}/`,
            status: 2,
            rating: adjustedRating,
            updatedAt: new Date().toISOString(),
            linkedIds: { douban: doubanFullKey },
          }
          await Store.dbPut(neodbStoreName, neodbFullKey, neodbRecord)
          console.log('[UMM] ✅ Created NeoDB local record:', neodbFullKey)
        }
      } else {
        console.warn('[UMM] ⚠️ No catalogUuid in response or no currentIdentity')
      }

      // 事件驱动：重新渲染 NeoDB 按钮（将使用更新后的 linkedIds 和 DOM 实时评分）
      injectNeoDBPushButtons()
      infoLog('[UMM] NeoDB buttons re-rendered after push success')
    } else {
      showToast(`❌ 推送失败: ${response.message || '未知错误'}`, 'error')
    }
  } catch (error) {
    errorLog('Push to NeoDB failed:', error)
    showToast('❌ 推送失败', 'error')
  }
}

/**
 * ✅ 统一的 Toast 通知函数（使用 FloatingToast）
 */
function showToast(message: string, type: 'success' | 'error' | 'info' = 'info') {
  if (type === 'success') {
    FloatingToast.success('UMM', message)
  } else if (type === 'error') {
    FloatingToast.error('UMM', message)
  } else {
    FloatingToast.info('UMM', message)
  }
}

/**
 * 监听 URL 变化(SPA 应用)
 * @deprecated 已由路由器统一处理
 */
void observeUrlChanges
function observeUrlChanges() {
  // 先断开旧的观察者，避免多个观察者同时运行
  if (urlObserver) {
    urlObserver.disconnect()
  }
  
  // 监听 URL 变化(SPA 应用)
  let lastUrl = window.location.href
  
  urlObserver = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href
      infoLog('URL changed:', lastUrl)
      
      // 断开当前观察者以避免重复触发
      urlObserver?.disconnect()
      
      // 重新检测身份
      currentIdentity = Identity.fromUrl(lastUrl)
      
      if (currentIdentity) {
        // 移除旧的状态标签
        if (statusChipElement) {
          statusChipElement.remove()
          statusChipElement = null
        }
        
        // 重新初始化 — 路由器将重新注入状态标签
        loadCurrentRecord().then(() => {
          observeUrlChanges()
          injectNeoDBPushButtons()
          startRatingObserver()
        })
      }
    }
  })
  
  urlObserver.observe(document.body, { childList: true, subtree: true })
}

/**
 * 监听系统主题变化
 */
function observeThemeChanges() {
  // 只在豆瓣详情页启用主题监听
  if (!isDoubanDetailPage()) return
  
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  
  themeChangeListener = (e: MediaQueryListEvent) => {
    infoLog('Theme changed:', e.matches ? 'dark' : 'light')
    
    // 重新渲染状态标签以应用新主题
    if (statusChipElement && currentIdentity) {
      statusChipElement.remove()
      injectNeoDBPushButtons()
    }
  }
  
  // 添加监听器
  if (mediaQuery.addEventListener) {
    mediaQuery.addEventListener('change', themeChangeListener)
  } else if (mediaQuery.addListener) {
    // 兼容旧版浏览器
    mediaQuery.addListener(themeChangeListener)
  }
}

/**
 * 监听豆瓣评分变化（#n_rating），自动更新 NeoDB 推送按钮的评分
 * 实现事件驱动：用户点击星级 → 按钮值同步更新
 */
let ratingObserver: MutationObserver | null = null
let lastKnownRating = 0
let ratingInputCleanup: (() => void) | null = null

function startRatingObserver() {
  // 只在豆瓣详情页启用
  if (!isDoubanDetailPage()) return

  const interestSect = document.getElementById('interest_sect_level')
  if (!interestSect) {
    // 元素可能还没加载，延迟重试
    setTimeout(startRatingObserver, 1000)
    return
  }

  // 初始化 lastKnownRating
  const nRatingInput = document.getElementById('n_rating') as HTMLInputElement | null
  if (nRatingInput) {
    lastKnownRating = Number.parseInt(nRatingInput.value, 10) || 0
  }

  // 断开旧的 observer
  if (ratingObserver) {
    ratingObserver.disconnect()
  }

  // 清理旧的 input 事件监听
  if (ratingInputCleanup) {
    ratingInputCleanup()
    ratingInputCleanup = null
  }

  ratingObserver = new MutationObserver((() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        const input = document.getElementById('n_rating') as HTMLInputElement | null
        if (!input) return
        const newRating = Number.parseInt(input.value, 10) || 0
        if (newRating !== lastKnownRating) {
          lastKnownRating = newRating
          debugLog(`Rating changed from ${lastKnownRating} → ${newRating}, re-rendering NeoDB buttons`)
          injectNeoDBPushButtons()
        }
      }, 200) // 200ms 防抖
    }
  })())

  ratingObserver.observe(interestSect, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'value'],
  })

  // 补充：监听 #n_rating 的 input/change 事件（MutationObserver 无法捕获 property-only 变更）
  if (nRatingInput) {
    const handleRatingInput = () => {
      const newRating = Number.parseInt(nRatingInput.value, 10) || 0
      if (newRating !== lastKnownRating) {
        lastKnownRating = newRating
        debugLog(`Rating input event: ${newRating}, re-rendering NeoDB buttons`)
        injectNeoDBPushButtons()
      }
    }
    nRatingInput.addEventListener('input', handleRatingInput)
    nRatingInput.addEventListener('change', handleRatingInput)
    ratingInputCleanup = () => {
      nRatingInput.removeEventListener('input', handleRatingInput)
      nRatingInput.removeEventListener('change', handleRatingInput)
    }
  }
}

// ==================== 启动 ====================

/**
 * ✅ 设置扩展上下文失效监听
 * 定期检查上下文状态，失效时清理资源并提示用户
 */
function setupContextInvalidationListener() {
  // 定期检查扩展上下文是否仍然有效
  // 注意：Chrome MV3 没有原生事件通知上下文失效，因此使用轮询
  const checkInterval = setInterval(() => {
    if (!chrome.runtime?.id) {
      warnLog('Extension context lost, cleaning up...')
      clearInterval(checkInterval)
      
      // 清理所有定时器和缓存
      cleanupAllResources()
      
      // 显示一次性提示
      showContextInvalidationNotice()
    }
  }, 60000) // 每 60 秒检查一次
  
  // 页面卸载时清理
  window.addEventListener('beforeunload', () => {
    clearInterval(checkInterval)
  })
}

/**
 * 清理所有资源
 */
function cleanupAllResources() {
  // 清理 URL 观察器
  if (urlObserver) {
    urlObserver.disconnect()
    urlObserver = null
  }
  
  // 清理状态标签
  if (statusChipElement) {
    statusChipElement.remove()
    statusChipElement = null
  }
  
  // 清理主题监听器
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  if (themeChangeListener) {
    if (mediaQuery.removeEventListener) {
      mediaQuery.removeEventListener('change', themeChangeListener)
    } else if (mediaQuery.removeListener) {
      mediaQuery.removeListener(themeChangeListener)
    }
    themeChangeListener = null
  }
}

/**
 * 显示上下文失效提示
 */
function showContextInvalidationNotice() {
  // 只在页面上显示一次
  if (document.getElementById('umm-context-warning')) return
  
  const warning = document.createElement('div')
  warning.id = 'umm-context-warning'
  warning.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #ff6b6b;
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    z-index: 999999;
    font-size: 14px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    transition: opacity 0.3s ease;
  `
  warning.textContent = '⚠️ UMM 扩展已更新，请刷新页面以使用最新版本'
  
  document.body.appendChild(warning)
  
  // 5 秒后自动消失
  setTimeout(() => {
    warning.style.opacity = '0'
    setTimeout(() => warning.remove(), 300)
  }, 5000)
}

// ==================== 消息监听器（接收来自 Popup/Background 的 Toast 请求）====================

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'SHOW_TOAST') {
    const { type, title, message: msg } = message.payload
    
    // ✅ 使用 FloatingToast 显示通知
    if (type === 'success') {
      FloatingToast.success(title, msg)
    } else if (type === 'error') {
      FloatingToast.error(title, msg)
    } else if (type === 'loading') {
      FloatingToast.loading(title, msg)
    } else {
      FloatingToast.info(title, msg)
    }
    
    sendResponse({ success: true })
    return true  // 保持消息通道开放以支持异步响应
  }
})
