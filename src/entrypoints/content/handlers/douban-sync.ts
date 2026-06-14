/**
 * 豆瓣本地存储同步函数
 * 功能：同步豆瓣页面状态到本地数据库，管理通知缓存
 */

import { Store } from '@/features/database'
import { Utils } from '@/utils'
import { safeSendMessage } from '@/utils/context'
import type { UrlIdentity, StoreRecord } from '@/types'
import { FloatingToast } from '../utils/toast'
import { extractCrossPlatformLinks, extractCommentFromPage } from './douban-scanner'
import { showNotification } from './douban-toast'

// ✅ P2: 提取魔法数字为常量
const STATUS_DONE = 2

// ✅ P1: 通知防抖缓存（key: providerId, value: timestamp）
const notificationCache = new Map<string, number>()
const NOTIFICATION_COOLDOWN = 5000 // 5秒冷却时间
const MAX_CACHE_SIZE = 100 // 限制缓存大小
const CACHE_CLEANUP_INTERVAL = 60000 // 每分钟清理一次

/**
 * 清理过期的通知缓存
 */
function cleanupNotificationCache() {
  const now = Date.now()
  let cleanedCount = 0
  
  for (const [key, timestamp] of notificationCache.entries()) {
    // ✅ 修复：使用合理的过期时间（2 倍冷却时间即可）
    if (now - timestamp > NOTIFICATION_COOLDOWN * 2) {
      notificationCache.delete(key)
      cleanedCount++
    }
  }
  
  // 如果仍然过大，删除最旧的条目
  if (notificationCache.size > MAX_CACHE_SIZE) {
    const entries = Array.from(notificationCache.entries())
    entries.sort((a, b) => a[1] - b[1]) // 按时间排序
    // ✅ 优化：使用 LRU 策略，保留最近的 70%
    const targetSize = Math.floor(MAX_CACHE_SIZE * 0.7)
    const toDeleteCount = notificationCache.size - targetSize
    const toDelete = entries.slice(0, toDeleteCount)
    toDelete.forEach(([key]) => notificationCache.delete(key))
    cleanedCount += toDelete.length
  }
  
  if (cleanedCount > 0) {
    console.log(`[UMM Douban] Cleaned ${cleanedCount} expired notification cache entries`)
  }
}

// 启动定期清理
const cacheCleanupTimer = setInterval(cleanupNotificationCache, CACHE_CLEANUP_INTERVAL)

// ✅ 添加最大超时保护（防止无限运行）
setTimeout(() => {
  clearInterval(cacheCleanupTimer)
  console.log('[UMM Douban] Cache cleanup timer timeout cleared')
}, 600000) // 10分钟最大超时

// 在页面卸载时清理定时器
window.addEventListener('beforeunload', () => {
  clearInterval(cacheCleanupTimer)
  notificationCache.clear()
  console.log('[UMM Douban] Notification cache cleared on page unload')
})

/**
 * 同步页面状态到本地存储
 * @param cachedRecord 可选的缓存记录，避免重复查询
 */
