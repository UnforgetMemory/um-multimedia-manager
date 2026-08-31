/**
 * IMDb 页面处理器
 * 功能：检测 IMDb 页面的用户评分和观看状态，注入状态标签
 */

import type { UrlIdentity } from '@/types'
import { Utils } from '@/utils'
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
export const handleIMDbDetailPage = createDetailPageHandler({
  platform: 'imdb',
  titleSelector: '[data-testid="hero__pageTitle"], [data-testid="hero-title-block__title"]',
  scanFn: () => scanIMDbPageStatus(),
  renderFn: renderIMDbStatusChip,
  savedMessageKey: 'imdb.saved',
})
