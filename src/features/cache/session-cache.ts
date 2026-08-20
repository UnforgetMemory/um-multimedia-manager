/**
 * L1.5 session-layer cache (chrome.storage.session).
 *
 * Per ADR-014: a thin wrapper over chrome.storage.session that survives
 * Service-Worker wake cycles (unlike the L1 in-memory LruCache, which is
 * cleared on every SW restart). Only two payloads are stored here:
 *
 *   - `watched:{storeName}`  → Set<string> of watched ids per record store
 *     (survives SW wake so the PT dimmer / list pages don't re-query IDB)
 *   - `settings:snapshot`   → fully-resolved AppSettings object
 *     (avoids the chrome.storage.local.get(null) full scan on SW wake)
 *
 * chrome.storage.session is MV3-only (Chrome 102+). On older Chrome the API
 * is absent, so every call is wrapped in try-catch and degrades to a no-op
 * (callers fall through to their existing L1/IDB paths). This module NEVER
 * throws — a missing/unsupported session area is a soft miss, not an error.
 *
 * Quota: session area caps at ~10MB. watched ids total ~280KB and the
 * settings snapshot ~400B, so we stay well under the limit. Scheduler
 * result caches (get:/all:/bulk:) are deliberately NOT stored here — they
 * can exceed 1MB and would risk quota exhaustion.
 */

/** Shared session-cache key prefixes (single source of truth). */
export const SESSION_CACHE_KEYS = {
  /** Watched-ids entry for a record store: `watched:{storeName}`. */
  watched: (storeName: string): string => `watched:${storeName}`,
  /** Prefix for all watched-ids entries (used by removeByPrefix). */
  WATCHED_PREFIX: 'watched:',
  /** Fully-resolved AppSettings snapshot. */
  SETTINGS_SNAPSHOT: 'settings:snapshot',
} as const

/**
 * Whether chrome.storage.session is available in the current runtime.
 * Evaluated lazily per call so a polyfill/late-load still works.
 */
function hasSessionStorage(): boolean {
  return typeof chrome !== 'undefined'
    && typeof chrome.storage !== 'undefined'
    && typeof chrome.storage.session !== 'undefined'
}

/**
 * Read a single key from the session cache.
 * Returns `undefined` on miss OR when the session area is unavailable.
 */
export async function get<T>(key: string): Promise<T | undefined> {
  if (!hasSessionStorage()) return undefined
  try {
    const result = await chrome.storage.session.get(key)
    return result[key] as T | undefined
  } catch (e: unknown) {
    // Soft miss — never surface session errors to callers.
    return undefined
  }
}

/**
 * Write a single key/value to the session cache.
 * No-op (not throw) when the session area is unavailable.
 */
export async function set<T>(key: string, value: T): Promise<void> {
  if (!hasSessionStorage()) return
  try {
    await chrome.storage.session.set({ [key]: value })
  } catch (e: unknown) {
    // Soft write failure — caller's local/IDB write already succeeded.
  }
}

/**
 * Remove a single key from the session cache.
 * No-op when the session area is unavailable.
 */
export async function remove(key: string): Promise<void> {
  if (!hasSessionStorage()) return
  try {
    await chrome.storage.session.remove(key)
  } catch (e: unknown) {
    // Soft failure — invalidation is best-effort; browser restart is the backstop.
  }
}

/**
 * Remove every key matching a prefix (e.g. `watched:` to drop all
 * watched-ids entries when a store is bulk-invalidated).
 *
 * chrome.storage.session has no native prefix delete, so this enumerates
 * keys via getKeys() (Chrome 130+) and removes matches. On older Chrome
 * without getKeys, falls back to a full `get(null)` scan.
 */
export async function removeByPrefix(prefix: string): Promise<void> {
  if (!hasSessionStorage()) return
  try {
    let keys: string[]
    if (typeof chrome.storage.session.getKeys === 'function') {
      keys = await chrome.storage.session.getKeys()
    } else {
      // Fallback: full scan (older Chrome without getKeys).
      const all = await chrome.storage.session.get(null)
      keys = Object.keys(all)
    }
    const matching = keys.filter(k => k.startsWith(prefix))
    if (matching.length > 0) {
      await chrome.storage.session.remove(matching)
    }
  } catch (e: unknown) {
    // Best-effort; browser restart clears any stale entries.
  }
}

/**
 * Clear the entire session cache. Intended for SW-wake reset paths or
 * explicit cache-reset messages. No-op when unavailable.
 */
export async function clear(): Promise<void> {
  if (!hasSessionStorage()) return
  try {
    await chrome.storage.session.clear()
  } catch (e: unknown) {
    // Best-effort.
  }
}
