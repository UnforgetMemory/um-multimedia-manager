/**
 * NeoDB 页面处理器
 * 功能：检测 NeoDB 页面的标记状态和评分，注入状态标签和同步按钮
 */

import type { UrlIdentity } from '../../shared/types'
import { Store } from '../../shared'
import { Utils } from '../../shared/utils'
import { createStatusChip, waitForElement } from '../utils/dom'

/**
 * 扫描 NeoDB 页面状态
 */
export async function scanNeoDBPageStatus(type: string): Promise<{ status: string; rating: number }> {
  const action = document.querySelector('#item-primary-mark .item-action button, #item-primary-mark .item-action a') as HTMLElement | null
  const text = action?.innerText?.trim() || ''
  const strong = action?.querySelector('strong')?.textContent?.trim() || ''
  
  // 根据类型确定"已看/已听"的文本
  const doneWord = type === 'music' ? '听过' : '看过'
  const done =
    strong === doneWord ||
    text.startsWith(doneWord) ||
    !!(document.querySelector('#mark-history #log-list') as HTMLElement)?.innerText?.includes(doneWord)
  
  // 提取评分
  const rating = Utils.clampRating10(
    Number(action?.querySelector('.rating-star[data-rating]')?.getAttribute('data-rating')) || 0
  )
  
  return {
    status: done ? 'done' : 'none',
    rating,
  }
}

/**
 * 获取 NeoDB 页面标题锚点元素
 */
export function getNeoDBAnchorElement(): Element | null {
  return (
    document.querySelector('#item-title h1') ||
    document.querySelector('.item-title h1')
  )
}

/**
 * 获取 NeoDB 页面标题
 */
export function getNeoDBTitle(): string {
  const anchor = getNeoDBAnchorElement()
  return anchor?.textContent?.trim() || ''
}

/**
 * 获取关联的其他平台 ID（豆瓣/IMDb/TMDB）
 */
export async function getLinkedIdentities(): Promise<Array<{ provider: string; url: string }>> {
  const siteList = document.querySelector('.site-list')
  if (!siteList) {
    return []
  }
  
  const result: Array<{ provider: string; url: string }> = []
  
  const pushIf = (url: string, provider: string) => {
    if (url) {
      result.push({ provider, url })
    }
  }
  
  // 提取豆瓣链接
  const doubanLink = siteList.querySelector('.douban')?.getAttribute('href') || ''
  pushIf(doubanLink, 'douban')
  
  // 提取 IMDb 链接
  const imdbLink = siteList.querySelector('.imdb')?.getAttribute('href') || ''
  pushIf(imdbLink, 'imdb')
  
  // 提取 TMDB 链接
  const tmdbLink = siteList.querySelector('.tmdb')?.getAttribute('href') || ''
  pushIf(tmdbLink, 'tmdb')
  
  return result
}

/**
 * 渲染 NeoDB 状态标签
 */
export async function renderNeoDBStatusChip(
  identity: UrlIdentity,
  status: number,  // 0/1/2
  rating: number,
  note: string = ''
): Promise<void> {
  const anchor = getNeoDBAnchorElement()
  if (!anchor) {
    console.warn('[UMM] Could not find NeoDB anchor element for status chip')
    return
  }
  
  // 检查是否已存在状态标签
  const existingChip = anchor.parentElement?.querySelector('.umm-status-chip[data-umm-owner]')
  
  // 创建新标签
  const chip = createStatusChip(identity.type, status, rating, note)
  chip.dataset.ummOwner = `neodb-${identity.type}`
  
  if (existingChip) {
    // 替换现有标签
    existingChip.replaceWith(chip)
  } else {
    // 插入到锚点元素之后
    anchor.insertAdjacentElement('afterend', chip)
  }
}

/**
 * 处理 NeoDB 详情页
 */
export async function handleNeoDBDetailPage(identity: UrlIdentity): Promise<void> {
  if (!identity) return
  
  // 等待标题元素加载
  await waitForElement('#item-title h1, .item-title h1', 5000)
  
  // 扫描页面状态
  const pageState = await scanNeoDBPageStatus(identity.type)
  
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
  await renderNeoDBStatusChip(identity, finalStatus, finalRating, note)
  
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
    
    console.log('[UMM] Updated NeoDB local record from page state')
  }
}
