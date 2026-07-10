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
import { Identity } from '@/features/identity'
import { injectNeoDBPushButtons } from '../neodb-push'
import { t } from '../i18n'
import { showNotification } from './douban-toast'

// Status constants
const STATUS_DONE = 2
const STATUS_WISH = 1
const STATUS_DOING = 3

/** Linked platform entry extracted from mergedLinkedIds */
interface CrossPlatformEntry {
  provider: string
  type: string
  providerId: string
}

/** Params for syncNeoDBRecord extracted from syncToLocalStorage context */
interface SyncNeoDBParams {
  identity: UrlIdentity
  numericStatus: number
  pageRating: number
  pageComment: string | undefined
  mergedLinkedIds: Record<string, string>
  crossPlatformEntries: CrossPlatformEntry[]
  doubanStoreName: string
  doubanKey: string
}

/** Map page status string to numeric DB status */
function pageStatusToNumeric(pageStatus: string): number {
  return pageStatus === 'done' ? STATUS_DONE
    : pageStatus === 'wish' ? STATUS_WISH
    : pageStatus === 'doing' ? STATUS_DOING
    : 0
}

// ✅ P1: 通知防抖缓存（key: providerId, value: timestamp）
const notificationCache = new Map<string, number>()
const NOTIFICATION_COOLDOWN = 5000 // 5秒冷却时间
const MAX_CACHE_SIZE = 100 // 限制缓存大小
const CACHE_CLEANUP_INTERVAL = 60000 // 每分钟清理一次

// NeoDB sync rate-limit cache — prevents repeated API calls within 60s
const neodbSyncCache = new Map<string, number>()
const NEODB_SYNC_COOLDOWN = 60000

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
 * 同步页面状态到本地存储 — 支持已看、想看状态
 *
 * 功能：
 * - 保存豆瓣记录到本地数据库（使用实际状态，非硬编码）
 * - 为跨平台关联（IMDB/TMDB）创建或更新记录
 * - 自动同步到 NeoDB（首次或状态变更时）
 */
export async function syncToLocalStorage(
  identity: UrlIdentity,
  pageStatus: string,
  pageRating: number,
  cachedRecord?: StoreRecord | null
): Promise<void> {
  const statusLabel = pageStatus === 'done' ? 'watched' : pageStatus === 'doing' ? 'watching' : 'wish'
  console.log(`[UMM Douban] Page shows ${statusLabel} status, saving to database...`)

  const storeName = `${identity.provider}_records`
  const key = `${identity.type}::${identity.providerId}`
  const existingRecord = cachedRecord || await Store.dbGet(storeName, key)
  const numericStatus = pageStatusToNumeric(pageStatus)

    // Detect what changed compared to the existing DB record
  const isNewRecord = !existingRecord
  const isStatusChanged = existingRecord && existingRecord.status !== numericStatus
  const isRatingChanged = existingRecord && Math.abs(existingRecord.rating - pageRating) > 0.01

  const hasRealChange = isNewRecord || isStatusChanged || isRatingChanged

  const mergedLinkedIds = extractCrossPlatformLinks(identity, existingRecord?.linkedIds)
  const rawPageComment = extractCommentFromPage()
  // Preserve existing comment when page doesn't provide one — avoids
  // overwriting a known-good comment with empty string on pages where
  // the comment element isn't visible or doesn't exist.
  const pageComment = rawPageComment || existingRecord?.comment || ''
  const isCommentChanged = existingRecord && existingRecord.comment !== pageComment
  const effectiveChange = hasRealChange || isCommentChanged

  const recordToSave: StoreRecord = {
    url: identity.url,
    status: numericStatus,
    rating: pageRating,
    comment: pageComment,
    updatedAt: new Date().toISOString(),
    linkedIds: mergedLinkedIds,
  }

  // Cross-platform record creation/update for linked platforms (IMDb/TMDB)
  const now = new Date().toISOString()
  const crossPlatformEntries: CrossPlatformEntry[] = []

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

    // Skip when target is already done (2 — never downgrade), or source is non-done and target >= source
    if (existingTarget && (existingTarget.status === 2 || (numericStatus !== 2 && existingTarget.status >= numericStatus))) {
      console.log(`[UMM Douban] ⏭️ ${entry.provider} record already synced at status ${existingTarget.status}:`, targetKey)
      continue
    }

    const targetRecord: StoreRecord = {
      url: `${entry.provider === 'imdb' ? 'https://www.imdb.com/title/' : 'https://www.themoviedb.org/movie/'}${entry.providerId}/`,
      status: numericStatus,
      rating: pageRating,
      comment: pageComment,
      updatedAt: now,
      linkedIds: {
        ...(existingTarget?.linkedIds || {}),
        douban: `${identity.type}::${identity.providerId}`,
      },
    }

    await Store.dbPut(targetStore, targetKey, targetRecord)
    const platformLabel = entry.provider === 'imdb' ? 'IMDb' : 'TMDB'
    const action = existingTarget ? 'updated' : 'created'
    console.log(`[UMM Douban] ✅ ${action} ${entry.provider} record:`, targetKey, 'status:', numericStatus)
    showNotification(t('sync.to_platform', { platform: platformLabel, id: entry.providerId }))
  }

  console.log('[UMM Douban] Record to save:', recordToSave)
  console.log('[UMM Douban] Change detection:', { isNewRecord, isStatusChanged, isRatingChanged, isCommentChanged, hasRealChange, numericStatus })

  try {
    await Store.dbPut(storeName, key, recordToSave)
    console.log(`[UMM Douban] ✅ Record saved (status=${numericStatus})`)

    const cacheKey = `${identity.provider}:${identity.providerId}`
    const lastNotificationTime = notificationCache.get(cacheKey) || 0
    const nowTime = Date.now()
    const inCooldown = nowTime - lastNotificationTime < NOTIFICATION_COOLDOWN
    
    if (effectiveChange && !inCooldown) {
      if (isNewRecord) {
        showNotification(t(identity.type === 'music' ? 'sync.douban_auto_music' : 'sync.douban_auto'))
      } else if (isStatusChanged) {
        showNotification(t(identity.type === 'music' ? 'sync.status_updated_music' : 'sync.status_updated'))
      } else if (isRatingChanged) {
        showNotification(t('sync.rating_updated', { rating: Utils.formatRating10(pageRating) }))
      } else if (isCommentChanged) {
        showNotification(t('sync.comment_updated'))
      }
      notificationCache.set(cacheKey, nowTime)
    } else {
      console.log('[UMM Douban] ⏭️ Data unchanged or cooldown, skipped notification')
    }
  } catch (error) {
    console.error('[UMM Douban] ❌ Failed to save record:', error)
    showNotification(t('sync.failed'))
  }

  // Enhanced NeoDB trigger: first write, status change, OR when a "done" page
  // has a missing or wrong-status local NeoDB record
  let needsNeoDBSync = isNewRecord || isStatusChanged
  if (!needsNeoDBSync && numericStatus === STATUS_DONE) {
    const neodbLinkedKey = mergedLinkedIds.neodb
    if (neodbLinkedKey) {
      const neodbRecord = await Store.dbGet('neodb_records', neodbLinkedKey)
      if (!neodbRecord || neodbRecord.status !== STATUS_DONE) {
        needsNeoDBSync = true
      }
    } else {
      // No NeoDB link yet — attempt sync (syncNeoDBRecord creates it on success)
      needsNeoDBSync = true
    }
  }
  if (needsNeoDBSync) {
    await syncNeoDBRecord({
      identity, numericStatus, pageRating, pageComment,
      mergedLinkedIds, crossPlatformEntries,
      doubanStoreName: storeName, doubanKey: key,
    })
  }

  // Fire-and-forget health check: verify all linked platform records on "done" pages
  if (numericStatus === STATUS_DONE) {
    checkCrossPlatformRecords(identity, pageRating, pageComment, mergedLinkedIds, numericStatus).catch(err => {
      console.warn('[UMM Douban] Cross-platform health check failed:', err)
    })
  }
}