export async function syncToLocalStorage(
  identity: UrlIdentity,
  pageRating: number,
  cachedRecord?: StoreRecord | null // ✅ P1: 新增参数
): Promise<void> {
  console.log('[UMM Douban] Page shows watched status, saving to database...')

  const storeName = `${identity.provider}_records`
  const key = `${identity.type}::${identity.providerId}`

  // ✅ P1: 使用缓存的记录，避免重复查询
  const existingRecord = cachedRecord || await Store.dbGet(storeName, key)

  // 重新计算变化标志（基于数据库真实数据）
  const isNewRecord = !existingRecord
  const isStatusChanged = existingRecord && existingRecord.status !== STATUS_DONE
  const isRatingChanged = existingRecord && Math.abs(existingRecord.rating - pageRating) > 0.01

  // 判断是否有任何实质性变化
  const hasRealChange = isNewRecord || isStatusChanged || isRatingChanged

  // 提取页面中的跨平台链接（IMDB/TMDB）并合并到已有链接
  const mergedLinkedIds = extractCrossPlatformLinks(identity, existingRecord?.linkedIds)

  const pageComment = extractCommentFromPage()
  const isCommentChanged = existingRecord && existingRecord.comment !== pageComment

  // 更新 hasRealChange 包含评语变化
  const effectiveChange = hasRealChange || isCommentChanged
  const recordToSave: StoreRecord = {
    url: identity.url,
    status: STATUS_DONE,  // 已看
    rating: pageRating,
    comment: pageComment,
    updatedAt: new Date().toISOString(),
    linkedIds: mergedLinkedIds,
  }

  // ✅ 为跨平台关联创建对应的平台记录（双向同步）
  const now = new Date().toISOString()
  const crossPlatformEntries: Array<{ provider: string; type: string; providerId: string }> = []

  // 解析 linkedIds 中的 full key 格式（如 "movie::tt23810070"）
  function parseLinkedKey(linkedKey: string, fallbackType: string): { type: string; providerId: string } {
    if (linkedKey.includes('::')) {
      const [t, id] = linkedKey.split('::')
      return { type: t, providerId: id }
    }
    return { type: fallbackType, providerId: linkedKey }
  }

  if (mergedLinkedIds.imdb) {
    const parsed = parseLinkedKey(mergedLinkedIds.imdb, identity.type)
    crossPlatformEntries.push({ provider: 'imdb', type: parsed.type, providerId: parsed.providerId })
  }
  if (mergedLinkedIds.tmdb) {
    const parsed = parseLinkedKey(mergedLinkedIds.tmdb, identity.type)
    crossPlatformEntries.push({ provider: 'tmdb', type: parsed.type, providerId: parsed.providerId })
  }

  for (const entry of crossPlatformEntries) {
    const targetStore = `${entry.provider}_records`
    const targetKey = `${entry.type}::${entry.providerId}`
    const existingTarget = await Store.dbGet(targetStore, targetKey)

    // 跳过已存在且状态已同步的记录
    if (existingTarget && existingTarget.status === STATUS_DONE) {
      console.log(`[UMM Douban] ⏭️ ${entry.provider} record already synced:`, targetKey)
      continue
    }

    // 构建目标记录：反向链接回豆瓣（full key 格式）
    const targetRecord: StoreRecord = {
      url: `${entry.provider === 'imdb' ? 'https://www.imdb.com/title/' : 'https://www.themoviedb.org/movie/'}${entry.providerId}/`,
      status: STATUS_DONE,
      rating: pageRating,
      comment: pageComment,
      updatedAt: now,
      linkedIds: {
        ...(existingTarget?.linkedIds || {}),
        douban: `${identity.type}::${identity.providerId}`,
      },
    }

    await Store.dbPut(targetStore, targetKey, targetRecord)
    console.log(`[UMM Douban] ✅ Created ${entry.provider} record:`, targetKey)

    // Toast 通知：已同步到对应平台
    const platformLabel = entry.provider === 'imdb' ? 'IMDb' : entry.provider === 'tmdb' ? 'TMDB' : entry.provider
    showNotification(`✅ 已同步到 ${platformLabel} (${entry.providerId})`)
  }
  
  console.log('[UMM Douban] Record to save:', recordToSave)
  console.log('[UMM Douban] Change detection:', { isNewRecord, isStatusChanged, isRatingChanged, isCommentChanged, hasRealChange })
  
  try {
    await Store.dbPut(storeName, key, recordToSave)
    console.log('[UMM Douban] ✅ Record saved successfully')
    
    // ✅ P1: 添加防抖检查
    const cacheKey = `${identity.provider}:${identity.providerId}`
    const lastNotificationTime = notificationCache.get(cacheKey) || 0
    const now = Date.now()
    
    if (now - lastNotificationTime < NOTIFICATION_COOLDOWN) {
      console.log('[UMM Douban] ⏭️ Notification cooldown, skipped')
      return
    }
    
    // ✅ 修复：只在有实质性变化时才发送通知
    if (effectiveChange) {
      if (isNewRecord) {
        showNotification(`✅ 已自动同步${identity.type === 'music' ? '听过' : '看过'}状态`)
      } else if (isStatusChanged) {
        showNotification(`✅ 状态已更新为${identity.type === 'music' ? '已听' : '已看'}`)
      } else if (isRatingChanged) {
        showNotification(`✅ 评分已更新为 ${Utils.formatRating10(pageRating)}/10`)
      } else if (isCommentChanged) {
        showNotification(`✅ 评语已更新`)
      }
      
      // 记录通知时间
      notificationCache.set(cacheKey, now)
    } else {
      console.log('[UMM Douban] ⏭️ Data unchanged, skipped notification')
    }
  } catch (error) {
    console.error('[UMM Douban] ❌ Failed to save record:', error)
    showNotification('❌ 同步状态失败')
  }

  // ✅ Auto-sync to NeoDB on FIRST record only (independent of notification cooldown)
  // "首次" = 本地数据库中不存在该豆瓣 key 的记录
  if (isNewRecord) {
    try {
      const settings = await Store.getSettings()
      if (settings.autoSyncNeoDB && settings.neodbToken) {
        console.log('[UMM Douban] 🔄 Auto-syncing to NeoDB (first record)...')
        const syncResponse = await safeSendMessage({
          type: 'NEODB_PUSH_RATING',
          payload: {
            record: {
              providerId: identity.providerId,
              rating: pageRating,
              status: STATUS_DONE,
              type: identity.type,
              provider: identity.provider,
              comment: pageComment,
            },
          },
        }, { timeout: 10000 })

        console.log('[UMM Douban] NeoDB sync response:', {
          success: syncResponse?.success,
          catalogUuid: syncResponse?.catalogUuid,
          message: syncResponse?.message,
        })

        // 更新 linkedIds.neodb（full key 格式）
        if (syncResponse?.success && syncResponse.catalogUuid) {
          const neodbFullKey = `${identity.type}::${syncResponse.catalogUuid}`

          // 1. 更新 Douban 记录的 linkedIds.neodb
          const existingAfterPush = await Store.dbGet(storeName, key)
          if (existingAfterPush) {
            existingAfterPush.linkedIds = existingAfterPush.linkedIds || {}
            existingAfterPush.linkedIds.neodb = neodbFullKey
            await Store.dbPut(storeName, key, existingAfterPush)
            console.log('[UMM Douban] ✅ Updated linkedIds.neodb:', neodbFullKey)
          }

          // 2. 创建或更新 NeoDB 本地记录（双向链接）
          const neodbStoreName = 'neodb_records'
          const neodbKey = neodbFullKey
          const existingNeoDB = await Store.dbGet(neodbStoreName, neodbKey)
          const doubanFullKey = `${identity.type}::${identity.providerId}`

          // 构造 NeoDB 记录的 linkedIds：包含豆瓣 + 已知的跨平台关联（IMDB/TMDB）
          const neodbLinkedIds: Record<string, string> = { douban: doubanFullKey }
          if (mergedLinkedIds.imdb) neodbLinkedIds.imdb = mergedLinkedIds.imdb
          if (mergedLinkedIds.tmdb) neodbLinkedIds.tmdb = mergedLinkedIds.tmdb

          if (existingNeoDB) {
            // 已存在 → 合并关联，确保全部设置
            existingNeoDB.linkedIds = {
              ...(existingNeoDB.linkedIds || {}),
              ...neodbLinkedIds,
            }
            await Store.dbPut(neodbStoreName, neodbKey, existingNeoDB)
            console.log('[UMM Douban] ✅ Updated existing NeoDB record linkedIds:', existingNeoDB.linkedIds)
          } else {
            // 不存在 → 创建新记录
            const neodbRecord: StoreRecord = {
              url: `https://neodb.social/${identity.type === 'music' ? 'album' : identity.type}/${syncResponse.catalogUuid}/`,
              status: STATUS_DONE,
              rating: pageRating,
              updatedAt: new Date().toISOString(),
              linkedIds: neodbLinkedIds,
            }
            await Store.dbPut(neodbStoreName, neodbKey, neodbRecord)
            console.log('[UMM Douban] ✅ Created NeoDB local record:', neodbKey, 'linkedIds:', neodbLinkedIds)
          }

          // 3. 反方向：更新 IMDB/TMDB 记录的 linkedIds 以包含 neodb
          for (const entry of crossPlatformEntries) {
            const targetStore = `${entry.provider}_records`
            const entryKey = `${entry.type}::${entry.providerId}`
            const existingTarget = await Store.dbGet(targetStore, entryKey)
            if (existingTarget) {
              existingTarget.linkedIds = existingTarget.linkedIds || {}
              if (existingTarget.linkedIds.neodb !== neodbFullKey) {
                existingTarget.linkedIds.neodb = neodbFullKey
                await Store.dbPut(targetStore, entryKey, existingTarget)
                console.log(`[UMM Douban] ✅ Updated ${entry.provider} linkedIds.neodb:`, entryKey)
              }
            }
          }
          // 全部 linkedIds 保存完后显示结果 Toast
          FloatingToast.info('UMM', '✅ ID关联已保存并已自动同步到 NeoDB')
          console.log('[UMM Douban] ✅ Auto-synced to NeoDB')
        } else if (syncResponse?.success) {
          FloatingToast.info('UMM', '⚠️ NeoDB 推送成功但未返回作品 ID，无法建立关联')
          console.warn('[UMM Douban] ⚠️ NeoDB push succeeded but no catalogUuid returned')
        } else {
          FloatingToast.info('UMM', '⚠️ 自动同步到 NeoDB 失败')
          console.warn('[UMM Douban] ⚠️ Auto-sync to NeoDB failed: invalid response')
        }
      }
    } catch (syncErr) {
      FloatingToast.error('UMM', `❌ 自动同步到 NeoDB 失败`)
      console.warn('[UMM Douban] ⚠️ Auto-sync to NeoDB failed:', syncErr)
    }
  }
}

/**
 * 获取本地记录
 */
export async function getLocalRecord(identity: UrlIdentity) {
  try {
    console.log('[UMM] getLocalRecord called with:', identity)
    
    const storeName = `${identity.provider}_records`
    const key = `${identity.type}::${identity.providerId}`
    const record = await Store.dbGet(storeName, key)
    
    if (record) {
      console.log('[UMM] getLocalRecord success:', {
        rating: record.rating,
        status: record.status,
        linkedIds: record.linkedIds
      })
      return record
    } else {
      console.log('[UMM] getLocalRecord: record not found')
      return null
    }
  } catch (error) {
    console.error('[UMM] Failed to load local record:', error)
    return null
  }
}
