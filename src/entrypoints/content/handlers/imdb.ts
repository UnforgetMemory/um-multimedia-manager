/**
 * IMDb 页面处理器
 * 功能：检测 IMDb 页面的用户评分和观看状态，注入状态标签
 */

import type { UrlIdentity } from '@/types'
import { Utils, throttle } from '@/utils'
import { createStatusChip } from '../utils/dom'
import { createDetailPageHandler } from './create-detail-handler'

/**
 * 扫描 IMDb 页面状态
 */
export async function scanIMDbPageStatus(): Promise<{ status: string; rating: number }> {
  let rating = 0
  let done = false

  // 未评分状态渲染 hero-rating-bar__user-rating__unrated 节点（CTA "Rate <title>"），
  // 已评分才移除它并显示分数。以其缺失为门控：不依赖 aria-label 文本
  // （IMDb 会本地化），也不受片名含数字（如 "1883"）影响。
  const ratingButton = document.querySelector('[data-testid="hero-rating-bar__user-rating"] button')
  const unrated = ratingButton?.querySelector('[data-testid="hero-rating-bar__user-rating__unrated"]')
  if (ratingButton && !unrated) {
    const text = `${ratingButton.getAttribute('aria-label') || ''} ${ratingButton.textContent || ''}`
    const match = text.match(/(\d+(?:\.\d+)?)(?:\/10)?/)
    if (match) {
      rating = Utils.clampRating10(parseFloat(match[1]))
      done = true
    }
  }

  // 无评分则检查观看按钮。未观看 CTA 文案是 "Mark as watched"
  // （aria-label 也是 "Mark <title> as watched"），同样含 watched 字样，
  // 必须排除，否则未观看页面被判已看。已观看 = aria-pressed="true"
  // 或非 CTA 的 watched 文案。
  if (!done) {
    const watchedButton = document.querySelector('[data-testid^="watched-button-"]')
    if (watchedButton) {
      const pressed = watchedButton.getAttribute('aria-pressed') === 'true'
      const label = (watchedButton.textContent || '').trim()
      const isMarkCta = /mark\s+.+?\s+as\s+watched/i.test(label) || /^mark\s+as\s+watched$/i.test(label)
      done = pressed || (label !== '' && /watched/i.test(label) && !isMarkCta)
    }
  }

  return {
    status: done ? 'done' : 'none',
    rating,
  }
}

/**
 * 获取 IMDb 页面标题锚点元素
 */
export function getIMDbAnchorElement(): Element | null {
  return (
    document.querySelector('[data-testid="hero__pageTitle"]') ||
    document.querySelector('[data-testid="hero-title-block__title"]')
  )
}

/**
 * 渲染 IMDb 状态标签
 */
export async function renderIMDbStatusChip(
  identity: UrlIdentity,
  status: number,  // 0/1/2
  rating: number,
  note: string = ''
): Promise<void> {
  const anchor = getIMDbAnchorElement()
  if (!anchor) {
    console.warn('[UMM] Could not find IMDb anchor element for status chip')
    return
  }

  // 检查是否已存在状态标签
  const existingChip = anchor.parentElement?.querySelector('.umm-status-chip[data-umm-owner]')

  // 创建新标签
  const chip = createStatusChip(identity.type, status, rating, note)
  chip.dataset.ummOwner = `imdb-${identity.type}`

  if (existingChip) {
    // 就地替换旧标签
    existingChip.replaceWith(chip)
  } else {
    // 插到元信息行之后：h1 下一兄弟是元信息行 <ul class="ipc-inline-list">
    // （TV Series · 年份 · 分级 · 时长）。直接插 h1 后会把该行挤到 chip 下方、
    // 打断标题区布局（.localref 快照：chip 夹在标题与元信息行之间）。
    const metaRow = anchor.nextElementSibling
    const target = metaRow?.matches('ul.ipc-inline-list') ? metaRow : anchor
    target.insertAdjacentElement('afterend', chip)
  }
}

/**
 * 处理 IMDb 详情页
 */
