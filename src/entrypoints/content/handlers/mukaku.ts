/**
 * Mukaku 视频平台集成模块
 *
 * Decomposed into sub-modules under mukaku/:
 *   config.ts  — constants (MUKAKU_CONFIG, NETWORK_CONFIG)
 *   toast.ts   — MukakuToastController singleton
 *   dom.ts     — DOM extraction helpers (extractMvId, extractLinkedIdsFromDOM)
 *   cache.ts   — TTL cache layer with typed wrappers
 *   api.ts     — API URL builder + response parser
 *   handler.ts — MukakuHandler class (orchestration)
 *   index.ts   — barrel: singleton + public API exports
 */

export { handleMukakuDetailPage, handleMukakuListPage, cleanupMukaku } from './mukaku/index'