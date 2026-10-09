import { test, expect } from '@playwright/test';
import { settingsCache } from '@/engine/settings/cache';
import { mediaDB } from '@/engine/database/models';
import {
  handleImportData,
  IMPORT_SETTINGS_KEYS,
  WEBDAV_CREDENTIAL_KEYS,
  NEO_DB_CREDENTIAL_KEYS,
} from '@/entrypoints/background/handlers/data';
import type { ExportData, MessageResponse } from '@/types';

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

type ImportResponse = MessageResponse<'IMPORT_DATA'>;

// Pre-seeded failure: an import that never calls sendResponse still fails `res.success`
// assertions exactly like the old undefined-read TypeError path.
function unansweredImport(): ImportResponse {
  return { success: false, error: 'sendResponse never called' };
}

const emptyStores = {} as ExportData['stores'];

function payload(
  settings: Record<string, unknown>,
  includeWebDAVCredentials?: boolean,
  includeNeoDbToken?: boolean,
) {
  return {
    schema: 'umm-export' as const,
    version: 2 as const,
    exportedAt: new Date().toISOString(),
    stores: emptyStores,
    settings,
    includeWebDAVCredentials,
    includeNeoDbToken,
  };
}

test.describe('IMPORT_DATA WebDAV credentials', () => {
  let originalUpdateAll: typeof settingsCache.updateAll;
  let originalGet: typeof settingsCache.get;
  let originalClearAll: typeof mediaDB.clearAll;
  let applied: Array<Record<string, unknown>> = [];

  test.beforeEach(async () => {
    originalUpdateAll = settingsCache.updateAll;
    originalGet = settingsCache.get;
    originalClearAll = mediaDB.clearAll;
    applied = [];
    settingsCache.updateAll = (async (s: Record<string, unknown>) => {
      applied.push({ ...s });
    }) as typeof settingsCache.updateAll;
    settingsCache.get = (() => ({}) as never) as typeof settingsCache.get;
    mediaDB.clearAll = (async () => {}) as typeof mediaDB.clearAll;
  });

  test.afterEach(() => {
    settingsCache.updateAll = originalUpdateAll;
    settingsCache.get = originalGet;
    mediaDB.clearAll = originalClearAll;
  });

  test('default import strips credentials (security gate stays closed)', async () => {
    let res = unansweredImport();
    await handleImportData(
      payload({
        theme: 'dark',
        webdavUrl: 'https://evil.example/',
        webdavUsername: 'attacker',
        webdavPassword: 'stolen',
      }),
      (r?: unknown) => {
        res = r as ImportResponse;
      },
    );
    expect(res.success).toBe(true);
    expect(applied).toHaveLength(1);
    expect(applied[0]!.theme).toBe('dark'); // `!`：上方 toHaveLength(1) 已守卫
    expect(applied[0]).not.toHaveProperty('webdavUrl');
    expect(applied[0]).not.toHaveProperty('webdavPassword');
  });

  test('includeWebDAVCredentials=true restores all three credential keys', async () => {
    let res = unansweredImport();
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
      (r?: unknown) => {
        res = r as ImportResponse;
      },
    );
    expect(res.success).toBe(true);
    expect(applied[0]).toMatchObject({
      theme: 'light',
      webdavUrl: 'https://dav.example.com/',
      webdavUsername: 'alice',
      webdavPassword: 'p@ss!',
    });
  });

  test('includeWebDAVCredentials=true but file has no creds → nothing credential-shaped applied', async () => {
    let res = unansweredImport();
    await handleImportData(payload({ theme: 'dark' }, true), (r?: unknown) => {
      res = r as ImportResponse;
    });
    expect(res.success).toBe(true);
    expect(applied[0]).toEqual({ theme: 'dark' });
  });

  test('whitelist still excludes credentials; opt-in keys are the only exception', () => {
    for (const key of WEBDAV_CREDENTIAL_KEYS) {
      expect(IMPORT_SETTINGS_KEYS.has(key)).toBe(false);
    }
    for (const key of NEO_DB_CREDENTIAL_KEYS) {
      expect(IMPORT_SETTINGS_KEYS.has(key)).toBe(false);
    }
    expect(WEBDAV_CREDENTIAL_KEYS).toEqual(['webdavUrl', 'webdavUsername', 'webdavPassword']);
    expect(NEO_DB_CREDENTIAL_KEYS).toEqual(['neodbToken']);
  });

  test('default import strips neodbToken (malicious backup must not rewrite the bearer)', async () => {
    let res = unansweredImport();
    await handleImportData(
      payload({ theme: 'dark', neodbToken: 'attacker-token' }),
      (r?: unknown) => {
        res = r as ImportResponse;
      },
    );
    expect(res.success).toBe(true);
    expect(applied[0]).toEqual({ theme: 'dark' });
  });

  test('includeNeoDbToken=true restores neodbToken; WebDAV trio stays gated', async () => {
    let res = unansweredImport();
    await handleImportData(
      payload(
        {
          theme: 'light',
          neodbToken: 'own-token',
          webdavPassword: 'stolen',
        },
        false,
        true,
      ),
      (r?: unknown) => {
        res = r as ImportResponse;
      },
    );
    expect(res.success).toBe(true);
    expect(applied[0]).toMatchObject({ theme: 'light', neodbToken: 'own-token' });
    expect(applied[0]).not.toHaveProperty('webdavPassword');
  });
});
