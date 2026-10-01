/**
 * Unified early overlay factory for Douban pages.
 *
 * Determines the correct overlayId and subtitle based on URL,
 * then creates the shadow DOM overlay with loading spinner.
 *
 * Usage:
 *   import { createDoubanEarlyOverlay } from '@/scenario/douban/early'
 *   createDoubanEarlyOverlay()
 */

import { createOverlay } from './overlay';
import type { OverlayOptions } from './overlay';
import { detectPageType } from './shared/url-detector';
import { initI18n, initI18nSync, t } from '@/entrypoints/content/i18n';

/**
 * Early-shell subtitles → i18n keys (not hardcoded copy).
 *
 * X60/X62 converted the whole overlay body to `t()` but missed this spot: 31
 * hardcoded zh-CN lines kept the loading shell Chinese for English users,
 * asymmetric with the body. `trailer`/`video` share one key.
 */
const SUBTITLE_KEY: Record<string, string> = {
  photos: 'douban.loading.photos',
  trailer: 'douban.loading.trailer',
  video: 'douban.loading.trailer',
  celebrities: 'douban.loading.celebrities',
  albums: 'douban.loading.albums',
  detail: 'douban.loading.detail',
  'book-homepage': 'douban.loading.book-homepage',
  'book-profile': 'douban.loading.book-profile',
  search: 'douban.loading.search',
  personage: 'douban.loading.personage',
  'personage-creations': 'douban.loading.personage-creations',
  'user-profile': 'douban.loading.user-profile',
  'movie-profile': 'douban.loading.movie-profile',
  'music-profile': 'douban.loading.music-profile',
  'user-celebrities': 'douban.loading.user-celebrities',
  'user-reviews': 'douban.loading.user-reviews',
  'review-detail': 'douban.loading.review-detail',
  'book-review-detail': 'douban.loading.book-review-detail',
  'book-collect': 'douban.loading.book-collect',
  'book-authors': 'douban.loading.book-authors',
  doulists: 'douban.loading.doulists',
  'doulist-detail': 'douban.loading.doulist-detail',
  'user-media': 'douban.loading.user-media',
  'music-homepage': 'douban.loading.music-homepage',
  genre: 'douban.loading.genre',
  'artists-overview': 'douban.loading.artists-overview',
  'game-collect': 'douban.loading.game-collect',
  'game-detail': 'douban.loading.game-detail',
  'game-explore': 'douban.loading.game-explore',
  series: 'douban.loading.series',
  'music-collect': 'douban.loading.music-collect',
};

const DEFAULT_SUBTITLE_KEY = 'douban.loading.default';

function getOverlayConfig(): { options: OverlayOptions; subtitleKey: string } | null {
  const pageType = detectPageType();
  if (!pageType) return null;

  const trailerTypes = new Set(['trailer', 'video']);
  const overlayId =
    pageType.type === 'photos'
      ? 'umm-photos-overlay'
      : trailerTypes.has(pageType.type)
        ? 'umm-trailer-overlay'
        : pageType.type === 'celebrities'
          ? 'umm-celebrities-overlay'
          : pageType.type === 'detail'
            ? 'umm-detail-mask'
            : pageType.type === 'search'
              ? 'umm-search-overlay'
              : pageType.type === 'personage'
                ? 'umm-personage-overlay'
                : pageType.type === 'personage-creations'
                  ? 'umm-personage-overlay'
                  : pageType.type === 'doulist-detail'
                    ? 'umm-douban-overlay'
                    : 'umm-douban-overlay';

  const subtitleKey = SUBTITLE_KEY[pageType.type] ?? DEFAULT_SUBTITLE_KEY;
  return {
    options: { overlayId, subtitle: t(subtitleKey) },
    subtitleKey,
  };
}

/**
 * Async-upgrade the shell subtitle to the authoritative stored language (the
 * Options-saved language wins over the browser language). Touches a single
 * text node: if the shell was already taken over or removed by the
 * document_idle Vue app, the node is gone — bail out silently. The upgrade is
 * a correction and must never drag down the already-painted first frame.
 */
async function upgradeShellSubtitle(overlay: HTMLElement, subtitleKey: string): Promise<void> {
  try {
    await initI18n();
    const node = overlay.shadowRoot?.querySelector('.ov-subtitle');
    if (node && overlay.isConnected) node.textContent = t(subtitleKey);
  } catch {
    // Storage unavailable → keep the synchronously resolved copy
  }
}

/**
 * Create early shadow DOM overlay for the current Douban page.
 * Must be called at document_start.
 * Returns null if the page type does not need an overlay.
 */
export function createDoubanEarlyOverlay(): HTMLElement | null {
  // Synchronous locale: `t()` reads module-level currentLocale (default
  // zh-CN). The early shell must not defer mounting the mask waiting on
  // chrome.storage (async IPC), so it only trusts synchronously available
  // localStorage → navigator.language — same first-frame cost as before
  // (zero await).
  initI18nSync();
  const config = getOverlayConfig();
  if (!config) return null;
  const overlay = createOverlay(config.options);
  void upgradeShellSubtitle(overlay, config.subtitleKey);
  return overlay;
}
