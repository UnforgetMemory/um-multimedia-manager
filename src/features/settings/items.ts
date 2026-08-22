/**
 * Typed storage items — single source of truth for every persisted setting.
 *
 * Refactor plan W1 (docs/audit/refactor-plan-wxt-alignment-2026-08-21.md §3.1-D5):
 * every AppSettings field becomes a typed storage item with a fallback and a
 * version/migration hook, replacing the hand-written flat-key scan that used
 * to live in settings/cache.ts.
 *
 * Compatibility contract (locked by tests/unit/settings-items.spec.ts):
 * - Physical chrome.storage.local keys are UNCHANGED (`webdavUrl`, `theme`, …),
 *   so data written by v5.x installs is read in place with zero migration,
 *   and anything written through these items stays readable by legacy
 *   `chrome.storage.local.get(key)` call sites.
 * - No `$` metadata rows exist at v1; they appear only when an item actually
 *   declares `migrations`.
 *
 * Implementation note — why this is a small owned layer instead of
 * `wxt/utils/storage`: @wxt-dev/storage resolves its platform driver from the
 * chrome/browser GLOBAL once at module-eval time and exposes no backend
 * injection point in v1.2.9 (`defineExtensionStorage` was removed). Under
 * Playwright's reused workers that import-time capture makes item behavior
 * depend on which spec file loaded first. This layer resolves the storage
 * area at CALL time and accepts an explicit test binding
 * (`__bindSettingsAreaForTests`), keeping production behavior identical while
 * making unit tests deterministic by construction. The version/migration
 * semantics intentionally mirror @wxt-dev/storage (meta row `<key>$`,
 * sequential migrations, fallback on missing value).
 */

import type { AppSettings, LogLevel } from '@/types'
import { STORAGE_KEYS } from '@/config'

/** Resolved settings shape — every field present (fallback applied). */
export type ResolvedAppSettings = Required<AppSettings>

/** Minimal chrome.storage.LocalStorageArea surface used by this module. */
export interface MinimalStorageArea {
  get(keys: string | string[] | null): Promise<Record<string, unknown>>
  set(items: Record<string, unknown>): Promise<void>
  remove(keys: string | string[]): Promise<void>
}

let testAreaOverride: MinimalStorageArea | undefined

/**
 * Test-only: pin all settings item operations to an explicit area. Pass
 * `undefined` to restore production behavior (live global lookup).
 */
export function __bindSettingsAreaForTests(area: MinimalStorageArea | undefined): void {
  testAreaOverride = area
}

function liveArea(): MinimalStorageArea {
  const area = testAreaOverride
    ?? (globalThis as { chrome?: { storage?: { local?: MinimalStorageArea } } }).chrome?.storage?.local
  if (!area) {
    throw new Error(
      '[settings/items] chrome.storage.local unavailable — settings items must run in an extension context (or a test must bind an area)',
    )
  }
  return area
}

/** A typed, versioned settings entry backed by one physical flat key. */
export interface SettingsItem<T> {
  /** Physical chrome.storage.local key (no area prefix) */
  key: string
  defaultValue: T
  getValue(): Promise<T>
  setValue(value: T): Promise<void>
}

interface ItemOptions<T> {
  fallback: T
  version?: number
  migrations?: Record<number, (oldValue: unknown) => T>
}

const META_SUFFIX = '$'

/** Physical keys whose items declare migrations — consumed by resolveAppSettings. */
const migratableKeys = new Set<string>()

function defineSettingsItem<T>(key: string, options: ItemOptions<T>): SettingsItem<T> {
  const targetVersion = options.version ?? 1
  if (options.migrations) migratableKeys.add(key)
  return {
    key,
    defaultValue: options.fallback,
    async getValue(): Promise<T> {
      const area = liveArea()
      const res = await area.get(key)
      let value: unknown = res[key]
      if (value == null) return options.fallback

      // Declarative migration chain (mirrors @wxt-dev/storage semantics:
      // current version defaults to 1, stored in the `<key>$` meta row).
      if (options.migrations && targetVersion > 1) {
        const metaKey = key + META_SUFFIX
        const metaRes = await area.get(metaKey)
        const currentVersion = (metaRes[metaKey] as { v?: number } | undefined)?.v ?? 1
        if (currentVersion < targetVersion) {
          for (let to = currentVersion + 1; to <= targetVersion; to++) {
            const migrate = options.migrations[to]
            if (migrate) value = await migrate(value)
          }
          await area.set({ [key]: value, [metaKey]: { v: targetVersion } })
        }
      }
      return value as T
    },
    async setValue(value: T): Promise<void> {
      await liveArea().set({ [key]: value })
    },
  }
}

