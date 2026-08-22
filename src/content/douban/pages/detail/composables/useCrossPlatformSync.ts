import { Store } from '@/features/database'
import { UrlResolverBuilder } from '@/shared/identity'
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

  // Step 1: read the douban record once — its linkedIds gate the parallel reads
  // of imdb/tmdb/neodb that follow (ADR-015: bulk-read minimisation).
  const existing = await Store.dbGet('douban_records', key)
  const isNew = !existing

  // Cross-platform link extraction depends on existing linkedIds.
  const mergedLinks = extractCrossPlatformLinks(identity, existing?.linkedIds)
  const linksChanged = JSON.stringify(mergedLinks) !== JSON.stringify(existing?.linkedIds)

  // Step 2: parallel-read the linked records we may need to touch — one dbGet
  // per store dispatched together instead of serial awaits later.
  const neodbKey = existing?.linkedIds?.neodb
  const [existingImdb, existingTmdb, existingNeoDB] = await Promise.all([
    mergedLinks.imdb ? Store.dbGet('imdb_records', mergedLinks.imdb) : Promise.resolve(null),
    mergedLinks.tmdb ? Store.dbGet('tmdb_records', mergedLinks.tmdb) : Promise.resolve(null),
    neodbKey ? Store.dbGet('neodb_records', neodbKey) : Promise.resolve(null),
  ])

  // Build the final douban record up-front so we persist the douban key once
  // (ADR-015: write-merge — the pre-bulk version issued two dbPut for the
  // same douban key when links changed).
  const record: StoreRecord = {
    url: window.location.href,
    status: newStatus,
    rating: newRating,
    comment: comment || existing?.comment || '',
    updatedAt: new Date().toISOString(),
    linkedIds: mergedLinks,
  }

  // Show save toast (does not depend on persistence).
  if (isNew) {
    FloatingToast.info('UMM', interest === 'collect' || interest === 'do' ? t('sync.douban_auto') : t('sync.status_updated'))
  } else {
    const isRatingChanged = newRating !== (existing?.rating || 0)
    const isCommentChanged = (comment || '') !== (existing?.comment || '')
    if (isRatingChanged) FloatingToast.info('UMM', t('sync.rating_updated', { rating: newRating }))
    if (isCommentChanged) FloatingToast.info('UMM', t('sync.comment_updated'))
    if (!isRatingChanged && !isCommentChanged) FloatingToast.info('UMM', t('sync.status_updated'))
  }

  // Cross-platform sync (IMDb / TMDB) — only when links actually changed.
  // Use the pre-read existingImdb/existingTmdb instead of re-reading.
  if (linksChanged) {
    let syncedCount = 0
    const linkedWrites: Array<Promise<void>> = []
    for (const [platform, linkKey] of Object.entries({ imdb: mergedLinks.imdb, tmdb: mergedLinks.tmdb })) {
      if (!linkKey) continue
      const [, pid] = linkKey.split('::')
      const targetStore = `${platform}_records`
      const existingTarget = platform === 'imdb' ? existingImdb : existingTmdb
      if (!existingTarget || existingTarget.status !== newStatus) {
        linkedWrites.push(
          Store.dbPut(targetStore, linkKey, {
            url: `${platform === 'imdb' ? 'https://www.imdb.com/title/' : 'https://www.themoviedb.org/movie/'}${pid}/`,
            status: newStatus,
            rating: newRating,
            comment: comment || '',
            updatedAt: new Date().toISOString(),
            linkedIds: { ...(existingTarget?.linkedIds || {}), douban: key },
          } as StoreRecord),
        )
        syncedCount++
      }
    }
    // Persist the douban record (with merged links) exactly once, in parallel
    // with the linked-platform writes.
    await Promise.all([Store.dbPut('douban_records', key, record), ...linkedWrites])
    if (syncedCount > 0) {
      FloatingToast.info('UMM', t('sync.platform_link', { platform: 'IMDb/TMDB' }))
    }
  } else {
    // Links unchanged — still persist status/rating/comment changes once.
    await Store.dbPut('douban_records', key, record)
  }

  // NeoDB auto-sync
  const shouldAutoSyncNeoDB = interest === 'collect' || interest === 'do' || interest === 'wish'
  // The record shown by injectNeoDBPushButtons below. syncToNeoDB updates the
  // douban record immutably and, on a first-time link, returns the neodb-linked
  // record — use it so the "Open in NeoDB" button appears immediately instead
  // of injecting the stale pre-push snapshot.
  let recordForButtons = record
  if (shouldAutoSyncNeoDB) {
    try {
      const settings = await Store.getSettings()
      if (settings.autoSyncNeoDB && settings.neodbToken) {
        const hasNeoDBId = existing?.linkedIds?.neodb
        const isStatusChanged = existing && existing.status !== newStatus

        // Pass the already-read records into syncToNeoDB so it does not re-read
        // douban/neodb (ADR-015: deduplicated reads).
        const ctx = {
          doubanRecord: record,
          neodbRecord: existingNeoDB,
          linkedRecords: { imdb: existingImdb, tmdb: existingTmdb },
        }

        if (!hasNeoDBId) {
          // Case 1: No NeoDB link yet — call API to create link
          const updated = await syncToNeoDB(identity, key, mergedLinks, newStatus, newRating, comment, ctx)
          if (updated) recordForButtons = updated
        } else if (isStatusChanged) {
          // Case 2: Has NeoDB link but status changed — call API to update status
          // Rating protection: don't push Douban rating when NeoDB record already exists
          // with same status (the user may have set a different rating on NeoDB).
          const updated = await syncToNeoDB(identity, key, mergedLinks, newStatus, 0, comment, ctx)
          if (updated) recordForButtons = updated
        } else {
          // Case 3: Has NeoDB link and status unchanged — ensure linkedIds are correct
          if (existingNeoDB) {
            const neodbLinkedIds: Record<string, string> = { douban: key }
            if (mergedLinks.imdb) neodbLinkedIds.imdb = mergedLinks.imdb
            if (mergedLinks.tmdb) neodbLinkedIds.tmdb = mergedLinks.tmdb
            await Store.dbPut('neodb_records', neodbKey!, {
              ...existingNeoDB,
              linkedIds: { ...(existingNeoDB.linkedIds || {}), ...neodbLinkedIds },
            })
          }
        }
      }
    } catch (e: unknown) {
      console.warn('[UMM] NeoDB auto-sync failed:', e)
      FloatingToast.error('UMM', t('sync.neodb_auto_failed_err'))
    }
  }

  // Refresh NeoDB buttons with the final record (incl. any NeoDB link created
  // by syncToNeoDB). No extra dbGet is needed (ADR-015: drop the trailing
  // reload) — recordForButtons already reflects the persisted state.
  try {
    injectNeoDBPushButtons(identity, recordForButtons)
  } catch { /* non-critical */ }

  return recordForButtons
}

