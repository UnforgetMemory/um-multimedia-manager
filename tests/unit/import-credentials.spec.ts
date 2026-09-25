import { test, expect } from '@playwright/test'
import { settingsCache } from '@/features/settings/cache'
import { mediaDB } from '@/features/database/models'
import { handleImportData, IMPORT_SETTINGS_KEYS, WEBDAV_CREDENTIAL_KEYS } from '@/entrypoints/background/handlers/data'
import type { ExportData } from '@/types'

/**
 * Import credential restore (user-reported bug):
 * export-with-credentials → import-with-credentials had no effect because
 * (1) IMPORT_SETTINGS_KEYS always stripped webdav* keys, and
 * (2) settings were written with chrome.storage.local.set, leaving
 *     SettingsCache stale until SW restart.
 *
 * Contract now:
 * - default import still rejects credentials (malicious-backup gate)
 * - includeWebDAVCredentials=true restores webdavUrl/Username/Password
 * - settings go through settingsCache.updateAll (immediate effect)
 */

const emptyStores = {} as ExportData['stores']

function payload(settings: Record<string, unknown>, includeWebDAVCredentials?: boolean) {
  return {
    schema: 'umm-export' as const,
    version: 2 as const,
    exportedAt: new Date().toISOString(),
    stores: emptyStores,
    settings,
    includeWebDAVCredentials,
  }
}

test.describe('IMPORT_DATA WebDAV credentials', () => {
  let originalUpdateAll: typeof settingsCache.updateAll
  let originalGet: typeof settingsCache.get
  let originalClearAll: typeof mediaDB.clearAll
  let applied: Array<Record<string, unknown>> = []

  test.beforeEach(async () => {
    originalUpdateAll = settingsCache.updateAll
    originalGet = settingsCache.get
    originalClearAll = mediaDB.clearAll
    applied = []
    settingsCache.updateAll = (async (s: Record<string, unknown>) => {
      applied.push({ ...s })
    }) as typeof settingsCache.updateAll
    settingsCache.get = (() => ({}) as never) as typeof settingsCache.get
    mediaDB.clearAll = (async () => {}) as typeof mediaDB.clearAll
  })

  test.afterEach(() => {
    settingsCache.updateAll = originalUpdateAll
    settingsCache.get = originalGet
    mediaDB.clearAll = originalClearAll
  })

  test('default import strips credentials (security gate stays closed)', async () => {
    let res: any
    await handleImportData(
      payload({
        theme: 'dark',
        webdavUrl: 'https://evil.example/',
        webdavUsername: 'attacker',
        webdavPassword: 'stolen',
      }),
      (r?: unknown) => { res = r },
    )
    expect(res.success).toBe(true)
    expect(applied).toHaveLength(1)
    expect(applied[0].theme).toBe('dark')
    expect(applied[0]).not.toHaveProperty('webdavUrl')
    expect(applied[0]).not.toHaveProperty('webdavPassword')
  })

  test('includeWebDAVCredentials=true restores all three credential keys', async () => {
    let res: any
    await handleImportData(
      payload(
        {
          theme: 'light',
          webdavUrl: 'https://dav.example.com/',
          webdavUsername: 'alice',
          webdavPassword: 'p@ss!',
        },
        true,
      ),
      (r?: unknown) => { res = r },
    )
    expect(res.success).toBe(true)
    expect(applied[0]).toMatchObject({
      theme: 'light',
      webdavUrl: 'https://dav.example.com/',
      webdavUsername: 'alice',
      webdavPassword: 'p@ss!',
    })
  })

  test('includeWebDAVCredentials=true but file has no creds → nothing credential-shaped applied', async () => {
    let res: any
    await handleImportData(payload({ theme: 'dark' }, true), (r?: unknown) => { res = r })
    expect(res.success).toBe(true)
    expect(applied[0]).toEqual({ theme: 'dark' })
  })

  test('whitelist still excludes credentials; opt-in keys are the only exception', () => {
    for (const key of WEBDAV_CREDENTIAL_KEYS) {
      expect(IMPORT_SETTINGS_KEYS.has(key)).toBe(false)
    }
    expect(WEBDAV_CREDENTIAL_KEYS).toEqual(['webdavUrl', 'webdavUsername', 'webdavPassword'])
  })
})