/**
 * Push rating to NeoDB API and create/update local NeoDB record with linkedIds.
 * Also updates cross-platform (IMDb/TMDB) records to include the NeoDB link.
 */
export async function syncNeoDBRecord(params: SyncNeoDBParams): Promise<void> {
  const { identity, numericStatus, pageRating, pageComment, mergedLinkedIds, crossPlatformEntries, doubanStoreName, doubanKey } = params
  try {
    const settings = await Store.getSettings()
    if (!settings.autoSyncNeoDB || !settings.neodbToken) return

    // Rate limit: skip if same item was synced within 60s
    const syncCacheKey = `${identity.type}::${identity.providerId}`
    const lastSync = neodbSyncCache.get(syncCacheKey) || 0
    if (Date.now() - lastSync < NEODB_SYNC_COOLDOWN) {
      console.log('[UMM Douban] NeoDB sync cooldown active, skipping')
      return
    }

    console.log('[UMM Douban] Auto-syncing to NeoDB...')
    const syncResponse = await safeSendMessage({
      type: 'NEODB_PUSH_RATING',
      payload: {
        record: {
          providerId: identity.providerId,
          rating: pageRating,
          status: numericStatus,
          type: identity.type,
          provider: identity.provider,
          comment: pageComment,
        },
      },
    }, { timeout: 10000 })

    if (syncResponse?.success && syncResponse.catalogUuid) {
      const neodbFullKey = `${identity.type}::${syncResponse.catalogUuid}`

      // 1. Update douban record linkedIds.neodb
      const existingAfterPush = await Store.dbGet(doubanStoreName, doubanKey)
      if (existingAfterPush) {
        existingAfterPush.linkedIds = existingAfterPush.linkedIds || {}
        existingAfterPush.linkedIds.neodb = neodbFullKey
        await Store.dbPut(doubanStoreName, doubanKey, existingAfterPush)
      }

      // 2. Create/update NeoDB local record
      const neodbStoreName = 'neodb_records'
      const neodbKey = neodbFullKey
      const existingNeoDB = await Store.dbGet(neodbStoreName, neodbKey)
      const doubanFullKey = `${identity.type}::${identity.providerId}`

      const neodbLinkedIds: Record<string, string> = { douban: doubanFullKey }
      if (mergedLinkedIds.imdb) neodbLinkedIds.imdb = mergedLinkedIds.imdb
      if (mergedLinkedIds.tmdb) neodbLinkedIds.tmdb = mergedLinkedIds.tmdb

      if (existingNeoDB) {
        existingNeoDB.linkedIds = { ...(existingNeoDB.linkedIds || {}), ...neodbLinkedIds }
        await Store.dbPut(neodbStoreName, neodbKey, existingNeoDB)
      } else {
        const neodbRecord: StoreRecord = {
          url: Identity.buildNeoDBUrl(identity.type, syncResponse.catalogUuid),
          status: numericStatus,
          rating: pageRating,
          updatedAt: new Date().toISOString(),
          linkedIds: neodbLinkedIds,
        }
        await Store.dbPut(neodbStoreName, neodbKey, neodbRecord)
      }

      // 3. Update IMDB/TMDB records to include neodb link
      for (const entry of crossPlatformEntries) {
        const targetStore = `${entry.provider}_records`
        const entryKey = `${entry.type}::${entry.providerId}`
        const existingTarget = await Store.dbGet(targetStore, entryKey)
        if (existingTarget) {
          existingTarget.linkedIds = existingTarget.linkedIds || {}
          if (existingTarget.linkedIds.neodb !== neodbFullKey) {
            existingTarget.linkedIds.neodb = neodbFullKey
            await Store.dbPut(targetStore, entryKey, existingTarget)
          }
        }
      }
      // Mark sync success in rate-limit cache
      neodbSyncCache.set(syncCacheKey, Date.now())
      // Refresh NeoDB push buttons UI to reflect the new linked state
      try {
        const updatedRecord = await Store.dbGet(doubanStoreName, doubanKey)
        injectNeoDBPushButtons(identity, updatedRecord)
      } catch {
        // UI refresh is non-critical
      }
      FloatingToast.info('UMM', t('sync.neodb_auto_ok'))
      console.log('[UMM Douban] Auto-synced to NeoDB')
    } else if (syncResponse?.success) {
      FloatingToast.info('UMM', t('sync.neodb_auto_no_id'))
    } else {
      FloatingToast.info('UMM', t('sync.neodb_auto_failed'))
    }
  } catch (syncErr) {
    FloatingToast.error('UMM', t('sync.neodb_auto_failed_err'))
    console.warn('[UMM Douban] NeoDB auto-sync failed:', syncErr)
  }
}

