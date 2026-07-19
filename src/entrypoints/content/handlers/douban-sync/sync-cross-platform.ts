/**
 * Cross-platform record creation and linking for Douban sync.
 *
 * Handles creating/updating IMDb and TMDB records when a Douban record
 * is saved, plus a fire-and-forget health check that verifies every
 * linked platform record exists with the correct status.
 */

import { Store } from '@/features/database'
import type { UrlIdentity, StoreRecord } from '@/types'
import { Identity } from '@/shared/identity'
import { showNotification } from '../douban-toast'
import { t } from '../../i18n'

/** A linked platform entry extracted from mergedLinkedIds */
export interface CrossPlatformEntry {
  provider: string
  type: string
  providerId: string
}

function parseLinkedKey(
  linkedKey: string,
  fallbackType: string,
): { type: string; providerId: string } {
  if (linkedKey.includes('::')) {
    const [t, id] = linkedKey.split('::')
    return { type: t, providerId: id }
  }
  return { type: fallbackType, providerId: linkedKey }
}

/**
 * Create or update IMDb/TMDB records linked from a Douban record.
 *
 * Skips records that are already at status=2 (done) or when the source
 * status is lower than an existing target — never downgrades a fully
 * watched entry.
 *
 * Returns the list of CrossPlatformEntry objects so callers can pass
 * them to NeoDB sync for back-linking.
 */
export async function syncCrossPlatformRecords(
  identity: UrlIdentity,
  numericStatus: number,
  pageRating: number,
  pageComment: string,
  mergedLinkedIds: Record<string, string>,
): Promise<CrossPlatformEntry[]> {
  const now = new Date().toISOString()
  const crossPlatformEntries: CrossPlatformEntry[] = []

  if (mergedLinkedIds.imdb) {
    const parsed = parseLinkedKey(mergedLinkedIds.imdb, identity.type)
    crossPlatformEntries.push({
      provider: 'imdb',
      type: parsed.type,
      providerId: parsed.providerId,
    })
  }
  if (mergedLinkedIds.tmdb) {
    const parsed = parseLinkedKey(mergedLinkedIds.tmdb, identity.type)
    crossPlatformEntries.push({
      provider: 'tmdb',
      type: parsed.type,
      providerId: parsed.providerId,
    })
  }

  for (const entry of crossPlatformEntries) {
    const targetStore = `${entry.provider}_records`
    const targetKey = `${entry.type}::${entry.providerId}`
    const existingTarget = await Store.dbGet(targetStore, targetKey)

    // Skip when target is already done (2), or source is non-done and
    // target status >= source status — never downgrade.
    if (
      existingTarget &&
      (existingTarget.status === 2 ||
        (numericStatus !== 2 && existingTarget.status >= numericStatus))
    ) {
      console.log(
        `[UMM Douban] ⏭️ ${entry.provider} record already synced at status ${existingTarget.status}:`,
        targetKey,
      )
      continue
    }

    const targetRecord: StoreRecord = {
      url: Identity.buildUrl(entry.type, entry.provider, entry.providerId),
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
    console.log(
      `[UMM Douban] ✅ ${action} ${entry.provider} record:`,
      targetKey,
      'status:',
      numericStatus,
    )
    showNotification(
      t('sync.to_platform', { platform: platformLabel, id: entry.providerId }),
    )
  }

  return crossPlatformEntries
}

/**
 * Fire-and-forget health check that verifies every linked platform record
 * (IMDb, TMDB, NeoDB) exists and has the correct status.
 *
 * Creates missing records and upgrades lower-status entries following the
 * never-downgrade-done rule.  Runs after the main sync flow so it never
 * blocks the user-facing save.
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

  for (const [platform, linkKey] of Object.entries({
    imdb: mergedLinkedIds.imdb,
    tmdb: mergedLinkedIds.tmdb,
    neodb: mergedLinkedIds.neodb,
  })) {
    if (!linkKey) continue

    const targetStore = `${platform}_records`
    const existingTarget = await Store.dbGet(targetStore, linkKey)
    const [, pid] = linkKey.split('::')

    // Build target URL
    let targetUrl: string
    if (platform === 'neodb')
      targetUrl = Identity.buildNeoDBUrl(identity.type, pid)
    else
      targetUrl = Identity.buildUrl(identity.type, platform, pid)
    if (!targetUrl) continue

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
      console.log(
        `[UMM Douban] Health check: created ${platform} record:`,
        linkKey,
      )
    } else if (
      existingTarget.status !== 2 &&
      existingTarget.status < sourceStatus
    ) {
      // Exists with lower status — upgrade (never downgrade done=2)
      existingTarget.status = sourceStatus
      existingTarget.rating = pageRating || existingTarget.rating
      existingTarget.comment = pageComment || existingTarget.comment
      existingTarget.updatedAt = now
      existingTarget.linkedIds = {
        ...(existingTarget.linkedIds || {}),
        [identity.provider]: doubanFullKey,
      }
      await Store.dbPut(targetStore, linkKey, existingTarget)
      console.log(
        `[UMM Douban] Health check: updated ${platform} status:`,
        linkKey,
        '→',
        sourceStatus,
      )
    }
    // If exists and already done (2) or same status — skip
  }
}
