/**
 * Page mount registry for Douban content script.
 *
 * Maps page type identifiers (matching `PageType['type']`) to their
 * corresponding mount functions, replacing the hardcoded switch statement
 * that previously dispatched across 19 cases in mountDoubanMain().
 *
 * Usage:
 *   const registry = new MountRegistry()
 *   registry.register('detail', mountDetailFn)
 *   const fn = registry.getMountFn('detail')
 *   if (fn) await fn()
 */
export class MountRegistry {
  private registry = new Map<string, () => Promise<void>>()

  /**
   * Register an async mount function for a page type.
   *
   * @param pageType - Page type identifier, e.g. 'detail', 'search', 'homepage'.
   * @param mountFn - Async function returned by `definePageMount`.
   */
  register(pageType: string, mountFn: () => Promise<void>): void {
    this.registry.set(pageType, mountFn)
  }

  /**
   * Look up the mount function for the given page type.
   *
   * @param pageType - Page type identifier.
   * @returns The registered mount function, or `undefined` if none found.
   */
  getMountFn(pageType: string): (() => Promise<void>) | undefined {
    return this.registry.get(pageType)
  }
}
