/**
 * WEBDAV_SYNC merge handler: bidirectional per-dataset merge between local
 * IndexedDB and the remote WebDAV endpoint, plus the local meta snapshot it
 * compares against. Split from webdav.ts under the ≤600-line file gate;
 * shared primitives live in webdav-settings.ts / webdav-restore.ts.
 */

import type { RecordStoreName, RemoteMeta, DatasetMeta } from '@/types';
import { mediaDB, RECORD_STORES, BACKUP_STORES, STORE_NAMES } from '@/engine/database/models';
import * as WebDAV from '@/provider/webdav/api';
import { packageDataset } from '@/libraries/utils/zip-utils';
import { calculateStoreHash } from '@/libraries/utils/hash-utils';
import { errorLog } from '@/libraries/utils/logger';
import { broadcast } from '@/libraries/utils/event-bus';
import { errorMessage, type SendResponse } from '@/libraries/utils/error-message';
import {
  getWebDAVSettings,
  SETTINGS_DATASET_KEY,
  collectBackupSettings,
  calculateSettingsHash,
} from './webdav-settings';
import { flushStoreCacheInvalidations, downloadDatasetIntoStore } from './webdav-restore';

/** Build local meta for all record stores */
async function buildLocalMeta(): Promise<RemoteMeta> {
  const datasets: DatasetMeta[] = [];
  for (const storeName of RECORD_STORES) {
    const entries = await mediaDB.getAll(storeName);
    const hash = await calculateStoreHash(entries);
    let latestTs = '';
    for (const e of entries) {
      if (e.record.updatedAt > latestTs) latestTs = e.record.updatedAt;
    }
    datasets.push({
      key: storeName,
      hash,
      updatedAt: latestTs || new Date().toISOString(),
      recordCount: entries.length,
      dataVersion: 1,
    });
  }
  // Include jav_ids store in sync metadata
  const javEntries = await mediaDB.getAll(STORE_NAMES.JAV_IDS);
  if (javEntries.length > 0) {
    const javHash = await calculateStoreHash(javEntries);
    let latestTs = '';
    for (const e of javEntries) {
      if (e.record.updatedAt > latestTs) latestTs = e.record.updatedAt;
    }
    datasets.push({
      key: STORE_NAMES.JAV_IDS,
      hash: javHash,
      updatedAt: latestTs || new Date().toISOString(),
      recordCount: javEntries.length,
      dataVersion: 1,
    });
  }
  // ADR-016: include __settings__ virtual dataset meta so sync sees it locally.
  // Settings themselves are only restored via upload/download (sync skips them),
  // but the meta entry keeps the local/remote dataset sets symmetric.
  const localSettings = collectBackupSettings();
  const settingsHash = await calculateSettingsHash(localSettings);
  datasets.push({
    key: SETTINGS_DATASET_KEY,
    hash: settingsHash,
    updatedAt: new Date().toISOString(),
    recordCount: Object.keys(localSettings).length,
    dataVersion: 1,
  });
  return {
    schema: 'umm-meta',
    version: 1,
    generatedAt: new Date().toISOString(),
    datasets,
  };
}

