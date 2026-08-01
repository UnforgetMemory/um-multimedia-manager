/**
 * Detail page handler factory.
 *
 * Extracts the common detail page flow (waitForElement -> scan -> dbGet -> merge -> render -> dbPut)
 * into a reusable factory. Three consumers: imdb, tmdb, neodb.
 *
 * The factory does NOT add its own try/catch — callers that need error isolation
 * (e.g. TMDB's waitForElement timeout guard) wrap the result themselves.
 */

import type { UrlIdentity, StoreRecord } from '@/types'
import { Store } from '@/features/database'
import { Utils } from '@/utils'
import { waitForElement } from '../utils/dom'
import { FloatingToast } from '../utils/toast'
import { t } from '../i18n'

// ---- Types ----

export interface PageScanResult {
  status: string  // 'done' | 'none'
  rating: number  // 0-10
}

export interface DetailPageHandlerSaveParams {
  identity: UrlIdentity
  pageState: PageScanResult
  localRecord: StoreRecord | null
  storeName: string
  key: string
  isPageDone: boolean
}

export interface DetailPageHandlerConfig {
  /** Platform identifier (e.g. 'imdb', 'tmdb', 'neodb'). */
  platform: string
  /** CSS selector for the title element to wait for before scanning. */
  titleSelector: string
  /** Scan the page for status/rating. Receives identity so neodb can use identity.type. */
  scanFn: (identity: UrlIdentity) => PageScanResult | Promise<PageScanResult>
  /** Render the status chip onto the page. */
  renderFn: (identity: UrlIdentity, status: number, rating: number, note: string) => Promise<void>
  /** i18n key for the save toast. When omitted the base save is skipped (use onSave instead). */
  savedMessageKey?: string
  /**
   * Custom status merge logic.
   * Default: isPageDone || localRecord?.status === 2 ? 2 : 0
   * TMDB uses a richer merge that preserves doing (3) and wish (1).
   */
  mergeStatusFn?: (pageState: PageScanResult, localRecord: StoreRecord | null) => number
  /**
   * Post-save hook. Called after the base save (if any) and after render.
   * Used by neodb for linkedIds extraction, cross-platform sync, and conditional saves.
   */
  onSave?: (params: DetailPageHandlerSaveParams) => Promise<void>
}

// ---- Factory ----

export function createDetailPageHandler(config: DetailPageHandlerConfig) {
  return async function handleDetailPage(identity: UrlIdentity): Promise<void> {
    if (!identity) return

    // Wait for the title element to appear
    await waitForElement(config.titleSelector, 5000)

    // Scan page state (status + rating)
    const pageState = await config.scanFn(identity)

    // Fetch local record from IndexedDB
    const storeName = `${identity.platform}_records`
    const key = `${identity.type}::${identity.providerId}`
    const localRecord = await Store.dbGet(storeName, key)

    const isLocalDone = localRecord?.status === 2
    const isPageDone = pageState.status === 'done'

    // Merge status: page state takes priority, then local DB
    const finalStatus = config.mergeStatusFn
      ? config.mergeStatusFn(pageState, localRecord)
      : (isPageDone || isLocalDone ? 2 : 0)

    // Merge rating: page rating takes priority
    const finalRating = Utils.clampRating10(
      isPageDone ? pageState.rating : localRecord?.rating || 0
    )

    // Show cache hint when local says done but page doesn't
    const note = isLocalDone && !isPageDone ? t('common.cache_hint') : ''

    // Render the status chip
    await config.renderFn(identity, finalStatus, finalRating, note)

    // Base save: only when page shows done and a message key is configured
    if (isPageDone && config.savedMessageKey) {
      const statusChanged = localRecord?.status !== 2
      const ratingChanged = localRecord?.rating !== pageState.rating

      if (statusChanged || ratingChanged || !localRecord) {
        await Store.dbPut(storeName, key, {
          url: identity.url,
          status: 2,
          rating: pageState.rating,
          comment: localRecord?.comment ?? '',
          updatedAt: new Date().toISOString(),
          linkedIds: localRecord?.linkedIds ?? {},
        })

        FloatingToast.success('UMM', t(config.savedMessageKey))
      }
    }

    // Post-save hook (e.g. neodb's cross-platform sync)
    if (config.onSave) {
      await config.onSave({
        identity,
        pageState,
        localRecord,
        storeName,
        key,
        isPageDone,
      })
    }
  }
}
