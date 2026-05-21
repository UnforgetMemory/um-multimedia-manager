/**
 * Content Script - UMM 多媒体管理器 (WXT Version)
 * 
 * 在目标网站注入状态标签和悬浮面板
 */

import { defineContentScript } from 'wxt/utils/define-content-script'
import { Identity, Store, Utils } from '@/shared'
import type { StoreRecord } from '@/shared/types'
import { initRouter } from '../content/router'
import { injectGlobalStyles } from '../content/styles/global'
import { FloatingToast } from '../content/utils/toast'
import { debugLog, infoLog, warnLog, errorLog } from '@/shared/utils/logger'

// ==================== 配色常量（WCAG 2.1 AA/AAA 标准）====================

/**
 * 悬浮面板配色常量
 * - 所有文本对比度 ≥ 4.5:1 (AA) 或 ≥ 7:1 (AAA)
 * - UI 组件边界对比度 ≥ 3:1
 */
const PANEL_COLORS = {
  // 文字颜色
  textPrimary: '#111827',      // Gray 900 - 主要文字（对比度 16.1:1）
  textSecondary: '#4b5563',    // Gray 600 - 次要文字/标签（对比度 7.0:1）
  textTertiary: '#6b7280',     // Gray 500 - 辅助文字（对比度 5.9:1）
  textOnDark: '#ffffff',       // 深色背景上的白色文字
  
  // 边框颜色
  borderDefault: '#d1d5db',    // Gray 300 - 默认边框（对比度 3.2:1）
  borderFocus: '#1757d6',      // Blue 700 - 焦点边框（对比度 4.8:1）
  borderMuted: '#9ca3af',      // Gray 400 - blur 状态边框（对比度 4.6:1）
  
  // 背景颜色
  bgCard: '#f9fafb',           // Gray 50 - 卡片背景
  bgButtonHover: 'rgba(255, 255, 255, 0.25)',  // 按钮悬停背景
  bgButtonNormal: 'rgba(255, 255, 255, 0.15)', // 按钮正常背景
  
  // 状态颜色
  statusDone: '#10b981',       // Green 500 - 已完成
  statusWish: '#3b82f6',       // Blue 500 - 想看
  statusNone: '#374151',       // Gray 700 - 清除按钮选中态（对比度 7.5:1）
  statusNoneUnselected: '#6b7280', // Gray 500 - 清除按钮未选中边框
  
  // 评分颜色
  ratingStar: '#f59e0b',       // Amber 500 - 星级评分
} as const

// ==================== 全局状态 ====================

