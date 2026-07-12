import { Store } from '@/features/database'
import { Identity } from '@/shared/identity'
import { safeSendMessage } from '@/utils/context'
import { extractCrossPlatformLinks } from '@/entrypoints/content/handlers/douban-scanner'
import { injectNeoDBPushButtons } from '@/entrypoints/content/neodb-push'
import { FloatingToast } from '@/entrypoints/content/utils/toast'
import { t } from '@/entrypoints/content/i18n'
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

  // NeoDB auto-sync — trigger on any interest change (wish/do/collect)
  // when: (a) first time linking (no existing NeoDB ID), or (b) status changed
  const shouldAutoSyncNeoDB = interest === 'collect' || interest === 'do' || interest === 'wish'
  if (shouldAutoSyncNeoDB) {
    const hasNeoDBId = existing?.linkedIds?.neodb
    const isStatusChanged = existing && existing.status !== newStatus
    if (!hasNeoDBId || isStatusChanged) {
      try {
        const settings = await Store.getSettings()
        if (settings.autoSyncNeoDB && settings.neodbToken) {
          const syncResponse = await safeSendMessage({
            type: 'NEODB_PUSH_RATING',
            payload: {
              record: {
                providerId: identity.providerId,
                rating: newRating,
                status: newStatus,
                type: identity.type,
                provider: 'douban',
                comment: comment || '',
              },
            },
          }, { timeout: 10000 })
          if (syncResponse?.success && syncResponse.catalogUuid) {
            const neodbFullKey = `${identity.type}::${syncResponse.catalogUuid}`
            const existingAfterPush = await Store.dbGet('douban_records', key)
            if (existingAfterPush) {
              existingAfterPush.linkedIds = existingAfterPush.linkedIds || {}
              existingAfterPush.linkedIds.neodb = neodbFullKey
              existingAfterPush.updatedAt = new Date().toISOString()
              await Store.dbPut('douban_records', key, existingAfterPush)
            }
            const neodbStoreName = 'neodb_records'
            const existingNeoDB = await Store.dbGet(neodbStoreName, neodbFullKey)
            const neodbLinkedIds: Record<string, string> = { douban: key }
            if (mergedLinks.imdb) neodbLinkedIds.imdb = mergedLinks.imdb
            if (mergedLinks.tmdb) neodbLinkedIds.tmdb = mergedLinks.tmdb
            if (existingNeoDB) {
              existingNeoDB.linkedIds = {
                ...(existingNeoDB.linkedIds || {}),
                ...neodbLinkedIds,
              }
              await Store.dbPut(neodbStoreName, neodbFullKey, existingNeoDB)
            } else {
              const neodbRecord: StoreRecord = {
                url: Identity.buildNeoDBUrl(identity.type, syncResponse.catalogUuid),
                status: newStatus,
                rating: newRating,
                updatedAt: new Date().toISOString(),
                linkedIds: neodbLinkedIds,
              }
              await Store.dbPut(neodbStoreName, neodbFullKey, neodbRecord)
            }
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
      } catch (e) {
        console.warn('[UMM] NeoDB auto-sync failed:', e)
        FloatingToast.error('UMM', t('sync.neodb_auto_failed_err'))
      }
    }
  }

  // Refresh NeoDB buttons
  try {
    const updated = await Store.dbGet('douban_records', key)
    injectNeoDBPushButtons(identity, updated)
  } catch { /* non-critical */ }

  return record
}
