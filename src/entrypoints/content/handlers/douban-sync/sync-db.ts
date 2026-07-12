/**
 * IndexedDB sync logic for Douban records.
 *
 * Handles saving Douban records to the local database with change
 * detection, user notifications with cooldown-based deduplication,
 * and coordination of cross-platform and NeoDB sync after a save.
 */

import { Store } from '@/features/database'
import { Utils } from '@/utils'
import type { UrlIdentity, StoreRecord } from '@/types'
import { extractCrossPlatformLinks, extractCommentFromPage } from '../douban-scanner'
import { t } from '../../i18n'
import { showNotification } from '../douban-toast'
import { syncNeoDBRecord } from './sync-neodb'
import { syncCrossPlatformRecords, checkCrossPlatformRecords } from './sync-cross-platform'

// Status constants (mirrors the DB enum)
const STATUS_DONE = 2
const STATUS_WISH = 1
const STATUS_DOING = 3

/** Map page status string to numeric DB status */
function pageStatusToNumeric(pageStatus: string): number {
  return pageStatus === 'done'
    ? STATUS_DONE
    : pageStatus === 'wish'
      ? STATUS_WISH
      : pageStatus === 'doing'
        ? STATUS_DOING
        : 0
}

// ── Notification cooldown cache ──────────────────────────────────────
const notificationCache = new Map<string, number>()
const NOTIFICATION_COOLDOWN = 5000
const MAX_CACHE_SIZE = 100
const CACHE_CLEANUP_INTERVAL = 60000

/** Purge entries older than 2× cooldown; LRU-evict excess entries */
function cleanupNotificationCache() {
  const now = Date.now()
  let cleanedCount = 0

  for (const [key, timestamp] of notificationCache.entries()) {
    if (now - timestamp > NOTIFICATION_COOLDOWN * 2) {
      notificationCache.delete(key)
      cleanedCount++
    }
  }

  // When still oversized, keep the newest 70 %
  if (notificationCache.size > MAX_CACHE_SIZE) {
    const entries = Array.from(notificationCache.entries())
    entries.sort((a, b) => a[1] - b[1])
    const targetSize = Math.floor(MAX_CACHE_SIZE * 0.7)
    const toDeleteCount = notificationCache.size - targetSize
    const toDelete = entries.slice(0, toDeleteCount)
    toDelete.forEach(([key]) => notificationCache.delete(key))
    cleanedCount += toDelete.length
  }

  if (cleanedCount > 0) {
    console.log(
      `[UMM Douban] Cleaned ${cleanedCount} expired notification cache entries`,
    )
  }
}

const cacheCleanupTimer = setInterval(
  cleanupNotificationCache,
  CACHE_CLEANUP_INTERVAL,
)

// Safety timeout — prevent the timer from keeping the page alive forever
setTimeout(() => {
  clearInterval(cacheCleanupTimer)
  console.log('[UMM Douban] Cache cleanup timer timeout cleared')
}, 600000)

window.addEventListener('beforeunload', () => {
  clearInterval(cacheCleanupTimer)
  notificationCache.clear()
  console.log('[UMM Douban] Notification cache cleared on page unload')
})

// ── Main sync ────────────────────────────────────────────────────────

/**
 * Sync Douban page state to the local IndexedDB store.
 *
 * Features:
 * - Saves the douban record with actual page status (not hardcoded)
 * - Creates or updates cross-platform records (IMDb, TMDB) for linked IDs
 * - Auto-syncs to NeoDB when the record is new, status changed, or a
 *   "done" page lacks a matching NeoDB record
 * - Fire-and-forget health check for all linked platform records
 * - Deduplicated toasts (cooldown per item)
 */
