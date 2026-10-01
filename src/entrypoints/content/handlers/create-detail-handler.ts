/**
 * Detail page handler factory.
 *
 * Extracts the common detail page flow (waitForElement -> scan -> dbGet -> merge -> render -> dbPut)
 * into a reusable factory. Four consumers: imdb, tmdb, neodb, bangumi.
 *
 * The returned handler also watches this record key for external writes and
 * hands back a teardown for the router to run on route change.
 *
 * The factory does NOT add its own try/catch — callers that need error isolation
 * (e.g. TMDB's waitForElement timeout guard) wrap the result themselves.
 */

import type { UrlIdentity, StoreRecord } from '@/types';
import { Store } from '@/engine/database';
import { Utils } from '@/libraries/utils';
import { warnLog } from '@/libraries/utils/logger';
import { watchRecord } from '@/libraries/utils/watch-record';
import { waitForElement } from '../utils/dom';
import { FloatingToast } from '../utils/toast';
import { t } from '../i18n';

// ---- Types ----

export interface PageScanResult {
  status: string; // 'done' | 'none' | 'wish' | 'doing'
  rating: number; // 0-10
}

export interface DetailPageHandlerSaveParams {
  identity: UrlIdentity;
  pageState: PageScanResult;
  localRecord: StoreRecord | null;
  storeName: string;
  key: string;
  isPageDone: boolean;
}

export interface DetailPageHandlerConfig {
  /** Platform identifier (e.g. 'imdb', 'tmdb', 'neodb'). */
  platform: string;
  /** CSS selector for the title element to wait for before scanning. */
  titleSelector: string;
  /** Scan the page for status/rating. Receives identity so neodb can use identity.type. */
  scanFn: (identity: UrlIdentity) => PageScanResult | Promise<PageScanResult>;
  /**
   * Optional identity resolution hook, invoked AFTER scanFn and BEFORE the dbGet
   * (so the store key `${type}::${providerId}` uses the resolved type).
   * Used by Bangumi where the media type is only detectable from the page DOM
   * (Identity.fromUrl defaults to 'tv'). May return the same identity.
   */
  resolveIdentity?: (
    identity: UrlIdentity,
    pageState: PageScanResult,
  ) => UrlIdentity | Promise<UrlIdentity>;
  /** Render the status chip onto the page. */
  renderFn: (identity: UrlIdentity, status: number, rating: number, note: string) => Promise<void>;
  /** i18n key for the save toast. When omitted the base save is skipped (use onSave instead). */
  savedMessageKey?: string;
  /**
   * Custom status merge logic.
   * Default: isPageDone || localRecord?.status === 2 ? 2 : 0
   * TMDB uses a richer merge that preserves doing (3) and wish (1).
   */
  mergeStatusFn?: (pageState: PageScanResult, localRecord: StoreRecord | null) => number;
  /**
   * Post-save hook. Called after the base save (if any) and after render.
   * Used by neodb for linkedIds extraction, cross-platform sync, and conditional saves.
   */
  onSave?: (params: DetailPageHandlerSaveParams) => Promise<void>;
  /**
   * Test seam for the record-event subscription. Defaults to the real bus
   * (`libraries/utils/watch-record`), which latches its chrome listener once per
   * worker — a spec that drives events must inject its own bus rather than depend
   * on which file registered first (that ordering is what makes merged runs differ
   * from single-file runs).
   */
  watchRecord?: (storeName: string, key: string, onChange: () => void) => () => void;
}

// ---- Factory ----

export function createDetailPageHandler(config: DetailPageHandlerConfig) {
  return async function handleDetailPage(identity: UrlIdentity): Promise<(() => void) | void> {
    if (!identity) return;

    // Wait for the title element to appear; on timeout (selector mismatch /
    // slow page) log a warning and skip injection gracefully instead of
    // bubbling the rejection to the router (which only logs, leaving the
    // whole detail page silently unhandled).
    try {
      await waitForElement(config.titleSelector, 5000);
    } catch (error: unknown) {
      console.warn(
        '[UMM] ⚠️ Detail handler: title element not found within 5s, skipping injection:',
        config.titleSelector,
        error,
      );
      return;
    }

    // Scan page state (status + rating)
    const pageState = await config.scanFn(identity);

    // Optional identity resolution (e.g. Bangumi infobox media-type inference)
    const resolvedIdentity = config.resolveIdentity
      ? await config.resolveIdentity(identity, pageState)
      : identity;

    // Fetch local record from IndexedDB
    const storeName = `${resolvedIdentity.platform}_records`;
    const key = `${resolvedIdentity.type}::${resolvedIdentity.providerId}`;
    const localRecord = await Store.dbGet(storeName, key);

    /**
     * One merge definition on purpose: the external-write refresh below has to
     * reach the SAME verdict as the first paint, and a second copy drifts (the
     * symptom would be a chip flipping back on the next write).
     */
    const mergeVerdict = (page: PageScanResult, record: StoreRecord | null) => {
      const isPageDone = page.status === 'done';
      const isLocalDone = record?.status === 2;
      const status = config.mergeStatusFn
        ? config.mergeStatusFn(page, record)
        : isPageDone || isLocalDone
          ? 2
          : 0;
      return {
        status,
        // Page rating wins over the stored one.
        rating: Utils.clampRating10(isPageDone ? page.rating : record?.rating || 0),
        // A local "done" the page itself does not show deserves an explanation.
        note: isLocalDone && !isPageDone ? t('common.cache_hint') : '',
      };
    };

    const isPageDone = pageState.status === 'done';
    const initial = mergeVerdict(pageState, localRecord ?? null);

    // Render the status chip
    await config.renderFn(resolvedIdentity, initial.status, initial.rating, initial.note);

    // Base save: only when page shows done and a message key is configured
    if (isPageDone && config.savedMessageKey) {
      const statusChanged = localRecord?.status !== 2;
      const ratingChanged = localRecord?.rating !== pageState.rating;

      if (statusChanged || ratingChanged || !localRecord) {
        await Store.dbPut(storeName, key, {
          url: resolvedIdentity.url,
          status: 2,
          rating: pageState.rating,
          comment: localRecord?.comment ?? '',
          updatedAt: new Date().toISOString(),
          linkedIds: localRecord?.linkedIds ?? {},
        });

        FloatingToast.success('UMM', t(config.savedMessageKey));
      }
    }

    // Post-save hook (e.g. neodb's cross-platform sync)
    if (config.onSave) {
      await config.onSave({
        identity: resolvedIdentity,
        pageState,
        localRecord,
        storeName,
        key,
        isPageDone,
      });
    }

    // An external write (popup, another tab, NeoDB/WebDAV sync) mutates no host
    // DOM, so the platform's own state observer never fires and the chip would
    // stay stale until reload. Re-derive from the same two inputs on the events
    // that concern this key only.
    let disposed = false;
    const refresh = async (): Promise<void> => {
      const page = await config.scanFn(resolvedIdentity);
      const record = await Store.dbGet(storeName, key);
      // The answer lands late; a route the user already left must not be painted.
      if (disposed) return;
      const next = mergeVerdict(page, record ?? null);
      await config.renderFn(resolvedIdentity, next.status, next.rating, next.note);
    };

    const releaseRecordWatch = (config.watchRecord ?? watchRecord)(storeName, key, () => {
      // A failed refresh must not vanish: the chip keeps the previous verdict,
      // which is indistinguishable from "no external write happened".
      void refresh().catch((error: unknown) => {
        warnLog('Detail chip refresh failed:', error);
      });
    }); // MUT-close

    return (): void => {
      disposed = true;
      releaseRecordWatch();
    };
  };
}
