import type { AppSettings } from '@/types'
import * as sessionCache from '@/features/cache/session-cache'
import {
  defaultAppSettings,
  persistAppSettings,
  resolveAppSettings,
  type ResolvedAppSettings,
} from './items'

/**
 * In-memory settings facade over the typed storage items (items.ts).
 *
 * Public API is intentionally unchanged (init/get/updateAll/startListening):
 * consumers in background handlers keep working without edits. What changed
 * under the hood (refactor plan W1):
 * - init() no longer does a `chrome.storage.local.get(null)` full scan; it
 *   batch-reads exactly the known item keys with fallbacks applied.
 * - Defaults live once — in item fallbacks — instead of a second literal here.
 * - Persistence goes through versioned items, so future per-field schema
 *   migrations hook in at one place.
 *
 * L1.5 session snapshot behavior (ADR-014) is preserved verbatim: on SW wake,
 * the last-resolved snapshot short-circuits the local read entirely.
 */
class SettingsCache {
  private cache: ResolvedAppSettings | null = null
  private initPromise: Promise<void> | null = null

  async init(): Promise<void> {
    if (this.cache) return
    if (this.initPromise) return this.initPromise
    this.initPromise = (async () => {
      // L1.5: try the session snapshot first. A miss or an unavailable
      // session area falls through to the item-based local read, which then
      // writes the resolved snapshot back for the next wake.
      const snapshot = await sessionCache.get<ResolvedAppSettings>(
        sessionCache.SESSION_CACHE_KEYS.SETTINGS_SNAPSHOT,
      )
      if (snapshot) {
        this.cache = snapshot
        return
      }
      this.cache = await resolveAppSettings()
      // Persist the resolved snapshot so the next SW wake hits session first.
      await sessionCache.set(
        sessionCache.SESSION_CACHE_KEYS.SETTINGS_SNAPSHOT,
        this.cache,
      )
    })()
    return this.initPromise
  }

  get(): AppSettings {
    if (!this.cache) {
      console.warn('[SettingsCache] Cache not initialized, returning defaults')
      return defaultAppSettings()
    }
    return { ...this.cache }
  }

  async updateAll(settings: Partial<AppSettings>): Promise<void> {
    if (!this.cache) await this.init()
    Object.assign(this.cache!, settings)
    await persistAppSettings(settings)
    // L1.5: keep the session snapshot in sync (ADR-014). write-after-write so
    // a SW wake between the local write and the next read still hits session.
    await sessionCache.set(
      sessionCache.SESSION_CACHE_KEYS.SETTINGS_SNAPSHOT,
      this.cache,
    )
  }

  startListening(): void {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !this.cache) return
      let mutated = false
      for (const [key, change] of Object.entries(changes)) {
        if (change.newValue !== undefined && key in this.cache) {
          ;(this.cache as unknown as Record<string, unknown>)[key] = change.newValue
          mutated = true
        }
      }
      // Sync theme from umm:appearance key (written by the theme Pinia store
      // via chrome.storage.local alongside its localStorage copy) into
      // settingsCache's theme field for background consistency
      const appearanceChange = changes['umm:appearance']
      if (appearanceChange?.newValue) {
        const mode = (appearanceChange.newValue as { theme?: string }).theme
        if (mode && ['auto', 'light', 'dark'].includes(mode)) {
          this.cache.theme = mode as NonNullable<AppSettings['theme']>
          mutated = true
        }
      }
      // L1.5: mirror any mutation into the session snapshot (ADR-014). Fire
      // and forget — session writes are best-effort and never throw.
      if (mutated) {
        void sessionCache.set(
          sessionCache.SESSION_CACHE_KEYS.SETTINGS_SNAPSHOT,
          this.cache,
        )
      }
    })
  }
}

export const settingsCache = new SettingsCache()
