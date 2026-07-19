/**
 * Legacy re-export — delegates to the canonical implementation in neodb-push.ts.
 *
 * This file exists only to preserve the import path used by handlers/douban.ts.
 * Both implementations were consolidated to eliminate duplication (see M4).
 */
export { injectNeoDBPushButtons } from '../neodb-push'