/**
 * Health check: verify all linked platform records exist and have correct status.
 * Creates missing records and updates wrong-status records following the
 * never-downgrade-done rule. Runs fire-and-forget after the main sync flow.
 */
export async function checkCrossPlatformRecords(
  identity: UrlIdentity,
  pageRating: number,
  pageComment: string | undefined,
  mergedLinkedIds: Record<string, string>,
  sourceStatus: number,
): Promise<void> {
  const now = new Date().toISOString()
  const doubanFullKey = `${identity.type}::${identity.providerId}`

  for (const [platform, linkKey] of Object.entries({ imdb: mergedLinkedIds.imdb, tmdb: mergedLinkedIds.tmdb, neodb: mergedLinkedIds.neodb })) {
    if (!linkKey) continue

    const targetStore = `${platform}_records`
    const existingTarget = await Store.dbGet(targetStore, linkKey)
    const [, pid] = linkKey.split('::')

    // Build target URL
    let targetUrl: string
    if (platform === 'imdb') targetUrl = `https://www.imdb.com/title/${pid}/`
    else if (platform === 'tmdb') targetUrl = `https://www.themoviedb.org/movie/${pid}/`
    else if (platform === 'neodb') targetUrl = Identity.buildNeoDBUrl(identity.type, pid)
    else continue

    if (!existingTarget) {
      // Missing record — create with source status
      await Store.dbPut(targetStore, linkKey, {
        url: targetUrl,
        status: sourceStatus,
        rating: pageRating,
        comment: pageComment || '',
        updatedAt: now,
        linkedIds: { [identity.provider]: doubanFullKey },
      })
      console.log(`[UMM Douban] Health check: created ${platform} record:`, linkKey)
    } else if (existingTarget.status !== 2 && existingTarget.status < sourceStatus) {
      // Exists with lower status — upgrade (never downgrade done=2)
      existingTarget.status = sourceStatus
      existingTarget.rating = pageRating || existingTarget.rating
      existingTarget.comment = pageComment || existingTarget.comment
      existingTarget.updatedAt = now
      existingTarget.linkedIds = { ...(existingTarget.linkedIds || {}), [identity.provider]: doubanFullKey }
      await Store.dbPut(targetStore, linkKey, existingTarget)
      console.log(`[UMM Douban] Health check: updated ${platform} status:`, linkKey, '→', sourceStatus)
    }
    // If exists and already done (2) or same status — skip
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
