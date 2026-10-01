import { test, expect } from '@playwright/test';
import { STORAGE_KEYS } from '@/libraries/config';
import { Platform } from '@/domain/platform/platform';

/**
 * libraries/config.ts — persistence + derivation contracts.
 * 1. STORAGE_KEYS values are the PHYSICAL chrome.storage.local keys. They are
 *    an on-disk compatibility contract: settings/items.ts documents "Physical
 *    keys are UNCHANGED (`webdavUrl`, `theme`, …) so v5.x data is read in
 *    place with zero migration" — renaming any value silently orphans every
 *    installed user's settings. Pinned verbatim for exactly that reason.
 * 2. Field-name = key-name: every value is a lowerCamelCase identifier (the
 *    AppSettings field name doubles as the key, per config.ts doc-comment).
 * 3. No two constants may collapse onto the same physical key.
 * 4. `Provider` is derived from Platform.KNOWN (no hand-maintained list) —
 *    the runtime witness is that the Platform registry really exposes the
 *    providers the app depends on.
 */

test.describe('STORAGE_KEYS', () => {
  test('physical key contract — exact values frozen (zero-migration reads)', () => {
    expect(STORAGE_KEYS).toEqual({
      WEBDAV_URL: 'webdavUrl',
      WEBDAV_USERNAME: 'webdavUsername',
      WEBDAV_PASSWORD: 'webdavPassword',
      NEODB_TOKEN: 'neodbToken',
      AUTO_SYNC: 'autoSync',
      AUTO_SYNC_NEO_DB: 'autoSyncNeoDB',
      SYNC_INTERVAL: 'syncInterval',
      THEME: 'theme',
      LANGUAGE: 'language',
      NOTIFICATION_ENABLED: 'notificationEnabled',
      APPEARANCE: 'appearance',
      ACCENT_COLOR: 'accentColor',
      GRAY_COLOR: 'grayColor',
      DEBUG_ENABLED: 'debugEnabled',
      LOG_LEVEL: 'logLevel',
      SEHUATANG_HIDE_VIEWED: 'sehuatangHideViewed',
    });
  });

  test('every key is a lowerCamelCase identifier with no duplicates', () => {
    const values = Object.values(STORAGE_KEYS);
    expect(new Set(values).size).toBe(values.length);
    for (const key of values) {
      expect(key).toMatch(/^[a-z][A-Za-z0-9]*$/);
    }
  });

  test('cross-context keys used by theme/locale sync stay stable', () => {
    // use-locale-sync matches the changed key; theme store mirrors via 'theme'.
    expect(STORAGE_KEYS.LANGUAGE).toBe('language');
    expect(STORAGE_KEYS.THEME).toBe('theme');
    expect(STORAGE_KEYS.APPEARANCE).toBe('appearance');
    expect(STORAGE_KEYS.THEME).not.toBe(STORAGE_KEYS.APPEARANCE);
  });
});

test.describe('Provider derived from Platform.KNOWN', () => {
  test('the platform registry is the single non-empty lowercase id list', () => {
    expect(Platform.KNOWN.length).toBeGreaterThan(0);
    for (const id of Platform.KNOWN) {
      expect(id).toMatch(/^[a-z0-9-]+$/);
    }
    // Providers the message/storage layer hard-depends on must be present —
    // Provider (the type) is built from this very array.
    for (const required of ['douban', 'imdb', 'neodb', 'tmdb', 'bangumi']) {
      expect(Platform.KNOWN).toContain(required);
    }
    expect(new Set(Platform.KNOWN).size).toBe(Platform.KNOWN.length);
  });
});
