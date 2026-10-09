/**
 * Sehuatang detail cache — frozen import path (`@/provider/sehuatang-cache/models`).
 *
 * The provider now splits into a pure seam (`./mapping`, types/constants/
 * TTL+LRU policy) and an IDB transport (`./transport`). External consumers
 * (background handlers, types/messages) import from this stable path, so it
 * re-exports both — the same surface as `./index.ts`.
 */

export * from './mapping';
export * from './transport';
