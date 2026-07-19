import { Store } from '@/features/database'
import { Identity } from '@/shared/identity'
import { safeSendMessage } from '@/utils/context'
import { extractCrossPlatformLinks, injectNeoDBPushButtons, FloatingToast, t } from '@/content/douban/shared/legacy-bridge'
import type { StoreRecord, UrlIdentity } from '@/types'

export interface SaveOptions {
  identity: UrlIdentity
  interest: 'wish' | 'do' | 'collect'
  stars: number
  comment: string
  newStatus: number
  newRating: number
}

/**
 * Handle save after interest marking — persists to local DB,
 * syncs cross-platform (IMDb/TMDB), and auto-pushes to NeoDB.
 * Returns the updated db record.
 */
export async function onCrossPlatformSave(options: SaveOptions): Promise<StoreRecord | null> {
  const { identity, interest, newStatus, newRating, comment } = options
  const key = `${identity.type}::${identity.providerId}`
  const existing = await Store.dbGet('douban_records', key)
  const isNew = !existing
  const record: StoreRecord = {
    url: window.location.href,
    status: newStatus,
    rating: newRating,
    comment: comment || existing?.comment || '',
    updatedAt: new Date().toISOString(),
    linkedIds: existing?.linkedIds ?? {},
  }
  await Store.dbPut('douban_records', key, record)

  // Show save toast
  if (isNew) {
    FloatingToast.info('UMM', interest === 'collect' || interest === 'do' ? t('sync.douban_auto') : t('sync.status_updated'))
  } else {
    const isRatingChanged = newRating !== (existing?.rating || 0)
    const isCommentChanged = (comment || '') !== (existing?.comment || '')
    if (isRatingChanged) FloatingToast.info('UMM', t('sync.rating_updated', { rating: newRating }))
    if (isCommentChanged) FloatingToast.info('UMM', t('sync.comment_updated'))
    if (!isRatingChanged && !isCommentChanged) FloatingToast.info('UMM', t('sync.status_updated'))
  }

  // Cross-platform sync (IMDb / TMDB)
  const mergedLinks = extractCrossPlatformLinks(identity, existing?.linkedIds)
  if (JSON.stringify(mergedLinks) !== JSON.stringify(existing?.linkedIds)) {
    record.linkedIds = mergedLinks
    await Store.dbPut('douban_records', key, record)
    let syncedCount = 0
    for (const [platform, linkKey] of Object.entries({ imdb: mergedLinks.imdb, tmdb: mergedLinks.tmdb })) {
      if (!linkKey) continue
      const [, pid] = linkKey.split('::')
      const targetStore = `${platform}_records`
      const existingTarget = await Store.dbGet(targetStore, linkKey)
      if (!existingTarget || existingTarget.status !== newStatus) {
        await Store.dbPut(targetStore, linkKey, {
          url: `${platform === 'imdb' ? 'https://www.imdb.com/title/' : 'https://www.themoviedb.org/movie/'}${pid}/`,
          status: newStatus,
          rating: newRating,
          comment: comment || '',
          updatedAt: new Date().toISOString(),
          linkedIds: { ...(existingTarget?.linkedIds || {}), douban: key },
        } as StoreRecord)
        syncedCount++
      }
    }
    if (syncedCount > 0) {
      FloatingToast.info('UMM', t('sync.platform_link', { platform: 'IMDb/TMDB' }))
    }
  }

  // NeoDB auto-sync
  const shouldAutoSyncNeoDB = interest === 'collect' || interest === 'do' || interest === 'wish'
  if (shouldAutoSyncNeoDB) {
    try {
      const settings = await Store.getSettings()
      if (settings.autoSyncNeoDB && settings.neodbToken) {
        const hasNeoDBId = existing?.linkedIds?.neodb
        const isStatusChanged = existing && existing.status !== newStatus

        if (!hasNeoDBId) {
          // Case 1: No NeoDB link yet — call API to create link
          await syncToNeoDB(identity, key, mergedLinks, newStatus, newRating, comment)
        } else if (isStatusChanged) {
          // Case 2: Has NeoDB link but status changed — call API to update status
          // Rating protection: don't push Douban rating when NeoDB record already exists
          // with same status (the user may have set a different rating on NeoDB).
          await syncToNeoDB(identity, key, mergedLinks, newStatus, 0, comment)
        } else {
          // Case 3: Has NeoDB link and status unchanged — ensure linkedIds are correct
          const neodbKey = existing!.linkedIds!.neodb!
          const existingNeoDB = await Store.dbGet('neodb_records', neodbKey)
          if (existingNeoDB) {
            const neodbLinkedIds: Record<string, string> = { douban: key }
            if (mergedLinks.imdb) neodbLinkedIds.imdb = mergedLinks.imdb
            if (mergedLinks.tmdb) neodbLinkedIds.tmdb = mergedLinks.tmdb
            existingNeoDB.linkedIds = { ...(existingNeoDB.linkedIds || {}), ...neodbLinkedIds }
            await Store.dbPut('neodb_records', neodbKey, existingNeoDB)
          }
        }
      }
    } catch (e) {
      console.warn('[UMM] NeoDB auto-sync failed:', e)
      FloatingToast.error('UMM', t('sync.neodb_auto_failed_err'))
    }
  }

  // Refresh NeoDB buttons
  try {
    const updated = await Store.dbGet('douban_records', key)
    injectNeoDBPushButtons(identity, updated)
  } catch { /* non-critical */ }

  return record
}

