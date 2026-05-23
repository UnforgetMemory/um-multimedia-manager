/**
 * NeoDB 页面处理器
 * 功能：检测 NeoDB 页面的标记状态和评分，注入状态标签和同步按钮
 */

import type { UrlIdentity, StoreRecord } from '../../shared/types'
import { Store, Identity } from '../../shared'
import { Utils } from '../../shared/utils'
import { createStatusChip, waitForElement } from '../utils/dom'
import { FloatingToast } from '../utils/toast'

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
 * 从 NeoDB 页面元数据中提取 IMDb 链接（site-list 中可能没有）
 */
function extractMetadataIMDb(): string {
  const metaSection = document.querySelector('#item-metadata')
  if (!metaSection) return ''
  const imdbAnchor = metaSection.querySelector('a[href*="imdb.com/title/tt"]')
  return imdbAnchor?.getAttribute('href') || ''
}

/**
 * 处理 NeoDB 详情页
 * 功能：
 * 1. 注入状态标签
 * 2. 提取跨平台关联数据（豆瓣/IMDb/TMDB）并写入 linkedIds
 * 3. 低优先级同步到关联平台的数据库（仅当目标记录不存在或未完成时）
 */
export async function handleNeoDBDetailPage(identity: UrlIdentity): Promise<void> {
  if (!identity) return
  
  // 等待标题元素加载
  await waitForElement('#item-title h1, .item-title h1', 5000)
  
  // 扫描页面状态
  const pageState = await scanNeoDBPageStatus(identity.type)
  
  // 获取本地记录状态
  const storeName = `${identity.provider}_records`
  const key = `${identity.type}::${identity.providerId}`
  const localRecord = await Store.dbGet(storeName, key)
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
  
  // ===== 提取跨平台关联数据 =====
  
  // 从 site-list 提取链接（豆瓣/TMDB，可能也有 IMDb）
  const linkedIdentities = await getLinkedIdentities()
  
  // 补充：从元数据区提取 IMDb（site-list 中可能没有）
  const metaImdbUrl = extractMetadataIMDb()
  if (metaImdbUrl && !linkedIdentities.some(l => l.provider === 'imdb')) {
    linkedIdentities.push({ provider: 'imdb', url: metaImdbUrl })
  }
  
  // 解析每个链接为 identity + 构建 linkedIds
  const linkedIds: Record<string, string> = linkedIdentities.reduce((acc, linked) => {
    const targetId = Identity.fromUrl(linked.url)
    if (targetId) {
      acc[targetId.provider] = `${targetId.type}::${targetId.providerId}`
    }
    return acc
  }, {} as Record<string, string>)
  
  // ===== 保存 NeoDB 本地记录（含 linkedIds + comment） =====

  if (isPageDone) {
    // 仅当数据真正变化时保存 + toast
    const statusChanged = localRecord?.status !== 2
    const ratingChanged = localRecord?.rating !== pageState.rating
    const linkedChanged = JSON.stringify(localRecord?.linkedIds || {}) !== JSON.stringify(linkedIds)

    if (statusChanged || ratingChanged || linkedChanged || !localRecord) {
      await Store.dbPut(storeName, key, {
        url: identity.url,
        status: 2,
        rating: pageState.rating,
        comment: localRecord?.comment ?? '',
        updatedAt: new Date().toISOString(),
        linkedIds,
      })
      FloatingToast.success('UMM', '✅ 已保存 NeoDB 观看状态')
      console.log('[UMM] ✅ Updated NeoDB local record with linkedIds:', linkedIds)
    } else {
      console.log('[UMM] ⏭️ NeoDB record unchanged, skipping save')
    }
  } else if (!localRecord || JSON.stringify(localRecord.linkedIds || {}) !== JSON.stringify(linkedIds)) {
    // 即使页面未标记，也保存 linkedIds 确保关联不丢失
    await Store.dbPut(storeName, key, {
      url: identity.url,
      status: localRecord?.status ?? 0,
      rating: localRecord?.rating ?? 0,
      comment: localRecord?.comment ?? '',
      updatedAt: new Date().toISOString(),
      linkedIds,
    })
    FloatingToast.success('UMM', '✅ 已更新 NeoDB 数据关联')
    console.log('[UMM] ✅ Saved NeoDB linkedIds (page not marked):', linkedIds)
  }
  
  // ===== 低优先级同步到关联平台 =====
  // 规则：仅当目标记录不存在 或 状态不是"已完成"时，才同步状态/评分
  // 但 linkedIds 始终写入
  
  const now = new Date().toISOString()
  
  for (const linked of linkedIdentities) {
    const targetId = Identity.fromUrl(linked.url)
    if (!targetId) {
      console.warn('[UMM] ⚠️ Could not parse linked URL:', linked.url)
      continue
    }
    
    const targetStore = `${targetId.provider}_records` as const
    const targetKey = `${targetId.type}::${targetId.providerId}`
    const existingTarget = await Store.dbGet(targetStore, targetKey)
    
    // 构建目标记录的 linkedIds：保留已有 + 确保回到 NeoDB
    const targetLinkedIds: Record<string, string> = {
      ...(existingTarget?.linkedIds || {}),
      neodb: `${identity.type}::${identity.providerId}`,
    }
    
    const platformLabel = targetId.provider === 'imdb' ? 'IMDb' : targetId.provider === 'tmdb' ? 'TMDB' : '豆瓣'

    if (!existingTarget) {
      // 目标不存在 → 创建新记录（使用 NeoDB 的状态/评分）
      const targetRecord: StoreRecord = {
        url: Identity.buildUrl(targetId.type, targetId.provider, targetId.providerId),
        status: isPageDone ? 2 : 0,
        rating: pageState.rating,
        comment: localRecord?.comment ?? '',
        updatedAt: now,
        linkedIds: targetLinkedIds,
      }
      await Store.dbPut(targetStore, targetKey, targetRecord)
      console.log(`[UMM] ✅ Created ${targetId.provider} record from NeoDB link:`, targetKey, targetRecord)
      FloatingToast.success('UMM', `✅ 已同步 ${platformLabel} 数据关联`)
    } else if (existingTarget.status !== 2) {
      // 存在但未完成 → 检测变化后再更新
      const statusChanged = isPageDone && existingTarget.status !== 2
      const ratingChanged = pageState.rating && existingTarget.rating !== pageState.rating
      const linkedChanged = JSON.stringify(existingTarget.linkedIds || {}) !== JSON.stringify(targetLinkedIds)

      if (statusChanged || ratingChanged || linkedChanged) {
        existingTarget.status = isPageDone ? 2 : existingTarget.status
        existingTarget.rating = existingTarget.rating || pageState.rating
        existingTarget.comment = localRecord?.comment ?? existingTarget.comment ?? ''
        existingTarget.updatedAt = now
        existingTarget.linkedIds = targetLinkedIds
        await Store.dbPut(targetStore, targetKey, existingTarget)
        console.log(`[UMM] ✅ Updated ${targetId.provider} record (not done) from NeoDB:`, targetKey)
        FloatingToast.success('UMM', `✅ ${platformLabel} 状态已同步`)
      } else {
        console.log(`[UMM] ⏭️ ${targetId.provider} not-done record unchanged, skipping`)
      }
    } else {
      // 存在且已完成 → 仅更新 linkedIds（低优先级，不覆盖状态/评分）
      const needsLinkUpdate = JSON.stringify(existingTarget.linkedIds || {}) !== JSON.stringify(targetLinkedIds)
      if (needsLinkUpdate) {
        existingTarget.linkedIds = targetLinkedIds
        await Store.dbPut(targetStore, targetKey, existingTarget)
        console.log(`[UMM] ✅ Updated ${targetId.provider} linkedIds (record done, link only):`, targetKey)
        FloatingToast.info('UMM', `🔗 ${platformLabel} 关联已更新`)
      } else {
        console.log(`[UMM] ⏭️ ${targetId.provider} already synced, no link update needed:`, targetKey)
      }
    }
  }
}
