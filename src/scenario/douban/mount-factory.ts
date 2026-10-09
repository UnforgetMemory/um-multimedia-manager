/**
 * Factory for creating type-safe Douban page mount functions.
 *
 * Eliminates the boilerplate of 19 nearly-identical mount*() functions
 * in main.ts by encapsulating the common pattern:
 *   1. Compose page-specific CSS via `composeStylesForPage`
 *   2. Dynamic-import the root Vue component
 *   3. Call `mountUmmOverlay` with configurable lifecycle hooks
 *
 * @example
 * ```ts
 * const mountGenre = definePageMount({
 *   cssPreset: 'genre',
 *   overlayId: 'umm-douban-overlay',
 *   importApp: () => import('./pages/genre/App.vue'),
 *   async beforeMount() {
 *     const { extractGenrePage } = await import('./pages/genre/genre-extract')
 *     const data = extractGenrePage()
 *     if (!data) throw new Error('[UMM] Could not extract genre page data')
 *     hideNavForPage({ type: 'genre' })
 *     return data
 *   },
 *   createApp: (RootCmp, data) => createApp(RootCmp, { data }),
 * })
 * ```
 */

import type { Component, App } from 'vue';
import type { PageType } from './shared/url-detector';
import { mountUmmOverlay } from './overlay';
import {
  createOverlay,
  getOverlayShellOptions,
  removeOverlayShell,
  showMountFailure,
} from './overlay';
import { composeStylesForPage } from './css-composer';
import { cssMap } from './css-map';
import { sanitizePageData } from '@/libraries/utils/safe-url';
import { runPageMount } from './mount-plan';

/**
 * Configuration for defining a Douban page mount function.
 *
 * @template T - Type of page data extracted in `beforeMount` and forwarded to
 *   `createApp` / `afterMount`. Use `undefined` (default) for pages without
 *   data extraction, such as homepages.
 */
export interface PageMountConfig<T = undefined> {
  /**
   * Page type name used to look up the CSS preset in `composeStylesForPage`.
   * Must match a key in `PAGE_CSS_PRESETS` inside css-composer.ts
   * (e.g. `'detail'`, `'search'`, `'homepage'`).
   */
  cssPreset: PageType['type'];

  /**
   * The `id` attribute of the shadow DOM overlay element, created by
   * `createOverlay()` in overlay.ts at document_start.
   */
  overlayId: string;

  /**
   * Dynamic import of the root Vue component for this page.
   * Must return `{ default: Component }`.
   *
   * Example: `() => import('./pages/detail/App.vue')`
   */
  importApp: () => Promise<{ default: Component }>;

  /**
   * Optional async setup that runs inside the overlay's Shadow DOM before
   * the Vue app mounts.
   *
   * Use this to:
   * - Extract page data from the DOM
   * - Load record maps from IndexedDB
   * - Call `hideNavForPage()` to suppress native navigation
   * - Retry DOM extraction with backoff
   *
   * The second argument registers an undo for any host-DOM mutation made
   * here; it runs automatically if the mount later fails. The resolved
   * value is deep-sanitized (dangerous URL schemes neutralized) before
   * being forwarded to `createApp` / `afterMount` as the `data` argument.
   */
  beforeMount?: (shadow: ShadowRoot, registerRollback: (fn: () => void) => void) => Promise<T>;

  /**
   * Create the Vue app instance.
   *
   * @param RootCmp - The root component (from the `importApp` dynamic import).
   * @param data - The value returned by `beforeMount`, or `undefined` if
   *   `beforeMount` is not configured.
   */
  createApp: (RootCmp: Component, data: T) => App;

  /**
   * Optional post-mount hook for side effects such as polling for record
   * updates or registering global cleanup handlers.
   */
  afterMount?: (
    shadow: ShadowRoot,
    app: App,
    container: HTMLDivElement,
    data: T,
  ) => void | Promise<void>;
}

/**
 * Create a mount function for a Douban page type.
 *
 * The returned async function handles the full bootstrap sequence:
 * 1. Compose CSS chunks into a single injectable string
 * 2. Dynamic-import the page's root Vue component
 * 3. Delegate to `mountUmmOverlay` with the configured callbacks
 *
 * @param config - Page mount configuration.
 * @returns An async function that performs the mount when called.
 */
export function definePageMount<T = undefined>(config: PageMountConfig<T>): () => Promise<void> {
  return () =>
    runPageMount<T>(
      {
        overlayId: config.overlayId,
        composeCss: () => composeStylesForPage(config.cssPreset, cssMap),
        loadComponent: async () => (await config.importApp()).default,
        createApp: (root, data) => config.createApp(root, data as T),
        ...(config.beforeMount ? { beforeMount: config.beforeMount } : {}),
        ...(config.afterMount
          ? {
              afterMount: (
                shadow: ShadowRoot,
                app: App,
                container: HTMLDivElement,
                data: T | undefined,
              ) => config.afterMount!(shadow, app, container, data as T),
            }
          : {}),
        sanitize: sanitizePageData,
      },
      {
        mountOverlay: mountUmmOverlay,
        getShellOptions: getOverlayShellOptions,
        createShell: createOverlay,
        removeShell: removeOverlayShell,
        showFailure: showMountFailure,
        // Deliberately a bare console.warn: logger is gated by the debug switch,
        // and a bootstrap failure is the one thing a user's console must still
        // show (X28 rule: never trade production visibility for a green gate).
        onBootstrapFailure: (error: unknown) => {
          console.warn('[UMM] page app import failed:', error);
        },
      },
    );
}
