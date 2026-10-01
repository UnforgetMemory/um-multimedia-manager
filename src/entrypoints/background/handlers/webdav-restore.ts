/**
 * Shared WebDAV restore primitives: post-write cache invalidation, the
 * `__settings__` dataset restore path, and the record-dataset
 * download → unpackage → migrate → batchPut pipeline reused by
 * WEBDAV_DOWNLOAD and WEBDAV_SYNC. Split from webdav.ts under the
 * ≤600-line file gate.
 */

import type { AppSettings, LogLevel, RecordStoreName, StoreRecord } from '@/types';
import { EXTENSION_LOCALES, type ExtensionLocale } from '@/libraries/locale-sets';
import { mediaDB, normalizeStoreRecordKey } from '@/engine/database/models';
import { normalizeStoreRecord, validateDatasetVersion } from '@/engine/migration/models';
import * as WebDAV from '@/provider/webdav/api';
import { unpackageDataset } from '@/libraries/utils/zip-utils';
import { errorLog, warnLog } from '@/libraries/utils/logger';
import { broadcast } from '@/libraries/utils/event-bus';
import { getCacheManager, invalidateSchedulerStore } from './cache-invalidation';
import { EXPORT_SETTINGS_KEYS, IMPORT_SETTINGS_KEYS } from './data';
import { settingsCache } from '@/engine/settings/cache';
import { errorMessage } from '@/libraries/utils/error-message';
import { SETTINGS_DATASET_KEY, type WebDAVCredentials } from './webdav-settings';

/*
 * Restored bilibili/youtube keys are normalized to canonical movie:: form at write time
 * (normalizeStoreRecordKey, models.ts) — legacy 'video::X' / bare 'X' keys from a pre-v13
 * backup land as 'movie::X', mirroring the v13 DB migration. See decision-3.
 */

/**
 * Invalidate the scheduler L1 cache and broadcast record:updated for every
 * store written by a bulk WebDAV download/merge path, so merged/downloaded
 * records are visible immediately instead of after the 5-10s cache TTL.
 */
export function flushStoreCacheInvalidations(
  writtenStores: Set<string>,
  writtenKeys: Map<string, string[]>,
): void {
  const cm = getCacheManager();
  if (cm) {
    for (const s of writtenStores) invalidateSchedulerStore(cm, s, writtenKeys.get(s));
  }
  for (const s of writtenStores) {
    broadcast('record:updated', { storeName: s, key: '*', bulk: true });
  }
}

/** Result of validating a restored settings blob: what survived, what was dropped. */
export interface ValidatedSettings {
  valid: Partial<AppSettings>;
  dropped: string[];
}

const THEME_MODES: readonly NonNullable<AppSettings['theme']>[] = ['auto', 'light', 'dark'];
const LOG_LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error'];
// Accepted locales for a restored `language` value = EXTENSION_LOCALES, i.e. every
// language the extension can actually hold — which is BROADER than the SPA's
// message dictionaries (@/libraries/locales only ships copy for en-US/zh-CN/zh-TW;
// zh-HK renders as zh-TW via SPA_LOCALE_FALLBACK). This filter is fail-closed: a
// value missing here is silently dropped, so narrowing it to the 3 dictionary
// locales made a zh-HK user's stored preference vanish on WebDAV restore with only
// a warn log. Relationship between the sets is locked by
// tests/unit/locale-set-parity.spec.ts — do not re-narrow this one.
const SUPPORTED_LOCALES: readonly ExtensionLocale[] = EXTENSION_LOCALES;

const isBoolean = (v: unknown): boolean => typeof v === 'boolean';
const isNonEmptyString = (v: unknown): boolean => typeof v === 'string' && v.length > 0;
// syncInterval is a positive schedule period: reject negatives, NaN, Infinity.
const isSyncInterval = (v: unknown): boolean =>
  typeof v === 'number' && Number.isFinite(v) && v > 0;
const oneOf =
  <T extends string>(allowed: readonly T[]) =>
  (v: unknown): boolean =>
    typeof v === 'string' && (allowed as readonly string[]).includes(v);

/**
 * Per-key validators for the allowlisted settings a WebDAV restore may apply.
 * Shapes are derived from AppSettings (types/index.ts) + the item fallbacks in
 * engine/settings/items.ts. Keys absent here are REJECTED (fail-closed), so a
 * future allowlist addition must land a validator alongside it.
 */
const SETTING_VALIDATORS: Partial<Record<keyof AppSettings, (v: unknown) => boolean>> = {
  autoSync: isBoolean,
  autoSyncNeoDB: isBoolean,
  syncInterval: isSyncInterval,
  theme: oneOf(THEME_MODES),
  language: oneOf(SUPPORTED_LOCALES),
  notificationEnabled: isBoolean,
  appearance: oneOf(THEME_MODES),
  accentColor: isNonEmptyString,
  grayColor: isNonEmptyString,
  debugEnabled: isBoolean,
  logLevel: oneOf(LOG_LEVELS),
  // `neodbToken` deliberately absent (2026-09-30): credential material never
  // restores from a remote WebDAV blob. Same fail-closed posture as the WebDAV
  // trio below — outer IMPORT_SETTINGS_KEYS is the gate, this map is the
  // second lock and must stay consistent with it.
  sehuatangHideViewed: isBoolean,
};