function defineSettingsItems() {
  migratableKeys.clear()
  return {
    webdavUrl: defineSettingsItem(STORAGE_KEYS.WEBDAV_URL, { fallback: '', version: 1 }),
    webdavUsername: defineSettingsItem(STORAGE_KEYS.WEBDAV_USERNAME, { fallback: '', version: 1 }),
    webdavPassword: defineSettingsItem(STORAGE_KEYS.WEBDAV_PASSWORD, { fallback: '', version: 1 }),
    neodbToken: defineSettingsItem(STORAGE_KEYS.NEODB_TOKEN, { fallback: '', version: 1 }),

    autoSync: defineSettingsItem(STORAGE_KEYS.AUTO_SYNC, { fallback: false, version: 1 }),
    autoSyncNeoDB: defineSettingsItem(STORAGE_KEYS.AUTO_SYNC_NEO_DB, { fallback: false, version: 1 }),
    syncInterval: defineSettingsItem<number>(STORAGE_KEYS.SYNC_INTERVAL, { fallback: 30, version: 1 }),

    theme: defineSettingsItem<NonNullable<AppSettings['theme']>>(STORAGE_KEYS.THEME, { fallback: 'auto', version: 1 }),
    language: defineSettingsItem(STORAGE_KEYS.LANGUAGE, { fallback: 'zh-CN', version: 1 }),
    notificationEnabled: defineSettingsItem(STORAGE_KEYS.NOTIFICATION_ENABLED, { fallback: true, version: 1 }),

    appearance: defineSettingsItem<NonNullable<AppSettings['appearance']>>(STORAGE_KEYS.APPEARANCE, { fallback: 'auto', version: 1 }),
    accentColor: defineSettingsItem(STORAGE_KEYS.ACCENT_COLOR, { fallback: 'blue', version: 1 }),
    grayColor: defineSettingsItem(STORAGE_KEYS.GRAY_COLOR, { fallback: 'slate', version: 1 }),

    debugEnabled: defineSettingsItem(STORAGE_KEYS.DEBUG_ENABLED, { fallback: false, version: 1 }),
    logLevel: defineSettingsItem<LogLevel>(STORAGE_KEYS.LOG_LEVEL, { fallback: 'info', version: 1 }),
  } satisfies {
    [K in keyof ResolvedAppSettings]: { defaultValue: ResolvedAppSettings[K] }
  }
}

export type SettingsItemsMap = ReturnType<typeof defineSettingsItems>

/**
 * Memoized per effective-backend instance. In production the live global is
 * stable, so items are defined exactly once per SW/page lifetime; tests that
 * bind an explicit area (or swap globals) transparently get fresh bindings.
 */
let boundBackend: unknown
let itemsCache: SettingsItemsMap | null = null

export function settingsItems(): SettingsItemsMap {
  const backend = testAreaOverride
    ?? (globalThis as { chrome?: { storage?: { local?: MinimalStorageArea } } }).chrome?.storage?.local
  if (!itemsCache || boundBackend !== backend) {
    itemsCache = defineSettingsItems()
    boundBackend = backend
  }
  return itemsCache
}

const SETTING_KEYS_OF = (items: SettingsItemsMap) =>
  Object.keys(items) as Array<keyof ResolvedAppSettings>

/** Defaults derived from the item fallbacks — no second literal to keep in sync. */
export function defaultAppSettings(): ResolvedAppSettings {
  const items = settingsItems()
  const out = {} as ResolvedAppSettings
  for (const key of SETTING_KEYS_OF(items)) {
    ;(out as Record<string, unknown>)[key] = items[key].defaultValue
  }
  return out
}

/**
 * Read every setting with fallbacks applied. One batched `area.get(keys)`
 * call replaces the former `chrome.storage.local.get(null)` full scan.
 *
 * Migration safety: items that declare `migrations` are re-read through
 * `getValue()` (which runs the chain) instead of the batched fast path, so
 * adding a future migration cannot silently produce unmigrated values here.
 */
export async function resolveAppSettings(): Promise<ResolvedAppSettings> {
  const items = settingsItems()
  const keys = SETTING_KEYS_OF(items)
  const res = await liveArea().get([...keys])
  const out = {} as ResolvedAppSettings
  for (const key of keys) {
    const raw = res[items[key].key]
    ;(out as Record<string, unknown>)[key] =
      raw == null ? items[key].defaultValue : await migrateIfNeeded(items[key], raw)
  }
  return out
}

/** Run an item's migration chain when the batched read bypassed it. */
async function migrateIfNeeded(
  item: { key: string; getValue(): Promise<unknown> },
  rawValue: unknown,
): Promise<unknown> {
  if (!migratableKeys.has(item.key)) return rawValue
  // getValue re-reads and migrates; slight duplicate I/O only for migrated items.
  return item.getValue()
}

/**
 * Persist a partial settings update as ONE batched area write — the same
 * single-call storage pattern as the legacy `chrome.storage.local.set(patch)`
 * it replaced (unknown keys dropped, `undefined` skipped, atomic per call).
 * Physical keys come from the item definitions, so legacy readers stay
 * compatible without knowing about this module.
 */
export async function persistAppSettings(patch: Partial<AppSettings>): Promise<void> {
  const raw = patch as Record<string, unknown>
  const items = settingsItems()
  const entries: Record<string, unknown> = {}
  for (const key of SETTING_KEYS_OF(items)) {
    const value = raw[key]
    if (value !== undefined) entries[items[key].key] = value
  }
  if (Object.keys(entries).length === 0) return
  await liveArea().set(entries)
}
