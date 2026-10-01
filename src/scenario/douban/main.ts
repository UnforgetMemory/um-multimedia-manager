/**
 * Unified main entry factory for Douban pages.
 *
 * Routes to the correct page mount function based on URL via a
 * MountRegistry — replacing the hardcoded switch statement that
 * previously dispatched across 19 cases. Page mounts are declared
 * once in a single PAGE_MOUNTS map and registered in a loop.
 *
 * Page mount functions are created by `definePageMount()`, which
 * encapsulates the common bootstrap pattern:
 *   1. Compose page-specific CSS from presets
 *   2. Dynamic-import the root Vue component
 *   3. Call `mountUmmOverlay` with lifecycle hooks
 *
 * Usage:
 *   import { mountDoubanMain } from '@/scenario/douban/main'
 *   mountDoubanMain()
 */

import { MountRegistry } from './page-registry';
import { detectPageType } from './shared/url-detector';
import { injectGlobalStyles } from '@/entrypoints/content/styles/global';
import { initI18n, startLocaleSync, subscribeLocale } from '@/entrypoints/content/i18n';
import { startThemeAttrSync } from './overlay/theme-sync';
import { initEventBus } from '@/libraries/utils/event-bus';
import { FloatingToast } from '@/entrypoints/content/utils/toast';

import { mountMusicHomepage } from './pages/music-homepage/config';
import { mountGenre } from './pages/genre/config';
import { mountArtistsOverview } from './pages/artists-overview/config';
import { mountHomepage } from './pages/homepage/config';
import { mountSearch } from './pages/search/config';
import { mountAlbums } from './pages/albums/config';
import { mountBookHomepage } from './pages/book-homepage/config';
import { mountBookProfile } from './pages/book-profile/config';
import { mountDetail } from './pages/detail/config';
import { mountPhotos } from './pages/photos/config';
import { mountTrailer } from './pages/trailer/config';
import { mountCelebrities } from './pages/celebrities/config';
import { mountPersonage } from './pages/personage/config';
import { mountPersonageCreations } from './pages/personage-creations/config';
import { mountUserProfile } from './pages/user-profile/config';
import { mountMovieProfile } from './pages/movie-profile/config';
import { mountMusicProfile } from './pages/music-profile/config';
import { mountDoulists } from './pages/doulists/config';
import { mountDoulistDetail } from './pages/doulist-detail/config';
import { mountUserMedia } from './pages/user-media/config';
import { mountUserCelebrities } from './pages/user-celebrities/config';
import { mountUserReviews } from './pages/user-reviews/config';
import { mountBookReviews } from './pages/book-reviews/config';
import { mountReviewDetail } from './pages/review-detail/config';
import { mountBookReviewDetail } from './pages/book-review-detail/config';
import { mountBookCollect } from './pages/book-collect/config';
import { mountBookAuthors } from './pages/book-authors/config';
import { mountGameCollect } from './pages/game-collect/config';
import { mountGameDetail } from './pages/game-detail/config';
import { mountGameExplore } from './pages/game-explore/config';
import { mountSeries } from './pages/series/config';
import { mountMusicCollect } from './pages/music-collect/config';

const PAGE_MOUNTS = {
  'music-homepage': mountMusicHomepage,
  genre: mountGenre,
  'artists-overview': mountArtistsOverview,
  homepage: mountHomepage,
  search: mountSearch,
  albums: mountAlbums,
  'book-homepage': mountBookHomepage,
  'book-profile': mountBookProfile,
  detail: mountDetail,
  photos: mountPhotos,
  trailer: mountTrailer,
  celebrities: mountCelebrities,
  personage: mountPersonage,
  'personage-creations': mountPersonageCreations,
  'user-profile': mountUserProfile,
  'movie-profile': mountMovieProfile,
  'music-profile': mountMusicProfile,
  doulists: mountDoulists,
  'doulist-detail': mountDoulistDetail,
  'user-media': mountUserMedia,
  'user-celebrities': mountUserCelebrities,
  'user-reviews': mountUserReviews,
  'book-reviews': mountBookReviews,
  'review-detail': mountReviewDetail,
  'book-review-detail': mountBookReviewDetail,
  'book-collect': mountBookCollect,
  'game-collect': mountGameCollect,
  'game-detail': mountGameDetail,
  'game-explore': mountGameExplore,
  series: mountSeries,
  'music-collect': mountMusicCollect,
  'book-authors': mountBookAuthors,
} as const satisfies Record<string, () => Promise<void>>;

const registry = new MountRegistry();

for (const [pageKey, mountFn] of Object.entries(PAGE_MOUNTS)) {
  registry.register(pageKey, mountFn);
}

// ---- Public API ----

/**
 * Mount the appropriate Vue app for the current Douban page.
 * Call from document_idle content script.
 */
export async function mountDoubanMain(): Promise<void> {
  try {
    // i18n: `t()` reads module-level `currentLocale` (default zh-CN) and stays
    // Simplified forever without initI18n. The overlay consumes `t()` everywhere
    // (via shared/legacy-bridge) but never initialized it — under an English
    // setting the whole page kept rendering Chinese, and an Options language
    // change never backfilled already-open tabs. Same call pair as the legacy
    // pipeline (entrypoints/content.ts); the entry already awaits this function,
    // so the extra async delays nothing (document_idle — douban-early painted
    // the shell's first frame long ago).
    await initI18n();
    startLocaleSync();
    // Global infrastructure (was previously in content.ts)
    injectGlobalStyles();
    // Keep html[data-umm-theme] live for ALL light-DOM dark rules
    // (search badges / status chips / NeoDB buttons) — overlay or not.
    startThemeAttrSync();
    initEventBus();
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (sender.id !== chrome.runtime.id) return false;
      if (message.type === 'SHOW_TOAST') {
        const { type, title, message: msg } = message.payload;
        if (type === 'success') FloatingToast.success(title, msg);
        else if (type === 'error') FloatingToast.error(title, msg);
        else if (type === 'loading') FloatingToast.loading(title, msg);
        else FloatingToast.info(title, msg);
        sendResponse({ success: true });
        return true;
      }
    });

    const pageType = detectPageType();
    if (!pageType) throw new Error('Unknown Douban page type');

    // video shares the trailer mount function
    const pageKey = pageType.type === 'video' ? 'trailer' : pageType.type;
    const mountFn = registry.getMountFn(pageKey);
    if (!mountFn) return;
    await mountFn();
    // Locale backfill. `t()` reads a module-level variable, not a reactive
    // source, so a mounted Vue tree never re-renders when currentLocale changes
    // — X106 measured in a real browser "storage language changed, island
    // labels stayed stale". `startLocaleSync()` alone only swapped a variable
    // nobody read. Backfill rides the existing safe channel: re-run this
    // method's `mountFn()`; mountUmmOverlay first releaseLiveMount (unmount +
    // detach container) then mounts the fresh tree — the same path as "retry
    // after mount failure". Single-flight guard against double clicks.
    let remounting = false;
    subscribeLocale(() => {
      if (remounting) return;
      remounting = true;
      Promise.resolve(mountFn()).finally(() => {
        remounting = false;
      });
    });
  } catch (err: unknown) {
    console.warn('[UMM] mountDoubanMain error:', err);
  }
}
