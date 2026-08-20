/**
 * handleExportData credential-inclusion semantics (ADR-016 decision 3).
 *
 * - payload.includeWebDAVCredentials === true  → settings includes webdavUrl,
 *   webdavUsername, webdavPassword (in addition to EXPORT_SETTINGS_KEYS)
 * - payload.includeWebDAVCredentials === false | undefined → settings excludes
 *   all three credential keys
 *
 * mediaDB.getAllStores() and settingsCache.get() are singletons with
 * reassignable methods, so they are stubbed here (same technique as
 * webdav-settings-backup.spec.ts, which reassigns settingsCache.get).
 */
import { test, expect } from '@playwright/test'
import { mediaDB } from '@/features/database/models'
import { settingsCache } from '@/features/settings/cache'
import { handleExportData } from '@/entrypoints/background/handlers/data'
import type { AppSettings } from '@/types'

function mockSettings(): AppSettings {
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
  }
}

interface ExportResponse {
  success: boolean
  data: { settings: Record<string, unknown> }
}

test.describe('handleExportData — WebDAV credential inclusion', () => {
  let originalGetAllStores: typeof mediaDB.getAllStores
  let originalGet: typeof settingsCache.get

  test.beforeEach(() => {
    originalGetAllStores = mediaDB.getAllStores
    originalGet = settingsCache.get
    mediaDB.getAllStores = (async () => ({})) as typeof mediaDB.getAllStores
    settingsCache.get = (() => mockSettings()) as typeof settingsCache.get
  })

  test.afterEach(() => {
    mediaDB.getAllStores = originalGetAllStores
    settingsCache.get = originalGet
  })

  async function exportSettings(payload: { includeWebDAVCredentials?: boolean } | undefined): Promise<Record<string, unknown>> {
    let captured: unknown
    await handleExportData(payload, (res?: unknown) => { captured = res })
    return (captured as ExportResponse).data.settings
  }

  test('includeWebDAVCredentials=true → includes webdavUrl/Username/Password', async () => {
    const settings = await exportSettings({ includeWebDAVCredentials: true })
    expect(settings.webdavUrl).toBe('https://dav.example.com/')
    expect(settings.webdavUsername).toBe('alice')
    expect(settings.webdavPassword).toBe('p@ssw0rd!')
  })

  test('payload undefined → excludes all three credential keys', async () => {
    const settings = await exportSettings(undefined)
    expect(settings).not.toHaveProperty('webdavUrl')
    expect(settings).not.toHaveProperty('webdavUsername')
    expect(settings).not.toHaveProperty('webdavPassword')
  })

  test('includeWebDAVCredentials=false → excludes all three credential keys', async () => {
    const settings = await exportSettings({ includeWebDAVCredentials: false })
    expect(settings).not.toHaveProperty('webdavUrl')
    expect(settings).not.toHaveProperty('webdavUsername')
    expect(settings).not.toHaveProperty('webdavPassword')
  })
})