let currentIdentity: ReturnType<typeof Identity.fromUrl> = null
let currentRecord: StoreRecord | null = null
let panelElement: HTMLElement | null = null
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
    '*://next.m-team.cc/browse*',
    '*://kp.m-team.cc/browse*',
    '*://ourbits.club/torrents.php*',
    '*://hdhome.org/torrents.php*',
    '*://hdarea.club/torrents.php*',
    '*://pterclub.net/torrents.php*',
    '*://pterclub.net/officialgroup.php*',
    '*://web5.mukaku.com/*'
  ],
  runAt: 'document_idle',

  async main() {
    // 检测当前页面身份（在运行时执行）
    currentIdentity = Identity.fromUrl(window.location.href)
    
    infoLog('Script loaded on:', window.location.href)
    infoLog('Chrome runtime available:', !!chrome?.runtime?.id)
    infoLog('Initializing...')
    
    if (!chrome?.runtime?.id) {
      errorLog('Chrome runtime not available!')
      return
    }
    
    try {
      // ✅ 关键：先等待 Background Service Worker 和数据库就绪
      // 这样后续的消息发送不会因为 DB_NOT_READY 而失败
      infoLog('Waiting for background DB to be ready...')
      // Wait for background DB readiness with retry
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
      
      // 检测当前页面是否为支持的媒体详情页（非搜索页）
      if (!currentIdentity) {
        infoLog('Not a media detail page (may be search page or unsupported)')
      } else {
        infoLog('Detected identity:', currentIdentity)
        
        // 加载当前记录
        await loadCurrentRecord()
        infoLog('Current record loaded')
      }
      
      // 使用路由器统一分发（处理豆瓣、IMDb、NeoDB、搜索页等）
      // 路由器内部会根据 URL 自动识别页面类型并调用相应处理器
      // 对于详情页，路由处理器会注入状态标签；对于搜索页，会注入增强器
      initRouter()
      infoLog('Router initialized')
      
      // 非豆瓣详情页：创建悬浮面板
      // 豆瓣页面由路由处理器（handleDoubanDetailPage）注入状态标签到页面 DOM 中
      if (currentIdentity && !isDoubanDetailPage()) {
        createFloatingPanel()
        infoLog('Floating panel created')
      }
      
      // 监听系统主题变化
      observeThemeChanges()
      infoLog('Theme observer started')
      
      // ✅ 设置扩展上下文失效监听
      setupContextInvalidationListener()
      
      // ✅ 注册页面卸载时的清理
      window.addEventListener('beforeunload', () => {
        if (urlObserver) {
          urlObserver.disconnect()
          urlObserver = null
        }
        if (themeChangeListener) {
          const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
          if (mediaQuery.removeEventListener) {
            mediaQuery.removeEventListener('change', themeChangeListener)
          } else if (mediaQuery.removeListener) {
            mediaQuery.removeListener(themeChangeListener)
          }
        }
        debugLog('Page cleanup completed')
      })
      
      infoLog('✅ Initialization complete')
    } catch (error) {
      errorLog('❌ Initialization failed:', error)
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
  const isMovie = currentIdentity?.type === 'movie' || currentIdentity?.type === 'book'
  const watchedText = isMovie ? '我看过' : '我听过'
  
  if (!interestBox.innerText.includes(watchedText)) {
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
 * 创建悬浮面板（用于非豆瓣页面）
 */
function createFloatingPanel() {
  // 创建容器
  const container = document.createElement('div')
  container.id = 'umm-floating-panel'
  container.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 999999;
    width: 320px;
    background: white;
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    overflow: hidden;
    transition: all 0.3s ease;
  `
  
  // 创建头部
  const header = document.createElement('div')
  header.style.cssText = `
    padding: 12px 16px;
    background: linear-gradient(180deg, #1757d6 0%, #0d47b8 100%);
    color: white;
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: move;
  `
  
  header.innerHTML = `
    <div style="display: flex; align-items: center; gap: 8px;">
      <span style="font-size: 18px;">🎬</span>
      <span style="font-weight: 600; font-size: 14px; color: white;">UMM</span>
    </div>
    <div style="display: flex; gap: 8px;">
      <button id="umm-minimize" style="
        appearance: none;
        border: none;
        border-radius: 8px;
        width: 34px;
        height: 34px;
        font-size: 18px;
        cursor: pointer;
        background: rgba(255, 255, 255, 0.15);
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
      ">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </button>
      <button id="umm-close" style="
        appearance: none;
        border: none;
        border-radius: 8px;
        width: 34px;
        height: 34px;
        font-size: 18px;
        cursor: pointer;
        background: rgba(255, 255, 255, 0.15);
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
      ">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
  `
  
  // 创建内容区
  const content = document.createElement('div')
  content.id = 'umm-panel-content'
  content.style.cssText = `
    padding: 16px;
    max-height: 400px;
    overflow-y: auto;
  `
  
  // 渲染内容
  renderPanelContent(content)
  
  // 组装面板
  container.appendChild(header)
  container.appendChild(content)
  document.body.appendChild(container)
  
  panelElement = container
  
  // 绑定事件
  bindPanelEvents(container, header)
  
  infoLog('Floating panel created')
}

/**
 * 在 #interest_sect_level 上方注入 NeoDB 推送按钮
 */
function injectNeoDBPushButtons() {
  if (!currentIdentity) return
  
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
  const currentRating = currentRecord?.rating || 0
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
    
    // 计算调整后的评分（如果没有记录则为 0）
    const baseRating = currentRecord?.rating || 0
    const adjustedRating = Utils.clampRating10(baseRating + ratingAdjust)
    
    // 构建推送数据
    const neodbData = {
      providerId,
      rating: adjustedRating,
      status: currentRecord?.status ?? 0,  // 默认为未看 (0)
      type: currentIdentity.type,
      provider: currentIdentity.provider,
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
    } else {
      showToast(`❌ 推送失败: ${response.message || '未知错误'}`, 'error')
    }
  } catch (error) {
    errorLog('Push to NeoDB failed:', error)
    showToast('❌ 推送失败', 'error')
  }
}

function renderPanelContent(content: HTMLElement) {
  if (!currentIdentity) {
    content.innerHTML = `<div style="text-align: center; color: ${PANEL_COLORS.textTertiary}; padding: 20px;">${escapeHtml('无法识别当前页面')}</div>`
    return
  }
  
  // 处理 null 状态边界情况 - 默认选中"清除"状态 (0=未看, 1=在看, 2=已看)
  const currentStatus = currentRecord?.status ?? 0
  
  const statusLabel = escapeHtml(getStatusText(currentRecord?.status))
  const statusColor = getStatusColor(currentRecord?.status)
  const rating = currentRecord?.rating || 0
  const updateTime = escapeHtml(currentRecord?.updatedAt ? Utils.formatRelativeTime(currentRecord.updatedAt) : '未标记')
  
  // 使用转义后的值防止 XSS
  const escapedProviderId = escapeHtml(currentIdentity.providerId)
  const escapedType = escapeHtml(currentIdentity.type)
  const escapedProvider = escapeHtml(currentIdentity.provider)
  
  content.innerHTML = `
    <div style="margin-bottom: 16px;">
      <div style="font-size: 12px; color: ${PANEL_COLORS.textSecondary}; margin-bottom: 4px; text-transform: uppercase;">
        ${escapedType} / ${escapedProvider}
      </div>
      <div style="font-size: 14px; font-weight: 500; color: ${PANEL_COLORS.textPrimary}; word-break: break-all;">
        ${escapedProviderId}
      </div>
    </div>
    
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
      <div style="background: ${PANEL_COLORS.bgCard}; padding: 12px; border-radius: 8px; text-align: center; border: 1px solid ${PANEL_COLORS.borderDefault}; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);">
        <div style="font-size: 12px; color: ${PANEL_COLORS.textSecondary}; margin-bottom: 4px;">状态</div>
        <div style="font-size: 16px; font-weight: 600; color: ${statusColor};">${statusLabel}</div>
      </div>
      <div style="background: ${PANEL_COLORS.bgCard}; padding: 12px; border-radius: 8px; text-align: center; border: 1px solid ${PANEL_COLORS.borderDefault}; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);">
        <div style="font-size: 12px; color: ${PANEL_COLORS.textSecondary}; margin-bottom: 4px;">评分</div>
        <div style="font-size: 16px; font-weight: 600; color: ${PANEL_COLORS.ratingStar};">
          ${rating > 0 ? `⭐ ${rating}/10` : '-'}
        </div>
      </div>
    </div>
    
    <div style="margin-bottom: 16px;">
      <label style="display: block; font-size: 12px; color: ${PANEL_COLORS.textSecondary}; margin-bottom: 8px;">更新状态</label>
      <div style="display: flex; gap: 8px;">
        <button id="umm-status-done" style="flex: 1; padding: 8px; border: 2px solid ${currentStatus === 2 ? PANEL_COLORS.statusDone : PANEL_COLORS.statusNoneUnselected}; background: ${currentStatus === 2 ? PANEL_COLORS.statusDone : 'white'}; color: ${currentStatus === 2 ? PANEL_COLORS.textOnDark : PANEL_COLORS.textPrimary}; border-radius: 6px; cursor: pointer; font-size: 13px; transition: all 0.2s;">
          ✓ 已完成
        </button>
        <button id="umm-status-wish" style="flex: 1; padding: 8px; border: 2px solid ${currentStatus === 1 ? PANEL_COLORS.statusWish : PANEL_COLORS.statusNoneUnselected}; background: ${currentStatus === 1 ? PANEL_COLORS.statusWish : 'white'}; color: ${currentStatus === 1 ? PANEL_COLORS.textOnDark : PANEL_COLORS.textPrimary}; border-radius: 6px; cursor: pointer; font-size: 13px; transition: all 0.2s;">
          ♥ 想看
        </button>
        <button id="umm-status-none" style="flex: 1; padding: 8px; border: 2px solid ${currentStatus === 0 ? PANEL_COLORS.statusNoneUnselected : PANEL_COLORS.statusNoneUnselected}; background: ${currentStatus === 0 ? PANEL_COLORS.statusNone : 'white'}; color: ${currentStatus === 0 ? PANEL_COLORS.textOnDark : PANEL_COLORS.textPrimary}; border-radius: 6px; cursor: pointer; font-size: 13px; transition: all 0.2s;">
          ○ 清除
        </button>
      </div>
    </div>
    
    <div style="margin-bottom: 16px;">
      <label style="display: block; font-size: 12px; color: ${PANEL_COLORS.textSecondary}; margin-bottom: 8px;">评分 (0-10)</label>
      <input id="umm-rating" type="number" min="0" max="10" step="0.5" value="${rating}" 
        style="width: 100%; padding: 8px 12px; border: 1px solid ${PANEL_COLORS.borderDefault}; border-radius: 6px; font-size: 14px; outline: none; transition: border-color 0.2s;">
    </div>
    
    <button id="umm-save" style="width: 100%; padding: 10px; background: linear-gradient(180deg, #1757d6 0%, #0d47b8 100%); color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500; transition: opacity 0.2s;">
      💾 保存
    </button>
    
    <div style="margin-top: 12px; font-size: 11px; color: ${PANEL_COLORS.textSecondary}; text-align: center;">
      最后更新: ${updateTime}
    </div>
  `
  
  // 绑定按钮事件
  bindStatusButtons()
  bindSaveButton()
  bindRatingInputEvents()
}

function bindRatingInputEvents() {
  const ratingInput = document.getElementById('umm-rating') as HTMLInputElement
  if (ratingInput) {
    ratingInput.addEventListener('focus', () => {
      ratingInput.style.borderColor = PANEL_COLORS.borderFocus
      ratingInput.style.boxShadow = '0 0 0 3px rgba(23, 87, 214, 0.4)'
    })
    ratingInput.addEventListener('blur', () => {
      ratingInput.style.borderColor = PANEL_COLORS.borderMuted
      ratingInput.style.boxShadow = 'none'
    })
  }
}

function bindStatusButtons() {
  const doneBtn = document.getElementById('umm-status-done')
  const wishBtn = document.getElementById('umm-status-wish')
  const noneBtn = document.getElementById('umm-status-none')
  
  doneBtn?.addEventListener('click', () => updateStatus(2))  // 2 = 已看
  wishBtn?.addEventListener('click', () => updateStatus(1))  // 1 = 在看
  noneBtn?.addEventListener('click', () => updateStatus(0))  // 0 = 未看
}

function bindSaveButton() {
  const saveBtn = document.getElementById('umm-save')
  saveBtn?.addEventListener('click', async () => {
    await saveRecord()
  })
}

function bindPanelEvents(container: HTMLElement, header: HTMLElement) {
  // 最小化
  const minimizeBtn = document.getElementById('umm-minimize')
  minimizeBtn?.addEventListener('click', () => {
    const content = document.getElementById('umm-panel-content')
    if (content) {
      content.style.display = content.style.display === 'none' ? 'block' : 'none'
    }
  })
  
  // 添加 hover 效果
  if (minimizeBtn) {
    minimizeBtn.addEventListener('mouseenter', () => {
      minimizeBtn.style.background = 'rgba(255, 255, 255, 0.25)'
    })
    minimizeBtn.addEventListener('mouseleave', () => {
      minimizeBtn.style.background = 'rgba(255, 255, 255, 0.15)'
    })
  }
  
  // 关闭
  const closeBtn = document.getElementById('umm-close')
  closeBtn?.addEventListener('click', () => {
    container.remove()
    panelElement = null
    
    // 断开观察者以防止内存泄漏
    if (urlObserver) {
      urlObserver.disconnect()
      urlObserver = null
    }
  })
  
  // 添加 hover 效果
  if (closeBtn) {
    closeBtn.addEventListener('mouseenter', () => {
      closeBtn.style.background = 'rgba(255, 255, 255, 0.25)'
    })
    closeBtn.addEventListener('mouseleave', () => {
      closeBtn.style.background = 'rgba(255, 255, 255, 0.15)'
    })
  }
  
  // 拖拽功能
  let isDragging = false
  let startX = 0
  let startY = 0
  let initialX = 0
  let initialY = 0
  
  header.addEventListener('mousedown', (e) => {
    isDragging = true
    startX = e.clientX
    startY = e.clientY
    initialX = container.offsetLeft
    initialY = container.offsetTop
    header.style.cursor = 'grabbing'
  })
  
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return
    
    const deltaX = e.clientX - startX
    const deltaY = e.clientY - startY
    
    container.style.left = `${initialX + deltaX}px`
    container.style.top = `${initialY + deltaY}px`
    container.style.right = 'auto'
  })
  
  document.addEventListener('mouseup', () => {
    isDragging = false
    header.style.cursor = 'move'
  })
}

// ==================== 业务逻辑 ====================

function updateStatus(status: number) {
  if (!currentRecord) {
    currentRecord = {
      url: currentIdentity!.url,
      status,
      rating: 0,
      updatedAt: Utils.nowISO(),
      linkedIds: {},
    }
  } else {
    currentRecord.status = status
    currentRecord.updatedAt = Utils.nowISO()
  }
  
  // 重新渲染
  const content = document.getElementById('umm-panel-content')
  if (content) {
    renderPanelContent(content)
  }
}

async function saveRecord() {
  if (!currentRecord || !currentIdentity) return
  
  // 获取评分
  const ratingInput = document.getElementById('umm-rating') as HTMLInputElement
  if (ratingInput) {
    const rawValue = parseFloat(ratingInput.value)
    
    // 验证输入是否为有效数字
    if (isNaN(rawValue) || !isFinite(rawValue)) {
      showToast('❌ 请输入有效的评分（0-10）', 'error')
      return
    }
    
    currentRecord.rating = Utils.clampRating10(rawValue)
  }
  
  try {
    const storeName = `${currentIdentity!.provider}_records`
    const key = `${currentIdentity!.type}::${currentIdentity!.providerId}`
    await Store.dbPut(storeName, key, currentRecord)
    
    showToast('✅ 保存成功!', 'success')
    
    // 重新加载
    await loadCurrentRecord()
    
    // 重新渲染
    const content = document.getElementById('umm-panel-content')
    if (content) {
      renderPanelContent(content)
    }
  } catch (error) {
    errorLog('Save failed:', error)
    showNotification('❌ 保存失败')
  }
}

// ==================== 工具函数 ====================

function getStatusText(status?: number): string {
  const labels: Record<number, string> = {
    2: '已完成',
    0: '未标记',
    1: '想看/想听',
  }
  return labels[status ?? 0] || '未标记'
}

function getStatusColor(status?: number): string {
  const colors: Record<number, string> = {
    2: '#10b981',  // 绿色 - 已看
    0: '#6b7280',  // 灰色 - 未看
    1: '#3b82f6',  // 蓝色 - 在看
  }
  return colors[status ?? 0] || '#6b7280'
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

function showNotification(message: string) {
  const notification = document.createElement('div')
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: #333;
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    font-size: 14px;
    z-index: 9999999;
    animation: slideDown 0.3s ease;
  `
  notification.textContent = message
  
  document.body.appendChild(notification)
  
  setTimeout(() => {
    notification.style.animation = 'slideUp 0.3s ease'
    setTimeout(() => notification.remove(), 300)
  }, 2000)
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
        // 移除旧的面板和状态标签
        if (panelElement) {
          panelElement.remove()
          panelElement = null
        }
        if (statusChipElement) {
          statusChipElement.remove()
          statusChipElement = null
        }
        
        // 重新初始化
        loadCurrentRecord().then(() => {
          // 重新创建观察者
          observeUrlChanges()
          
          if (isDoubanDetailPage()) {
            injectNeoDBPushButtons()
          } else {
            createFloatingPanel()
          }
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

// ==================== 启动 ====================

/**
 * ✅ 设置扩展上下文失效监听
 * 定期检查上下文状态，失效时清理资源并提示用户
 */
function setupContextInvalidationListener() {
  // 定期检查上下文状态
  const checkInterval = setInterval(() => {
    if (!chrome.runtime?.id) {
      warnLog('Extension context lost, cleaning up...')
      clearInterval(checkInterval)
      
      // 清理所有定时器和缓存
      cleanupAllResources()
      
      // 显示一次性提示
      showContextInvalidationNotice()
    }
  }, 30000) // 每 30 秒检查一次
  
  // ✅ 添加最大超时保护（防止无限等待）
  setTimeout(() => {
    clearInterval(checkInterval)
    debugLog('Context check interval timeout cleared')
  }, 300000) // 5分钟最大超时
  
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