export async function syncToLocalStorage(
  identity: UrlIdentity,
  pageStatus: string,
  pageRating: number,
  cachedRecord?: StoreRecord | null,
): Promise<void> {
  const statusLabel =
    pageStatus === 'done'
      ? 'watched'
      : pageStatus === 'doing'
        ? 'watching'
        : 'wish'
  console.log(
    `[UMM Douban] Page shows ${statusLabel} status, saving to database...`,
  )

  const storeName = `${identity.provider}_records`
  const key = `${identity.type}::${identity.providerId}`
  const existingRecord =
    cachedRecord || (await Store.dbGet(storeName, key))
  const numericStatus = pageStatusToNumeric(pageStatus)

  // Detect what changed compared to the existing DB record
  const isNewRecord = !existingRecord
  const isStatusChanged =
    existingRecord && existingRecord.status !== numericStatus
  const isRatingChanged =
    existingRecord && Math.abs(existingRecord.rating - pageRating) > 0.01

  const hasRealChange = isNewRecord || isStatusChanged || isRatingChanged

  const mergedLinkedIds = extractCrossPlatformLinks(
    identity,
    existingRecord?.linkedIds,
  )
  const rawPageComment = extractCommentFromPage(identity)
  // Preserve existing comment when page doesn't provide one — avoids
  // overwriting a known-good comment with empty string on pages where
  // the comment element isn't visible or doesn't exist.
  const pageComment = rawPageComment || existingRecord?.comment || ''
  const isCommentChanged =
    existingRecord && existingRecord.comment !== pageComment
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
  const crossPlatformEntries = await syncCrossPlatformRecords(
    identity,
    numericStatus,
    pageRating,
    pageComment,
    mergedLinkedIds,
  )

  console.log('[UMM Douban] Record to save:', recordToSave)
  console.log('[UMM Douban] Change detection:', {
    isNewRecord,
    isStatusChanged,
    isRatingChanged,
    isCommentChanged,
    hasRealChange,
    numericStatus,
  })

  try {
    await Store.dbPut(storeName, key, recordToSave)
    console.log(`[UMM Douban] ✅ Record saved (status=${numericStatus})`)

    // Cooldown-gated notification
    const cacheKey = `${identity.provider}:${identity.providerId}`
    const lastNotificationTime = notificationCache.get(cacheKey) || 0
    const nowTime = Date.now()
    const inCooldown =
      nowTime - lastNotificationTime < NOTIFICATION_COOLDOWN

    if (effectiveChange && !inCooldown) {
      if (isNewRecord) {
        showNotification(
          t(
            identity.type === 'music'
              ? 'sync.douban_auto_music'
              : 'sync.douban_auto',
          ),
        )
      } else if (isStatusChanged) {
        showNotification(
          t(
            identity.type === 'music'
              ? 'sync.status_updated_music'
              : 'sync.status_updated',
          ),
        )
      } else if (isRatingChanged) {
        showNotification(
          t('sync.rating_updated', {
            rating: Utils.formatRating10(pageRating),
          }),
        )
      } else if (isCommentChanged) {
        showNotification(t('sync.comment_updated'))
      }
      notificationCache.set(cacheKey, nowTime)
    } else {
      console.log(
        '[UMM Douban] ⏭️ Data unchanged or cooldown, skipped notification',
      )
    }
  } catch (error) {
    console.error('[UMM Douban] ❌ Failed to save record:', error)
    showNotification(t('sync.failed'))
  }

  // Enhanced NeoDB trigger: first write, status change, OR when a "done"
  // page has a missing or wrong-status local NeoDB record.
  //
  // 📌 Rating is deliberately NOT a trigger here — when a local NeoDB
  // record already exists (linkedIds.neodb), the user may have manually
  // set a different rating on NeoDB (it supports 0.5-increment precision).
  // Pushing the Douban rating again would overwrite that manual choice.
  // The runtime guard in syncNeoDBRecord() also skips the rating in the
  // API payload when the local NeoDB record exists.
  let needsNeoDBSync = isNewRecord || isStatusChanged
  if (!needsNeoDBSync && numericStatus === STATUS_DONE) {
    const neodbLinkedKey = mergedLinkedIds.neodb
    if (neodbLinkedKey) {
      const neodbRecord = await Store.dbGet(
        'neodb_records',
        neodbLinkedKey,
      )
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
      identity,
      numericStatus,
      pageRating,
      pageComment,
      mergedLinkedIds,
      crossPlatformEntries,
      doubanStoreName: storeName,
      doubanKey: key,
    })
  }

  // Fire-and-forget health check: verify all linked platform records
  // on "done" pages
  if (numericStatus === STATUS_DONE) {
    checkCrossPlatformRecords(
      identity,
      pageRating,
      pageComment,
      mergedLinkedIds,
      numericStatus,
    ).catch((err) => {
      console.warn(
        '[UMM Douban] Cross-platform health check failed:',
        err,
      )
    })
  }
}

/**
 * Fetch the local (IndexedDB) record for a given page identity.
 *
 * Returns the full StoreRecord when found, or null when no record
 * exists yet for this identity.
 */
export async function getLocalRecord(
  identity: UrlIdentity,
): Promise<StoreRecord | null> {
  try {
    console.log('[UMM] getLocalRecord called with:', identity)

    const storeName = `${identity.provider}_records`
    const key = `${identity.type}::${identity.providerId}`
    const record = await Store.dbGet(storeName, key)

    if (record) {
      console.log('[UMM] getLocalRecord success:', {
        rating: record.rating,
        status: record.status,
        linkedIds: record.linkedIds,
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
