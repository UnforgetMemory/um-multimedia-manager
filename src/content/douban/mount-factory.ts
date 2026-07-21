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
 *     const { extractGenrePage } = await import('./pages/genre/extractors')
 *     const data = extractGenrePage()
 *     if (!data) throw new Error('[UMM] Could not extract genre page data')
 *     hideNavForPage({ type: 'genre' })
 *     return data
 *   },
 *   createApp: (RootCmp, data) => createApp(RootCmp, { data }),
 * })
 * ```
 */

import type { ComponentType } from 'react'
import type { Root } from 'react-dom/client'
import type { PageType } from './shared/url-detector'
import { mountUmmOverlay } from './overlay'
import { composeStylesForPage } from './css-composer'
import { cssMap } from './css-map'

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
  cssPreset: PageType['type']

  /**
   * The `id` attribute of the shadow DOM overlay element, created by
   * `createOverlay()` in overlay.ts at document_start.
   */
  overlayId: string

  /**
   * Dynamic import of the root React component for this page.
   * Must return `{ default: ComponentType }`.
   *
   * Example: `() => import('./pages/detail/App')`
   */
  importApp: () => Promise<{ default: ComponentType<any> }>

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
   * The return value is passed as the `data` argument to `createApp` and
   * `afterMount`.
   */
  beforeMount?: (shadow: ShadowRoot) => Promise<T>

  /**
   * Create the React root instance.
   *
   * @param RootCmp - The root component (from the `importApp` dynamic import).
   * @param data - The value returned by `beforeMount`, or `undefined` if
   *   `beforeMount` is not configured.
   */
  createApp: (RootCmp: ComponentType<any>, container: HTMLDivElement, data: T) => Root

  /**
   * Optional post-mount hook for side effects such as polling for record
   * updates or registering global cleanup handlers.
   */
  afterMount?: (shadow: ShadowRoot, root: Root, container: HTMLDivElement, data: T) => void | Promise<void>
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
export function definePageMount<T = undefined>(
  config: PageMountConfig<T>,
): () => Promise<void> {
  return async () => {
    const css = composeStylesForPage(config.cssPreset, cssMap)
    const { default: RootCmp } = await config.importApp()

    mountUmmOverlay({
      overlayId: config.overlayId,
      css,
      async beforeMount(shadow) {
        if (config.beforeMount) {
          return await config.beforeMount(shadow)
        }
      },
      createApp(_shadow, container, ctx) {
        return config.createApp(RootCmp, container, ctx as T)
      },
      afterMount(shadow, root, container, ctx) {
        if (config.afterMount) {
          return config.afterMount(shadow, root, container, ctx as T)
        }
      },
    })
  }
}
