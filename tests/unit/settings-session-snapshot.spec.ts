/**
 * Unit tests for the settings-snapshot integration with session-cache.
 *
 * These tests exercise the session-cache level (L1.5) of the settings snapshot
 * path used by SettingsCache (src/features/settings/cache.ts). The full
 * SettingsCache integration (init → session hit / miss, updateAll → sync) is
 * verified by type-check and existing integration tests.
 *
 * Scenarios:
 *  1. Write an AppSettings-shaped object via sessionCache.set, then read it
 *     back via sessionCache.get using SESSION_CACHE_KEYS.SETTINGS_SNAPSHOT.
 *  2. Session area unavailable → read returns undefined, write is no-op.
 */
import { test, expect } from '@playwright/test'
import * as sessionCache from '@/features/cache/session-cache'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createSessionMock(): { storage: { session: Record<string, unknown> } } {
  const _map = new Map<string, unknown>()
  return {
    storage: {
      session: {
        get: async (key: string | null) => {
          if (key === null) {
            const all: Record<string, unknown> = {}
            for (const [k, v] of _map) all[k] = v
            return all
          }
          return { [key]: _map.get(key) }
        },
        set: async (items: Record<string, unknown>) => {
          for (const [k, v] of Object.entries(items)) _map.set(k, v)
        },
        remove: async (keys: string | string[]) => {
          const ks = Array.isArray(keys) ? keys : [keys]
          for (const k of ks) _map.delete(k)
        },
        clear: async () => _map.clear(),
        getKeys: async () => [..._map.keys()],
      },
    },
  }
}

function setChrome(stub: object): void {
  ;(globalThis as { chrome?: unknown }).chrome = stub
}

function clearChrome(): void {
  ;(globalThis as { chrome?: unknown }).chrome = undefined
}

// ---------------------------------------------------------------------------
// Settings snapshot round-trip
// ---------------------------------------------------------------------------

test.describe('settings snapshot round-trip (session-cache level)', () => {
  test.beforeEach(() => { setChrome(createSessionMock()) })
  test.afterEach(clearChrome)

  test('write and read back an AppSettings-shaped object', async () => {
    const snapshot = {
      webdavUrl: 'https://dav.example.com',
      webdavUsername: 'user',
      webdavPassword: 'pass',
      neodbToken: 'neo-token',
      autoSync: true,
      autoSyncNeoDB: false,
      syncInterval: 60,
      theme: 'dark' as const,
      language: 'en',
      notificationEnabled: true,
      appearance: 'auto' as const,
      accentColor: 'green',
      grayColor: 'neutral',
      debugEnabled: false,
      logLevel: 'info' as const,
    }

    await sessionCache.set(
      sessionCache.SESSION_CACHE_KEYS.SETTINGS_SNAPSHOT,
      snapshot,
    )

    const read = await sessionCache.get<typeof snapshot>(
      sessionCache.SESSION_CACHE_KEYS.SETTINGS_SNAPSHOT,
    )
    expect(read).toEqual(snapshot)
  })

  test('empty settings snapshot round-trip (defaults-like shape)', async () => {
    const defaults = {
      webdavUrl: '',
      webdavUsername: '',
      webdavPassword: '',
      neodbToken: '',
      autoSync: false,
      autoSyncNeoDB: false,
      syncInterval: 30,
      theme: 'auto' as const,
      language: 'zh-CN',
      notificationEnabled: true,
      appearance: 'auto' as const,
      accentColor: 'blue',
      grayColor: 'slate',
      debugEnabled: false,
      logLevel: 'info' as const,
    }

    await sessionCache.set(
      sessionCache.SESSION_CACHE_KEYS.SETTINGS_SNAPSHOT,
      defaults,
    )

    const read = await sessionCache.get<typeof defaults>(
      sessionCache.SESSION_CACHE_KEYS.SETTINGS_SNAPSHOT,
    )
    expect(read).toEqual(defaults)
  })
})

// ---------------------------------------------------------------------------
// Degradation: session unavailable
// ---------------------------------------------------------------------------

test.describe('settings snapshot — session unavailable', () => {
  test.beforeEach(() => {
    // Only local storage, no session area.
    setChrome({ storage: { local: {} } })
  })
  test.afterEach(clearChrome)

  test('get returns undefined when session is absent', async () => {
    const val = await sessionCache.get(
      sessionCache.SESSION_CACHE_KEYS.SETTINGS_SNAPSHOT,
    )
    expect(val).toBeUndefined()
  })

  test('set is a no-op and does not throw when session is absent', async () => {
    await expect(
      sessionCache.set(
        sessionCache.SESSION_CACHE_KEYS.SETTINGS_SNAPSHOT,
        { theme: 'dark' },
      ),
    ).resolves.toBeUndefined()
  })
})