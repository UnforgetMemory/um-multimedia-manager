/**
 * WebDAV settings access + the `__settings__` virtual dataset primitives
 * (ADR-016). Split from webdav.ts under the ≤600-line file gate.
 */

import { EXPORT_SETTINGS_KEYS } from './data';
import { settingsCache } from '@/engine/settings/cache';
import { settingsItems } from '@/engine/settings/items';

/** WebDAV connection settings resolved from storage (used by all WebDAV handlers) */
export interface WebDAVCredentials {
  webdavUrl: string;
  webdavUsername: string;
  webdavPassword: string;
}

/** Read WebDAV settings from the typed storage items (targeted, batched) */
export async function getWebDAVSettings(): Promise<WebDAVCredentials> {
  const items = settingsItems();
  const [webdavUrl, webdavUsername, webdavPassword] = await Promise.all([
    items.webdavUrl.getValue(),
    items.webdavUsername.getValue(),
    items.webdavPassword.getValue(),
  ]);
  return { webdavUrl, webdavUsername, webdavPassword };
}

/**
 * ADR-016: settings are backed up as a virtual `__settings__` dataset inside
 * `RemoteMeta.datasets` (scheme A — no RemoteMeta version bump). Settings are
 * scalar key/value pairs, not StoreRecord rows, so they travel as a JSON blob
 * rather than a packaged ZIP.
 */
export const SETTINGS_DATASET_KEY = '__settings__';

/**
 * Collect the non-sensitive settings (ADR-016 decision 1: reuses
 * EXPORT_SETTINGS_KEYS — every key except credential material. WebDAV trio
 * and `neodbToken` are opt-in only; 2026-09-30 moved neodbToken out of the
 * default export set so a shared backup cannot silently carry the NeoDB
 * bearer token).
 */
export function collectBackupSettings(): Record<string, unknown> {
  const appSettings = settingsCache.get();
  const settingsPayload: Record<string, unknown> = {};
  for (const key of EXPORT_SETTINGS_KEYS) {
    const value = appSettings[key];
    if (value !== undefined) settingsPayload[key] = value;
  }
  return settingsPayload;
}

/**
 * SHA-256 hash of the settings JSON (stable UTF-8 → SHA-256). Settings are
 * scalar values, not StoreRecord rows, so calculateStoreHash (which dereferences
 * record.status/rating/linkedIds/url) does not apply; a direct content hash is
 * the type-safe equivalent of the ADR-016 example that used `as any` to fake a
 * StoreRecord (banned by project convention).
 */
export async function calculateSettingsHash(settings: Record<string, unknown>): Promise<string> {
  const keys = Object.keys(settings).toSorted((a, b) => a.localeCompare(b));
  const sorted: Record<string, unknown> = {};
  for (const k of keys) sorted[k] = settings[k];
  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify(sorted));
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