/**
 * Companion check — runs on page load for existing watched records.
 * Ensures NeoDB link/sync is present when auto-sync is enabled,
 * even if the user doesn't manually save anything.
 */
export async function syncNeoDBOnLoad(
  identity: UrlIdentity,
  record: { status: number; rating: number } | null,
): Promise<void> {
  if (!record || record.status < 2) return

  const key = `${identity.type}::${identity.providerId}`
  try {
    const settings = await Store.getSettings()
    if (!settings.autoSyncNeoDB || !settings.neodbToken) return

    const existing = await Store.dbGet('douban_records', key)
    if (!existing || existing.status < 2) return

    const mergedLinks = extractCrossPlatformLinks(identity, existing?.linkedIds)
    const hasNeoDBId = existing?.linkedIds?.neodb

    if (!hasNeoDBId) {
      // No NeoDB link yet — create it silently (no toast on page load)
      await syncToNeoDB(identity, key, mergedLinks, existing.status, existing.rating, existing.comment || '')
      // Refresh NeoDB buttons to show the new "Open in NeoDB" button
      const updated = await Store.dbGet('douban_records', key)
      injectNeoDBPushButtons(identity, updated)
    } else {
      // Ensure linkedIds are correct
      const neodbKey = existing.linkedIds!.neodb!
      const existingNeoDB = await Store.dbGet('neodb_records', neodbKey)
      if (existingNeoDB) {
        const neodbLinkedIds: Record<string, string> = { douban: key }
        if (mergedLinks.imdb) neodbLinkedIds.imdb = mergedLinks.imdb
        if (mergedLinks.tmdb) neodbLinkedIds.tmdb = mergedLinks.tmdb
        existingNeoDB.linkedIds = { ...(existingNeoDB.linkedIds || {}), ...neodbLinkedIds }
        await Store.dbPut('neodb_records', neodbKey, existingNeoDB)
      }
    }
  } catch (e) {
    console.warn('[UMM] NeoDB on-load sync check failed:', e)
  }
}

/** Call NEODB_PUSH_RATING API and handle the response. */
async function syncToNeoDB(
  identity: UrlIdentity,
  doubanKey: string,
  mergedLinks: Record<string, string>,
  status: number,
  rating: number,
  comment: string,
): Promise<void> {
  const syncResponse = await safeSendMessage({
    type: 'NEODB_PUSH_RATING',
    payload: {
      record: {
        providerId: identity.providerId,
        rating,
        status,
        type: identity.type,
        provider: 'douban',
        comment: comment || '',
      },
    },
  }, { timeout: 10000 })

  if (syncResponse?.success && syncResponse.catalogUuid) {
    const neodbFullKey = `${identity.type}::${syncResponse.catalogUuid}`

    // Update douban record linkedIds.neodb
    const existingAfterPush = await Store.dbGet('douban_records', doubanKey)
    if (existingAfterPush) {
      existingAfterPush.linkedIds = existingAfterPush.linkedIds || {}
      existingAfterPush.linkedIds.neodb = neodbFullKey
      existingAfterPush.updatedAt = new Date().toISOString()
      await Store.dbPut('douban_records', doubanKey, existingAfterPush)
    }

    // Create/update NeoDB local record
    const neodbStoreName = 'neodb_records'
    const neodbKey = existingAfterPush?.linkedIds?.neodb || neodbFullKey
    const existingNeoDB = await Store.dbGet(neodbStoreName, neodbKey)
    const neodbLinkedIds: Record<string, string> = { douban: doubanKey }
    if (mergedLinks.imdb) neodbLinkedIds.imdb = mergedLinks.imdb
    if (mergedLinks.tmdb) neodbLinkedIds.tmdb = mergedLinks.tmdb

    if (existingNeoDB) {
      existingNeoDB.linkedIds = { ...(existingNeoDB.linkedIds || {}), ...neodbLinkedIds }
      await Store.dbPut(neodbStoreName, neodbKey, existingNeoDB)
    } else {
      const neodbRecord: StoreRecord = {
        url: Identity.buildNeoDBUrl(identity.type, syncResponse.catalogUuid),
        status,
        rating,
        updatedAt: new Date().toISOString(),
        linkedIds: neodbLinkedIds,
      }
      await Store.dbPut(neodbStoreName, neodbKey, neodbRecord)
    }

    // Update IMDB/TMDB records with NeoDB link
    for (const [pfx, linkKey] of Object.entries({ imdb: mergedLinks.imdb, tmdb: mergedLinks.tmdb } as Record<string, string>)) {
      if (!linkKey) continue
      const targetStore = `${pfx}_records`
      const existingTarget = await Store.dbGet(targetStore, linkKey)
      if (existingTarget) {
        existingTarget.linkedIds = existingTarget.linkedIds || {}
        if (existingTarget.linkedIds.neodb !== neodbFullKey) {
          existingTarget.linkedIds.neodb = neodbFullKey
          await Store.dbPut(targetStore, linkKey, existingTarget)
        }
      }
    }

    FloatingToast.info('UMM', t('sync.neodb_auto_ok'))
  } else if (syncResponse?.success) {
    FloatingToast.info('UMM', t('sync.neodb_auto_no_id'))
  } else {
    FloatingToast.error('UMM', t('sync.neodb_auto_failed'))
  }
}