const baseIMDbDetailHandler = createDetailPageHandler({
  platform: 'imdb',
  titleSelector: '[data-testid="hero__pageTitle"], [data-testid="hero-title-block__title"]',
  scanFn: () => scanIMDbPageStatus(),
  renderFn: renderIMDbStatusChip,
  savedMessageKey: 'imdb.saved',
})

// ---- 动态状态观察 ----
// IMDb 的观看按钮 / 用户评分是客户端水合后才出现、且用户操作会原地变化
// （如 "Mark as watched" ↔ "Watched"、评分从无到有）。仅页面加载时扫描一次
// 会留下过期 chip（.localref 已评分快照：页面已看+已评分，chip 仍是"已看(本地)"）。
// 观察这两类状态节点，变化即重跑完整 detail 管线（scan→dbGet→merge→render→save）。

/** 状态载体节点：观看按钮（含 -tt<id> 后缀）与用户评分容器。 */
const STATE_MARKERS = [
  '[data-testid^="watched-button-"]',
  '[data-testid="hero-rating-bar__user-rating"]',
]

let stateObserver: MutationObserver | null = null
let rescanThrottled: (() => void) | null = null
let activeIdentity: UrlIdentity | null = null
let unloadListenerBound = false

function nodeTouchesState(node: Node): boolean {
  // 文本节点（文案替换产生的 added/removed Text）经父元素判定归属；
  // 元素节点自身 / 祖先 / 后代任一命中即算触及。
  const el = node instanceof Element ? node : node.parentElement
  if (!el) return false
  return STATE_MARKERS.some(
    (sel) => el.matches(sel) || el.closest(sel) !== null || el.querySelector(sel) !== null
  )
}

/** 仅当变更确实触及状态载体节点时才触发重扫（防止全页面噪音）。 */
function mutationsTouchState(mutations: MutationRecord[]): boolean {
  return mutations.some((mutation) => {
    if (mutation.type === 'characterData') {
      // 文案变化（"Mark as watched" ↔ "Watched"）的 target 是文本节点，
      // 需经父元素判定归属。
      return mutation.target.parentElement !== null && nodeTouchesState(mutation.target.parentElement)
    }
    if (mutation.type === 'attributes') {
      return nodeTouchesState(mutation.target)
    }
    for (const node of mutation.addedNodes) {
      if (nodeTouchesState(node)) return true
    }
    for (const node of mutation.removedNodes) {
      if (nodeTouchesState(node)) return true
    }
    return false
  })
}

async function rescanIMDbState(): Promise<void> {
  if (!activeIdentity) return
  try {
    await baseIMDbDetailHandler(activeIdentity)
  } catch (error: unknown) {
    console.warn('[UMM] IMDb state rescan failed:', error)
  }
}

/** 启动观察（重复调用先停旧观察器，SPA 切换标题时由再次 dispatch 触发）。 */
export function startIMDbStateObserver(identity: UrlIdentity): void {
  stopIMDbStateObserver()
  activeIdentity = identity
  rescanThrottled = throttle(() => {
    void rescanIMDbState()
  }, 400)

  stateObserver = new MutationObserver((mutations) => {
    if (mutationsTouchState(mutations)) rescanThrottled?.()
  })
  stateObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    characterData: true,
  })
  // SPA 导航会反复 start→stop，beforeunload 只绑一次，避免监听器累积
  if (!unloadListenerBound) {
    unloadListenerBound = true
    window.addEventListener('beforeunload', stopIMDbStateObserver, { once: true })
  }
}

export function stopIMDbStateObserver(): void {
  stateObserver?.disconnect()
  stateObserver = null
  rescanThrottled = null
  activeIdentity = null
}

/**
 * IMDb 详情页入口：首轮全量处理 + 动态状态观察（水合补扫 / 用户操作同步）。
 */
export async function handleIMDbDetailPage(identity: UrlIdentity): Promise<void> {
  if (!identity) return
  await baseIMDbDetailHandler(identity)
  startIMDbStateObserver(identity)
}
