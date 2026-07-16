/**
 * douban-sync — public API barrel
 *
 * Re-exports every public symbol so consumers importing from
 * `./douban-sync` get the same API after the module split.
 */

export { syncToLocalStorage, getLocalRecord } from './sync-db'
export { syncNeoDBRecord } from './sync-neodb'
export { checkCrossPlatformRecords } from './sync-cross-platform'
