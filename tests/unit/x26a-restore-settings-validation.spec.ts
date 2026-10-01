import { test, expect } from '@playwright/test';
import { filterValidSettings } from '@/entrypoints/background/handlers/webdav-restore';
import { EXPORT_SETTINGS_KEYS } from '@/entrypoints/background/handlers/data';

/**
 * Per-key validation for the __settings__ WebDAV restore path.
 *
 * A compromised / hostile WebDAV endpoint returns a JSON blob that used to be
 * copied straight into settingsCache.updateAll() with no type or range checks,
 * so it could push theme:{}, logLevel:999, syncInterval:-1, debugEnabled:"yes".
 * filterValidSettings is the pure decision core: keep well-typed values, drop
 * the rest (fail-closed) and report what was dropped.
 */

test('keeps a fully valid settings object unchanged (credentials stay out)', () => {
  const raw: Record<string, unknown> = {
    autoSync: true,
    autoSyncNeoDB: false,
    syncInterval: 60,
    theme: 'dark',
    language: 'en-US',
    notificationEnabled: true,
    appearance: 'light',
    accentColor: 'green',
    grayColor: 'zinc',
    debugEnabled: true,
    logLevel: 'debug',
    sehuatangHideViewed: false,
  };
  const { valid, dropped } = filterValidSettings(raw);
  expect(dropped).toEqual([]);
  expect(valid).toEqual(raw);
});

test('neodbToken is NOT a restorable key (credential material stays out)', () => {
  const { valid, dropped } = filterValidSettings({ neodbToken: 'neo-token-abc', theme: 'dark' });
  expect(valid).toEqual({ theme: 'dark' });
  expect(dropped).toEqual(['neodbToken']);
});

test('drops hostile values of the wrong shape or range', () => {
  const raw: Record<string, unknown> = {
    theme: {},
    logLevel: 999,
    syncInterval: -1,
    debugEnabled: 'yes',
  };
  const { valid, dropped } = filterValidSettings(raw);
  expect(valid).toEqual({});
  expect(dropped.sort()).toEqual(['debugEnabled', 'logLevel', 'syncInterval', 'theme']);
});

test('drops unknown and enum-violating values, keeps valid siblings (mixed)', () => {
  const raw: Record<string, unknown> = {
    theme: 'neon', // not in auto|light|dark
    language: 'fr-FR', // not a supported locale
    appearance: 'auto', // valid
    notificationEnabled: 'true', // string, not boolean
    accentColor: '', // empty string rejected
    grayColor: 'slate', // valid
    neodbToken: 'x', // credential — never restorable
  };
  const { valid, dropped } = filterValidSettings(raw);
  expect(valid).toEqual({ appearance: 'auto', grayColor: 'slate' });
  expect(dropped.sort()).toEqual([
    'accentColor',
    'language',
    'neodbToken',
    'notificationEnabled',
    'theme',
  ]);
});

test('drops every allowlisted key when all carry non-boolean garbage (fail-closed)', () => {
  const hostile: Record<string, unknown> = {};
  for (const key of EXPORT_SETTINGS_KEYS) hostile[key] = { nope: true };
  const { valid, dropped } = filterValidSettings(hostile);
  expect(Object.keys(valid)).toHaveLength(0);
  expect(dropped.sort()).toEqual([...EXPORT_SETTINGS_KEYS].sort());
});
