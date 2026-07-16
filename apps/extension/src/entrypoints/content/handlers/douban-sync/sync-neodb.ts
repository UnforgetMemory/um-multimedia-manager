/**
 * NeoDB push/pull logic for Douban sync.
 *
 * Pushes ratings and status to the NeoDB API, creates/updates the local
 * NeoDB record with back-links, and refreshes the NeoDB push button UI
 * after a successful sync.  A rate-limit cache prevents repeated calls
 * for the same item within 60 seconds.
 */

import { Store } from '@/features/database'
import { safeSendMessage } from '@/utils/context'
import type { UrlIdentity, StoreRecord } from '@/types'
import { FloatingToast } from '../../utils/toast'
import { Identity } from '@/shared/identity'
import { injectNeoDBPushButtons } from '../../neodb-push'
import { t } from '../../i18n'
import type { CrossPlatformEntry } from './sync-cross-platform'

/** Parameters forwarded from syncToLocalStorage to syncNeoDBRecord */
export interface SyncNeoDBParams {
  identity: UrlIdentity
  numericStatus: number
  pageRating: number
  pageComment: string | undefined
  mergedLinkedIds: Record<string, string>
  crossPlatformEntries: CrossPlatformEntry[]
  doubanStoreName: string
  doubanKey: string
}

// NeoDB sync rate-limit cache — prevents repeated API calls within 60s
const neodbSyncCache = new Map<string, number>()
const NEODB_SYNC_COOLDOWN = 60000

/**
 * Push rating to NeoDB API and create/update local NeoDB record with
 * linkedIds.  Also updates cross-platform (IMDb/TMDB) records to include
 * the NeoDB link so the graph is fully connected.
 */
export async function syncNeoDBRecord(
  params: SyncNeoDBParams,
): Promise<void> {
  const {
    identity,
    numericStatus,
    pageRating,
    pageComment,
    mergedLinkedIds,
    crossPlatformEntries,
    doubanStoreName,
    doubanKey,
  } = params

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

    // ── Rating protection ─────────────────────────────────────────────
    // When a local NeoDB record already exists AND its status matches the
    // current page status, don't push the Douban rating to the API — the
    // user may have manually chosen a different rating on NeoDB (which
    // supports 0.5-increment precision).  Setting ratingToPush=0 tells
    // markItem() to omit rating_grade from the payload, preserving the
    // existing NeoDB rating.
    //
    // When status changed (DONE→WISH or WISH→DONE), the user actively
    // changed their intent — push rating normally and sync everything.
    let ratingToPush = pageRating
    const neodbLinkedKey = mergedLinkedIds.neodb
    if (neodbLinkedKey) {
      const existingNeoDBRecord = await Store.dbGet('neodb_records', neodbLinkedKey)
      if (existingNeoDBRecord && existingNeoDBRecord.status === numericStatus) {
        console.log(
          '[UMM Douban] NeoDB record exists with same status — ' +
          'preserving its rating, skipping Douban rating push',
        )
        ratingToPush = 0
      } else if (existingNeoDBRecord) {
        console.log(
          '[UMM Douban] NeoDB record exists but status changed ' +
          `(${existingNeoDBRecord.status}→${numericStatus}) — ` +
          'pushing full sync with Douban rating',
        )
      }
    }

    console.log('[UMM Douban] Auto-syncing to NeoDB...')
    const syncResponse = await safeSendMessage(
      {
        type: 'NEODB_PUSH_RATING',
        payload: {
          record: {
            providerId: identity.providerId,
            rating: ratingToPush,
            status: numericStatus,
            type: identity.type,
            provider: identity.provider,
            comment: pageComment,
          },
        },
      },
      { timeout: 10000 },
    )

    if (syncResponse?.success && syncResponse.catalogUuid) {
      const neodbFullKey = `${identity.type}::${syncResponse.catalogUuid}`

      // 1. Update douban record linkedIds.neodb — always refresh record after sync
      const existingAfterPush = await Store.dbGet(doubanStoreName, doubanKey)
      if (existingAfterPush) {
        existingAfterPush.linkedIds = existingAfterPush.linkedIds || {}
        existingAfterPush.linkedIds.neodb = neodbFullKey
        existingAfterPush.updatedAt = new Date().toISOString()
        await Store.dbPut(doubanStoreName, doubanKey, existingAfterPush)
      }

      // 2. Create/update NeoDB local record
      const neodbStoreName = 'neodb_records'
      // Prefer the existing linkedIds key to avoid creating duplicate records
      // when the API returns a different catalogUuid than a previous sync.
      const neodbKey = existingAfterPush?.linkedIds?.neodb || neodbFullKey
      const existingNeoDB = await Store.dbGet(neodbStoreName, neodbKey)
      const doubanFullKey = `${identity.type}::${identity.providerId}`

      const neodbLinkedIds: Record<string, string> = {
        douban: doubanFullKey,
      }
      if (mergedLinkedIds.imdb) neodbLinkedIds.imdb = mergedLinkedIds.imdb
      if (mergedLinkedIds.tmdb) neodbLinkedIds.tmdb = mergedLinkedIds.tmdb

      if (existingNeoDB) {
        // Always sync linkedIds
        existingNeoDB.linkedIds = {
          ...(existingNeoDB.linkedIds || {}),
          ...neodbLinkedIds,
        }
        // Always refresh updatedAt after a sync; only update status/rating
        // when the source intent changed (status differed).
        existingNeoDB.updatedAt = new Date().toISOString()
        if (existingNeoDB.status !== numericStatus) {
          existingNeoDB.status = numericStatus
          existingNeoDB.rating = pageRating
        }
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