/**
 * Companion check — runs on page load for existing watched records.
 * Ensures NeoDB link/sync is present when auto-sync is enabled,
 * even if the user doesn't manually save anything.
 *
 * Local neodb_records entry is created/updated irrespective of the
 * autoSyncNeoDB setting so the cross-platform data model stays
 * consistent (the API push is the only step gated by the setting).
 */
export async function syncNeoDBOnLoad(
  identity: UrlIdentity,
  record: { status: number; rating: number } | null,
): Promise<void> {
  if (!record || record.status < 2) return

  const key = `${identity.type}::${identity.providerId}`
  try {
    const existing = await Store.dbGet('douban_records', key)
    if (!existing || existing.status < 2) return

    const mergedLinks = extractCrossPlatformLinks(identity, existing?.linkedIds)
    const hasNeoDBId = existing?.linkedIds?.neodb

    // Step 1: always reconcile the local neodb_records entry when a NeoDB
    // link exists in the douban record's linkedIds. This is independent of
    // the autoSyncNeoDB setting — the local data model should be consistent
    // even when the user chooses not to push to the NeoDB API automatically.
    if (hasNeoDBId) {
      const neodbKey = existing.linkedIds!.neodb!
      const existingNeoDB = await Store.dbGet('neodb_records', neodbKey)
      if (!existingNeoDB) {
        // Local record missing — create it from the douban record data.
        const neodbLinkedIds: Record<string, string> = { douban: key }
        if (mergedLinks.imdb) neodbLinkedIds.imdb = mergedLinks.imdb
        if (mergedLinks.tmdb) neodbLinkedIds.tmdb = mergedLinks.tmdb
        await Store.dbPut('neodb_records', neodbKey, {
          url: UrlResolverBuilder.buildNeoDBUrl(identity.type, neodbKey.split('::')[1]),
          status: existing.status,
          rating: existing.rating,
          comment: existing.comment || '',
          updatedAt: new Date().toISOString(),
          linkedIds: neodbLinkedIds,
        } as StoreRecord)
        // Refresh NeoDB buttons to show the new "Open in NeoDB" button
        injectNeoDBPushButtons(identity, existing)
      } else {
        // Ensure linkedIds are correct
        const neodbLinkedIds: Record<string, string> = { douban: key }
        if (mergedLinks.imdb) neodbLinkedIds.imdb = mergedLinks.imdb
        if (mergedLinks.tmdb) neodbLinkedIds.tmdb = mergedLinks.tmdb
        await Store.dbPut('neodb_records', neodbKey, {
          ...existingNeoDB,
          linkedIds: { ...(existingNeoDB.linkedIds || {}), ...neodbLinkedIds },
        })
      }
    }

    // Step 2: push to NeoDB API only when the user has enabled auto-sync
    // and no NeoDB link exists yet.
    const settings = await Store.getSettings()
    if (!settings.autoSyncNeoDB || !settings.neodbToken) return

    if (!hasNeoDBId) {
      // No NeoDB link yet — create it silently (no toast on page load).
      // Pre-read the linked IMDb/TMDB records so syncToNeoDB does not re-read
      // (same dedup pattern as onCrossPlatformSave).
      const [existingImdb, existingTmdb] = await Promise.all([
        mergedLinks.imdb ? Store.dbGet('imdb_records', mergedLinks.imdb) : Promise.resolve(null),
        mergedLinks.tmdb ? Store.dbGet('tmdb_records', mergedLinks.tmdb) : Promise.resolve(null),
      ])
      const ctx: NeoDBSyncCtx = {
        doubanRecord: existing,
        neodbRecord: null,
        linkedRecords: { imdb: existingImdb, tmdb: existingTmdb },
      }
      const updated = await syncToNeoDB(identity, key, mergedLinks, existing.status, existing.rating, existing.comment || '', ctx)
      // Refresh with the neodb-linked record so the "Open in NeoDB" button
      // appears immediately — syncToNeoDB updates the douban record immutably,
      // so `existing` is still the pre-push snapshot.
      injectNeoDBPushButtons(identity, updated ?? existing)
    }
  } catch (e: unknown) {
    console.warn('[UMM] NeoDB on-load sync check failed:', e)
  }
}