/** WEBDAV_SYNC — merge: compare local vs remote, sync each dataset directionally */
export async function handleWebDAVSync(sendResponse: SendResponse) {
  try {
    const creds = await getWebDAVSettings();
    if (!creds.webdavUrl) {
      sendResponse({ success: false, error: 'WebDAV URL not configured' });
      return;
    }

    const localMeta = await buildLocalMeta();
    const localMap = new Map(localMeta.datasets.map((d) => [d.key, d]));

    const remoteMeta = await WebDAV.fetchRemoteMeta(
      creds.webdavUrl,
      creds.webdavUsername,
      creds.webdavPassword,
    );
    const remoteMap = new Map((remoteMeta?.datasets || []).map((d) => [d.key, d]));

    const allKeys = new Set([...localMap.keys(), ...remoteMap.keys()]);

    let uploaded = 0;
    let downloaded = 0;
    let skipped = 0;
    const resultingMetas: DatasetMeta[] = [];
    const writtenStores = new Set<string>();
    const writtenKeys = new Map<string, string[]>();

    for (const key of allKeys) {
      const local = localMap.get(key);
      const remote = remoteMap.get(key);

      // ADR-016 decision 5: settings do not participate in the bidirectional
      // merge. Settings are scalar values with no primary-key merge semantics,
      // and changes are infrequent (typically one device). Preserve the local
      // meta (buildLocalMeta always emits it) and skip upload/download — users
      // who want settings synced use the explicit upload/download actions.
      if (key === SETTINGS_DATASET_KEY) {
        resultingMetas.push(
          local ||
            remote || {
              key,
              hash: 'empty',
              updatedAt: new Date().toISOString(),
              recordCount: 0,
              dataVersion: 1,
            },
        );
        skipped++;
        continue;
      }

      // Security: mirror the download-path guard — only sync known backup stores
      // (record stores + jav_ids). remoteMeta.datasets[].key is attacker-influenceable
      // on a malicious/compromised WebDAV endpoint; writing into non-backup stores
      // (pt_id_cache / ttl_cache) would poison them (wrong PT dimming, stale cache).
      if (!BACKUP_STORES.includes(key as RecordStoreName)) {
        errorLog(`WebDAV sync skipped dataset '${key}': not a known backup store`);
        resultingMetas.push(
          local ||
            remote || {
              key,
              hash: 'empty',
              updatedAt: new Date().toISOString(),
              recordCount: 0,
              dataVersion: 1,
            },
        );
        continue;
      }

      try {
        // Both empty → skip
        if ((!local || local.recordCount === 0) && (!remote || remote.recordCount === 0)) {
          skipped++;
          resultingMetas.push(
            local ||
              remote || {
                key,
                hash: 'empty',
                updatedAt: new Date().toISOString(),
                recordCount: 0,
                dataVersion: 1,
              },
          );
          continue;
        }

        // Only local → upload
        if (!remote || remote.recordCount === 0) {
          const entries = await mediaDB.getAll(key as RecordStoreName);
          const { blob, meta } = await packageDataset(key as RecordStoreName, entries);
          await WebDAV.uploadDataset(
            creds.webdavUrl,
            creds.webdavUsername,
            creds.webdavPassword,
            key,
            blob,
          );
          resultingMetas.push(meta);
          uploaded += entries.length;
          continue;
        }

        // Only remote → download
        if (!local || local.recordCount === 0) {
          downloaded += await downloadDatasetIntoStore(
            creds,
            key,
            'sync',
            writtenStores,
            writtenKeys,
          );
          resultingMetas.push(remote);
          continue;
        }

        // Both have data — compare hashes
        if (local.hash === remote.hash) {
          skipped++;
          resultingMetas.push(local);
          continue;
        }

        // Different hashes — compare updatedAt, newer wins
        if (local.updatedAt >= remote.updatedAt) {
          const entries = await mediaDB.getAll(key as RecordStoreName);
          const { blob, meta } = await packageDataset(key as RecordStoreName, entries);
          await WebDAV.uploadDataset(
            creds.webdavUrl,
            creds.webdavUsername,
            creds.webdavPassword,
            key,
            blob,
          );
          resultingMetas.push(meta);
          uploaded += entries.length;
        } else {
          downloaded += await downloadDatasetIntoStore(
            creds,
            key,
            'sync',
            writtenStores,
            writtenKeys,
          );
          resultingMetas.push(remote);
        }
      } catch (dsErr: unknown) {
        errorLog(`WebDAV sync skipped dataset '${key}': ${errorMessage(dsErr)}`);
        resultingMetas.push(
          local ||
            remote || {
              key,
              hash: 'empty',
              updatedAt: new Date().toISOString(),
              recordCount: 0,
              dataVersion: 1,
            },
        );
        continue;
      }
    }

    // Update remote meta after merge
    const newRemoteMeta: RemoteMeta = {
      schema: 'umm-meta',
      version: 1,
      generatedAt: new Date().toISOString(),
      datasets: resultingMetas,
    };
    await WebDAV.createDirectory(creds.webdavUrl, creds.webdavUsername, creds.webdavPassword);
    await WebDAV.uploadMeta(
      creds.webdavUrl,
      creds.webdavUsername,
      creds.webdavPassword,
      newRemoteMeta,
    );

    const parts: string[] = [];
    if (uploaded > 0) parts.push(`上传 ${uploaded} 条`);
    if (downloaded > 0) parts.push(`下载 ${downloaded} 条`);
    if (skipped > 0) parts.push(`${skipped} 个数据集无变化`);
    const msg = parts.length > 0 ? parts.join('，') : '所有数据集均无变化';

    flushStoreCacheInvalidations(writtenStores, writtenKeys);
    broadcast('sync:completed', { direction: 'merge', uploaded, downloaded, skipped });
    sendResponse({
      success: true,
      direction: 'merge',
      message: msg,
      uploaded,
      downloaded,
      skipped,
      timestamp: newRemoteMeta.generatedAt,
    });
  } catch (err: unknown) {
    errorLog('WebDAV sync failed:', err);
    sendResponse({
      success: false,
      error: errorMessage(err),
      message: (err as Error)?.message || '同步失败',
    });
  }
}
