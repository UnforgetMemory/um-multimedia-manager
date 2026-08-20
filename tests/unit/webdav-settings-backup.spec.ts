/**
 * Unit tests for WebDAV settings backup primitives (ADR-016).
 *
 * Covers the pure functions extracted from webdav.ts that handle the
 * __settings__ virtual dataset: collectBackupSettings, calculateSettingsHash,
 * and the SETTINGS_DATASET_KEY constant.
 *
 * Test scope:
 *  1. collectBackupSettings excludes WebDAV credential keys
 *  2. collectBackupSettings includes all 12 EXPORT_SETTINGS_KEYS
 *  3. SETTINGS_DATASET_KEY === '__settings__'
 *  4. calculateSettingsHash is deterministic (same input → same hash)
 *
 * These are pure / mockable functions. The full WebDAV handler integration
 * (handleWebDAVUpload/Download/Sync) requires network + IndexedDB + chrome
 * mocks and is outside unit-test scope.
 */
import { test, expect } from '@playwright/test'
import { settingsCache } from '@/features/settings/cache'
import { EXPORT_SETTINGS_KEYS } from '@/entrypoints/background/handlers/data'
import {
  collectBackupSettings,
  calculateSettingsHash,
  SETTINGS_DATASET_KEY,
} from '@/entrypoints/background/handlers/webdav'
import type { AppSettings } from '@/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a fully-populated AppSettings with non-empty credentials. */
function mockSettings(overrides?: Partial<AppSettings>): AppSettings {
  return {
    webdavUrl: 'https://dav.example.com/',
    webdavUsername: 'alice',
    webdavPassword: 'p@ssw0rd!',
    neodbToken: 'neo-token-abc',
    autoSync: true,
    autoSyncNeoDB: false,
    syncInterval: 60,
    theme: 'dark',
    language: 'en-US',
    notificationEnabled: true,
    appearance: 'dark',
    accentColor: 'green',
    grayColor: 'zinc',
    debugEnabled: true,
    logLevel: 'debug',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// collectBackupSettings
// ---------------------------------------------------------------------------

test.describe('collectBackupSettings', () => {
  let originalGet: () => AppSettings

  test.beforeEach(() => {
    originalGet = settingsCache.get.bind(settingsCache) as () => AppSettings
  })

  test.afterEach(() => {
    settingsCache.get = originalGet
  })

  test('excludes WebDAV credential keys (webdavUrl / webdavUsername / webdavPassword)', () => {
    settingsCache.get = () => mockSettings()
    const result = collectBackupSettings()
    expect(result).not.toHaveProperty('webdavUrl')
    expect(result).not.toHaveProperty('webdavUsername')
    expect(result).not.toHaveProperty('webdavPassword')
  })

  test('includes all 12 EXPORT_SETTINGS_KEYS when present in cache', () => {
    settingsCache.get = () => mockSettings()
    const result = collectBackupSettings()
    for (const key of EXPORT_SETTINGS_KEYS) {
      expect(result).toHaveProperty(key)
    }
    expect(Object.keys(result).length).toBe(EXPORT_SETTINGS_KEYS.length)
  })

  test('omits keys whose value is undefined in cache', () => {
    settingsCache.get = () =>
      mockSettings({
        neodbToken: undefined as unknown as string,
        autoSync: undefined as unknown as boolean,
      })
    const result = collectBackupSettings()
    expect(result).not.toHaveProperty('neodbToken')
    expect(result).not.toHaveProperty('autoSync')
    // Remaining keys should still be present
    expect(result).toHaveProperty('theme')
    expect(result).toHaveProperty('language')
  })
})

// ---------------------------------------------------------------------------
// SETTINGS_DATASET_KEY
// ---------------------------------------------------------------------------

test.describe('SETTINGS_DATASET_KEY', () => {
  test('is exactly __settings__', () => {
    expect(SETTINGS_DATASET_KEY).toBe('__settings__')
  })
})

// ---------------------------------------------------------------------------
// calculateSettingsHash
// ---------------------------------------------------------------------------

test.describe('calculateSettingsHash', () => {
  test('same input twice returns identical hash (deterministic)', async () => {
    const settings = { theme: 'dark', language: 'en-US', autoSync: true }
    const hash1 = await calculateSettingsHash(settings)
    const hash2 = await calculateSettingsHash(settings)
    expect(hash1).toBe(hash2)
  })

  test('different inputs produce different hashes', async () => {
    const hashA = await calculateSettingsHash({ theme: 'dark' })
    const hashB = await calculateSettingsHash({ theme: 'light' })
    expect(hashA).not.toBe(hashB)
  })

  test('same key-value pairs in different order produce same hash (sorted)', async () => {
    const hashA = await calculateSettingsHash({ a: '1', b: '2' })
    const hashB = await calculateSettingsHash({ b: '2', a: '1' })
    expect(hashA).toBe(hashB)
  })
})