/**
 * Filter a restored settings blob through SETTING_VALIDATORS, dropping any
 * value whose shape/range is wrong instead of writing it. Pure — no I/O — so
 * restoreSettingsDataset's accept/reject decision is unit-testable in isolation.
 */
export function filterValidSettings(raw: Record<string, unknown>): ValidatedSettings {
  const valid: Record<string, unknown> = {};
  const dropped: string[] = [];
  for (const [key, value] of Object.entries(raw)) {
    const validator = SETTING_VALIDATORS[key as keyof AppSettings];
    if (validator && validator(value)) {
      valid[key] = value;
    } else {
      dropped.push(key);
    }
  }
  return { valid: valid as Partial<AppSettings>, dropped };
}

/**
 * ADR-016 decision 4/5: the __settings__ virtual dataset carries scalar
 * settings (not StoreRecord rows) as a JSON blob. Route it to this dedicated
 * restore path BEFORE the BACKUP_STORES allowlist check — __settings__ is
 * not an IndexedDB store name, so the allowlist would otherwise reject it.
 * The restore reuses IMPORT_SETTINGS_KEYS (data.ts) so a malicious WebDAV
 * server cannot inject credential keys (webdavUrl/Username/Password) —
 * the security model mirrors handleImportData exactly.
 */
export async function restoreSettingsDataset(creds: WebDAVCredentials): Promise<void> {
  try {
    const blob = await WebDAV.downloadDataset(
      creds.webdavUrl,
      creds.webdavUsername,
      creds.webdavPassword,
      SETTINGS_DATASET_KEY,
    );
    const text = await blob.text();
    let rawSettings: Record<string, unknown>;
    try {
      rawSettings = JSON.parse(text) as Record<string, unknown>;
    } catch (parseErr: unknown) {
      errorLog(
        `WebDAV download: ${SETTINGS_DATASET_KEY} dataset is not valid JSON, skipping: ${errorMessage(parseErr)}`,
      );
      return;
    }
    // Reuse IMPORT_SETTINGS_KEYS whitelist (mirrors EXPORT_SETTINGS_KEYS,
    // excludes WebDAV credentials) — same security model as handleImportData.
    // Iterate EXPORT_SETTINGS_KEYS for keyof-AppSettings typing; the .has()
    // check keeps the runtime gate on IMPORT_SETTINGS_KEYS so a future
    // divergence (if IMPORT_SETTINGS_KEYS is ever narrowed) is honored.
    const filtered: Record<string, unknown> = {};
    for (const key of EXPORT_SETTINGS_KEYS) {
      if (IMPORT_SETTINGS_KEYS.has(key) && key in rawSettings) {
        filtered[key] = rawSettings[key];
      }
    }
    if (Object.keys(filtered).length > 0) {
      // Per-key validation: a hostile/compromised WebDAV endpoint must not be
      // able to push malformed settings into the live cache. Drop invalid
      // values (fail-closed) and log what was removed.
      const { valid, dropped } = filterValidSettings(filtered);
      if (dropped.length > 0) {
        warnLog(`WebDAV restore dropped invalid setting key(s): ${dropped.join(', ')}`);
      }
      if (Object.keys(valid).length > 0) {
        await settingsCache.updateAll(valid);
      }
    }
  } catch (dsErr: unknown) {
    errorLog(`WebDAV download skipped '${SETTINGS_DATASET_KEY}': ${errorMessage(dsErr)}`);
  }
}

/**
 * Download one record dataset, validate its version, normalize/migrate every
 * record, and batchPut the result into the local store. Shared by the
 * WEBDAV_DOWNLOAD and WEBDAV_SYNC paths; `op` only labels the per-record
 * skip log. Returns the number of records present in the dataset; throws on
 * any dataset-level failure so the caller can skip-and-continue.
 */
export async function downloadDatasetIntoStore(
  creds: WebDAVCredentials,
  storeKey: string,
  op: 'download' | 'sync',
  writtenStores: Set<string>,
  writtenKeys: Map<string, string[]>,
): Promise<number> {
  const blob = await WebDAV.downloadDataset(
    creds.webdavUrl,
    creds.webdavUsername,
    creds.webdavPassword,
    storeKey,
  );
  const { data, meta: datasetMeta } = await unpackageDataset(blob);
  // 版本兼容性策略归调用方（zip-utils 只负责解析）：不相容时抛 MigrationError
  validateDatasetVersion(datasetMeta.dataVersion);
  const batch: Array<{ key: string; record: StoreRecord }> = [];
  for (const [recordKey, record] of Object.entries(data)) {
    // Validate record shape before writing (external data is untrusted).
    if (typeof record !== 'object' || record === null || typeof recordKey !== 'string') continue;
    try {
      // Migrate old-schema records (0→1→2) to the current schema (adds `comment`).
      // A too-new record throws MigrationError — skip just that record.
      const { record: migrated } = normalizeStoreRecord(record);
      batch.push({ key: normalizeStoreRecordKey(storeKey, recordKey), record: migrated });
    } catch (err: unknown) {
      errorLog(`WebDAV ${op} skipped record '${recordKey}' in '${storeKey}': ${errorMessage(err)}`);
    }
  }
  if (batch.length > 0) {
    await mediaDB.batchPut(storeKey as RecordStoreName, batch);
    writtenStores.add(storeKey);
    writtenKeys.set(storeKey, [...(writtenKeys.get(storeKey) ?? []), ...batch.map((b) => b.key)]);
  }
  return Object.keys(data).length;
}
