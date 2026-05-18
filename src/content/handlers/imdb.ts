/**
 * IMDb 页面处理器
 * 功能：检测 IMDb 页面的用户评分和观看状态，注入状态标签
 */

import type { UrlIdentity } from '../../shared/types'
import { Store } from '../../shared'
import { Utils } from '../../shared/utils'
import { createStatusChip, waitForElement } from '../utils/dom'

/**
 * 扫描 IMDb 页面状态
 */
export async function scanIMDbPageStatus(): Promise<{ status: string; rating: number }> {
  let rating = 0
  let done = false

  // 检测用户评分
  const ratingButton = document.querySelector('[data-testid="hero-rating-bar__user-rating"] button')
  if (ratingButton) {
    const text = `${ratingButton.getAttribute('aria-label') || ''} ${ratingButton.textContent || ''}`
    const match = text.match(/(\d+(?:\.\d+)?)(?:\/10)?/)
    if (match) {
      rating = Utils.clampRating10(parseFloat(match[1]))
      done = text.includes('Your rating') || /^\d/.test((ratingButton.textContent || '').trim())
    }
  }

  // 如果没有评分，检查观看按钮
  if (!done) {
    const watchedButton = document.querySelector('[data-testid^="watched-button-"]')
    if (watchedButton) {
      done =
        watchedButton.getAttribute('aria-pressed') === 'true' ||
        /watched/i.test(watchedButton.textContent || '')
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
 * 获取 IMDb 页面标题
 */
export function getIMDbTitle(): string {
  const anchor = getIMDbAnchorElement()
  return anchor?.textContent?.trim() || ''
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
    // 替换现有标签
    existingChip.replaceWith(chip)
  } else {
    // 插入到锚点元素之后
    anchor.insertAdjacentElement('afterend', chip)
  }
}

/**
 * 处理 IMDb 详情页
 */
export async function handleIMDbDetailPage(identity: UrlIdentity): Promise<void> {
  if (!identity) return

  // 等待标题元素加载
  await waitForElement('[data-testid="hero__pageTitle"], [data-testid="hero-title-block__title"]', 5000)

  // 扫描页面状态
  const pageState = await scanIMDbPageStatus()

  // 获取本地记录状态
  await Store.initialize()
  const map = await Store.getDatasetMap(identity.type, identity.provider)
  const localRecord = map.get(identity.providerId) || null
  const isLocalDone = localRecord?.status === 2  // 2 = 已看
  const isPageDone = pageState.status === 'done'

  // 合并状态：页面状态优先，其次本地记录
  const finalStatus = isPageDone || isLocalDone ? 2 : 0  // 2=已看, 0=未看
  const finalRating = Utils.clampRating10(
    isPageDone ? pageState.rating : localRecord?.rating || 0
  )

  // 生成备注信息
  const note = isLocalDone && !isPageDone ? '来自本地缓存' : ''

  // 渲染状态标签
  await renderIMDbStatusChip(identity, finalStatus, finalRating, note)

  // 如果页面显示已看，更新本地记录
  if (isPageDone) {
    const id = `${identity.provider}:${identity.type}:${identity.providerId}`
    
    await Store.upsertRecord({
      provider: identity.provider,
      type: identity.type,
      providerId: identity.providerId,
      id,  // 添加复合主键
      url: identity.url,
      status: 2,  // 已看
      rating: pageState.rating,
      updatedAt: new Date().toISOString(),
    })

    console.log('[UMM] Updated IMDb local record from page state')
  }
}
