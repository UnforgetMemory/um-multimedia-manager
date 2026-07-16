/**
 * douban-sync
 *
 * Split into sub-modules under douban-sync/ — this file re-exports the
 * public API for backward compatibility.
 *
 * See:
 *   - douban-sync/sync-db.ts           (IndexedDB save + notification)
 *   - douban-sync/sync-neodb.ts        (NeoDB push/pull)
 *   - douban-sync/sync-cross-platform.ts  (IMDb/TMDB linking)
 */

export * from './douban-sync/index'