/** Pre-read records handed to syncToNeoDB so it does not re-fetch them. */
interface NeoDBSyncCtx {
  /** Douban record, already updated by the caller (treated as immutable). */
  doubanRecord: StoreRecord
  /** Existing NeoDB record, or null. */
  neodbRecord: StoreRecord | null
  /** Existing IMDb / TMDB linked records, or null. */
  linkedRecords: { imdb: StoreRecord | null; tmdb: StoreRecord | null }
}

/** Call NEODB_PUSH_RATING API and handle the response. */
async function syncToNeoDB(
  identity: UrlIdentity,
  doubanKey: string,
  mergedLinks: Record<string, string>,
  status: number,
  rating: number,
  comment: string,
  ctx: NeoDBSyncCtx,
): Promise<StoreRecord | null> {
  const syncResponse = await safeSendMessage({
    type: 'NEODB_PUSH_RATING',
    payload: {
      record: {
        providerId: identity.providerId,
        rating,
        status,
        // UrlIdentity.type is string-typed in the domain layer; runtime values
        // originate from Identity.fromUrl and are constrained to this union.
        type: identity.type as 'movie' | 'tv' | 'music' | 'book' | 'game',
        provider: 'douban',
        comment: comment || '',
      },
    },
  }, { timeout: 10000 })

  if (syncResponse?.success && syncResponse.catalogUuid) {
    const neodbFullKey = `${identity.type}::${syncResponse.catalogUuid}`

    // Update douban record linkedIds.neodb — immutable update (ADR-015: deduplicated reads).
    // Construct a new record object instead of mutating ctx.doubanRecord, so the
    // caller's snapshot remains untouched and the value-object pattern is respected.
    const doubanRecord = {
      ...ctx.doubanRecord,
      linkedIds: { ...(ctx.doubanRecord.linkedIds || {}), neodb: neodbFullKey },
      updatedAt: new Date().toISOString(),
    }

    // Resolve the NeoDB key: prefer the freshly-returned uuid, fall back to any
    // pre-existing key we already read.
    const neodbStoreName = 'neodb_records'
    const neodbKey = doubanRecord.linkedIds.neodb || neodbFullKey
    const existingNeoDB = ctx.neodbRecord
    const neodbLinkedIds: Record<string, string> = { douban: doubanKey }
    if (mergedLinks.imdb) neodbLinkedIds.imdb = mergedLinks.imdb
    if (mergedLinks.tmdb) neodbLinkedIds.tmdb = mergedLinks.tmdb

    // Persist douban + NeoDB records in parallel (different stores, no merge).
    // Use immutable update — construct a new object with merged linkedIds.
    const neodbWrite = existingNeoDB
      ? Store.dbPut(neodbStoreName, neodbKey, {
          ...existingNeoDB,
          linkedIds: { ...(existingNeoDB.linkedIds || {}), ...neodbLinkedIds },
        })
      : ((): Promise<void> => {
          const neodbRecord: StoreRecord = {
            url: UrlResolverBuilder.buildNeoDBUrl(identity.type, syncResponse.catalogUuid),
            status,
            rating,
            updatedAt: new Date().toISOString(),
            linkedIds: neodbLinkedIds,
          }
          return Store.dbPut(neodbStoreName, neodbKey, neodbRecord)
        })()

    // Update IMDB/TMDB records with NeoDB link — use the pre-read records.
    const linkedWriteEntries: Array<[string, string, StoreRecord | null]> = [
      ['imdb', mergedLinks.imdb, ctx.linkedRecords.imdb],
      ['tmdb', mergedLinks.tmdb, ctx.linkedRecords.tmdb],
    ]
    const linkedWrites: Array<Promise<void>> = []
    for (const [pfx, linkKey, existingTarget] of linkedWriteEntries) {
      if (!linkKey) continue
      const targetStore = `${pfx}_records`
      if (existingTarget) {
        if ((existingTarget.linkedIds?.neodb ?? '') !== neodbFullKey) {
          linkedWrites.push(Store.dbPut(targetStore, linkKey, {
            ...existingTarget,
            linkedIds: { ...(existingTarget.linkedIds || {}), neodb: neodbFullKey },
          }))
        }
      }
    }

    await Promise.all([
      Store.dbPut('douban_records', doubanKey, doubanRecord),
      neodbWrite,
      ...linkedWrites,
    ])

    FloatingToast.info('UMM', t('sync.neodb_auto_ok'))
    return doubanRecord
  } else if (syncResponse?.success) {
    FloatingToast.info('UMM', t('sync.neodb_auto_no_id'))
    return null
  } else {
    FloatingToast.error('UMM', t('sync.neodb_auto_failed'))
    return null
  }
}