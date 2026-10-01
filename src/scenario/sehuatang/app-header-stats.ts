/**
 * Sehuatang overlay header stats + empty-state refresh (split out of ./app on
 * 2026-09-28 for the size gate).
 *
 * Holds the two page-level states read by the header's two boxes:
 *   - `hiddenAtMount`: watched count hidden (not rendered) by the initial pass
 *     (including every AJAX page) — the source of the "hidden this page" stat;
 *     runtime marks never hide, so they never touch it;
 *   - `emptyShellRef`: the empty-state mount point (shell ref); the
 *     "everything watched" empty state mounts/unmounts on demand at refresh.
 *
 * `updateHeaderInfo` is the confluence of three state-change sources (initial
 * mount / AJAX pagination / menu toggle + runtime marks) and the only refresh
 * point for empty-state mounting; it runs synchronously outside the throttled
 * stats refresh (120ms trailing).
 */

import { t } from '@/entrypoints/content/i18n';
import { throttle } from '@/libraries/utils';
import { warnLog } from '@/libraries/utils/logger';
import { countSehuatangCardStates } from '@/entrypoints/content/handlers/sehuatang-controls';
import { reportStatsUnreachable } from './app-notify';
import { declarePermanentTrailingWriter } from './app-trailing-writers';
import { syncEmptyHiddenState } from './empty-state';
import { getCachedGlobalStats, loadGlobalStats, STATS_UNKNOWN } from './background-reads';

// Watched count hidden (not rendered) by the initial pass — source of the
// "hidden this page" stat; runtime marks never hide.
let hiddenAtMount = 0;
// Empty-state mount point (shell ref): the "everything watched" empty state
// mounts/unmounts on demand at every updateHeaderInfo refresh.
let emptyShellRef: HTMLElement | null = null;

/** Called once per mount: reset page-level stats state (hidden count and the
 *  empty-state mount point never survive across pages). */
export function resetHeaderStatsPage(): void {
  hiddenAtMount = 0;
  emptyShellRef = null;
}

/** Register the empty-state mount point: every updateHeaderInfo refresh from
 *  now on mounts/unmounts the empty state on demand. */
export function registerEmptyShell(shell: HTMLElement | null): void {
  emptyShellRef = shell;
}

/** Hidden count from the initial partition (first pass with hide ON). */
export function setHiddenAtMount(count: number): void {
  hiddenAtMount = count;
}

/** Accumulate the hidden count from AJAX pagination (same stat source and same
 *  accounting as the initial value). */
export function addHiddenAtMount(count: number): void {
  hiddenAtMount += count;
}

/** Stats refresh (throttled, 120ms trailing, merges high-frequency triggers;
 *  historical numbers come from the cache).
 *  120ms is the compromise between "the page-watched number follows a click-dim
 *  almost imperceptibly" and "merging burst triggers" (the old 250ms showed
 *  visible lag under consecutive copies/pagination). */
const throttledRefreshStats = throttle((headerEl: HTMLElement, grid: HTMLElement) => {
  refreshHeaderStats(headerEl, grid);
}, 120);

declarePermanentTrailingWriter(throttledRefreshStats);

function refreshHeaderStats(headerEl: HTMLElement, grid: HTMLElement) {
  const infoEl = headerEl.querySelector('.umm-header-info') as HTMLElement | null;
  if (!infoEl) return;
  const statsEl = headerEl.querySelector('.umm-sht-stats') as HTMLElement | null;
  const { watched } = countSehuatangCardStates(grid);
  const render = () => {
    // The two boxes are written separately: page state (watched/hidden) and
    // the global three segments (JP / US / thread posts).
    const stats = getCachedGlobalStats();
    infoEl.textContent = t('sht.page_box', {
      watched: String(watched),
      hidden: String(hiddenAtMount),
    });
    if (statsEl) {
      // No answer renders as a dash: a fake 0/0/0 would read as "watched
      // nothing at all".
      statsEl.textContent = t('sht.global_stats', {
        jp: String(stats?.jp ?? STATS_UNKNOWN),
        us: String(stats?.us ?? STATS_UNKNOWN),
        tid: String(stats?.tid ?? STATS_UNKNOWN),
      });
    }
  };
  render();
  // A cached answer costs zero messages; a previously failed read never wrote
  // the cache, so this pass restarts the retry ladder instead of leaving a
  // degraded result on the page forever.
  void loadGlobalStats().then((res) => {
    if (res.ok) {
      render();
      return;
    }
    const error = res.error ?? 'unread';
    warnLog('[UMM] Sehuatang global stats read failed, placeholder kept:', error);
    // One failed read exhausting the whole ladder = the background is truly
    // unreachable; say it once (once per page — repeats are noise), the dash
    // itself stays visible on the page.
    reportStatsUnreachable(error);
  });
}

/** Header stats + copy-all button state (lazy-loading era: the button no
 *  longer waits for all details to arrive — clickable as soon as an unviewed
 *  card exists; clicking concurrently refetches unloaded items). */
export function updateHeaderInfo(headerEl: HTMLElement, grid: HTMLElement) {
  // "Everything watched" empty-state sync: the three state-change sources all
  // funnel into this function, which is the single refresh point for empty-
  // state mounting (synchronous, outside the throttled stats — the empty
  // state must not lag).
  syncEmptyHiddenState(emptyShellRef, grid, hiddenAtMount);
  throttledRefreshStats(headerEl, grid);
  const btnEl = headerEl.querySelector('.umm-copy-btn') as HTMLButtonElement | null;
  if (btnEl && !btnEl.hasAttribute('data-umm-copying')) {
    const unviewed = grid.querySelectorAll('.umm-card:not(.umm-viewed)').length;
    btnEl.disabled = unviewed === 0;
    btnEl.textContent = `⚡ ${t('Copy All Magnets')} (${unviewed})`;
  }
}
