/**
 * Legacy Bridge — stable import target for functions used by the new Douban
 * overlay system that still live in the legacy content script directory
 * (src/entrypoints/content/).
 *
 * WARNING: These are re-exports from the legacy system. As each dependency is
 * extracted into a proper shared module, remove the re-export here and update
 * the importing files to import directly from the new shared location.
 *
 * Current legacy dependencies:
 * - extractCrossPlatformLinks  from handlers/douban-scanner  → should move to shared/
 * - injectNeoDBPushButtons     from neodb-push.ts             → duplicate, needs merge
 * - FloatingToast              from utils/toast               → should move to shared/
 * - t                          from i18n                      → separate i18n system
 */

export { extractCrossPlatformLinks } from '@/entrypoints/content/handlers/douban-scanner'
export { injectNeoDBPushButtons } from '@/entrypoints/content/neodb-push'
export { FloatingToast } from '@/entrypoints/content/utils/toast'
export { t } from '@/entrypoints/content/i18n'