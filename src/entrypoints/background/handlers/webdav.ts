/**
 * WebDAV Sync Message Handlers
 *
 * Handles WEBDAV_TEST, WEBDAV_UPLOAD, WEBDAV_DOWNLOAD messages.
 * Extracted from background.ts for modularity. The WEBDAV_SYNC merge handler
 * lives in webdav-sync.ts; shared settings/restore primitives live in
 * webdav-settings.ts and webdav-restore.ts.
 */

import type { RecordStoreName, RemoteMeta, DatasetMeta, MessagePayloadMap } from '@/types';
import { mediaDB, BACKUP_STORES } from '@/engine/database/models';
import * as WebDAV from '@/provider/webdav/api';
import { packageDataset } from '@/libraries/utils/zip-utils';
import { errorLog } from '@/libraries/utils/logger';
import { broadcast } from '@/libraries/utils/event-bus';
import { errorMessage, type SendResponse } from '@/libraries/utils/error-message';
import {
  getWebDAVSettings,
  SETTINGS_DATASET_KEY,
  collectBackupSettings,
  calculateSettingsHash,
} from './webdav-settings';
import {
  flushStoreCacheInvalidations,
  restoreSettingsDataset,
  downloadDatasetIntoStore,
} from './webdav-restore';

/**
 * WEBDAV_TEST payload — canonical superset from MessagePayloadMap (both caller
 * dialects); every field optional, `undefined` allowed (falls back to stored
 * settings inside the handler).
 */
type WebDAVTestPayload = NonNullable<MessagePayloadMap['WEBDAV_TEST']>;

/** WEBDAV_TEST — check connection */
export async function handleWebDAVTest(
  payload: WebDAVTestPayload | undefined,
  sendResponse: SendResponse,
) {
  try {
    let webdavUrl: string;
    let webdavUsername: string;
    let webdavPassword: string;

    if (payload) {
      webdavUrl = payload.webdavUrl ?? payload.url ?? '';
      webdavUsername = payload.webdavUsername ?? payload.username ?? '';
      webdavPassword = payload.webdavPassword ?? payload.password ?? '';
    } else {
      const settings = await getWebDAVSettings();
      webdavUrl = settings.webdavUrl;
      webdavUsername = settings.webdavUsername;
      webdavPassword = settings.webdavPassword;
    }

    const result = await WebDAV.testConnection(webdavUrl, webdavUsername, webdavPassword);
    sendResponse({ success: true, ...result });
  } catch (err: unknown) {
    sendResponse({ success: false, message: errorMessage(err) });
  }
}

/** WEBDAV_UPLOAD — local → WebDAV */
export async function handleWebDAVUpload(sendResponse: SendResponse) {
  try {
    const { webdavUrl, webdavUsername, webdavPassword } = await getWebDAVSettings();
    if (!webdavUrl) {
      sendResponse({ success: false, error: 'WebDAV URL not configured' });
      return;
    }

    await WebDAV.createDirectory(webdavUrl, webdavUsername, webdavPassword);

    let totalUploaded = 0;
    const datasetMetas: DatasetMeta[] = [];

    // Backup all record stores plus jav_ids so adult viewing history is included too.
    for (const storeName of BACKUP_STORES) {
      const entries = await mediaDB.getAll(storeName);
      if (entries.length === 0) {
        datasetMetas.push({
          key: storeName,
          hash: 'empty',
          updatedAt: new Date().toISOString(),
          recordCount: 0,
          dataVersion: 1,
        });
        continue;
      }

      const { blob, meta } = await packageDataset(storeName, entries);
      await WebDAV.uploadDataset(webdavUrl, webdavUsername, webdavPassword, storeName, blob);
      datasetMetas.push(meta);
      totalUploaded += entries.length;
    }

    // ADR-016 decision 1: upload non-sensitive settings (12 keys, excludes
    // WebDAV credentials) as a virtual __settings__ dataset. Settings are
    // scalar values, not StoreRecord rows, so they travel as a plain JSON blob
    // (application/json) instead of a packaged ZIP. This is the single source
    // of truth for the upload side; buildLocalMeta mirrors the meta entry.
    const settingsPayload = collectBackupSettings();
    const settingsBlob = new Blob([JSON.stringify(settingsPayload, null, 2)], {
      type: 'application/json',
    });
    await WebDAV.uploadDataset(
      webdavUrl,
      webdavUsername,
      webdavPassword,
      SETTINGS_DATASET_KEY,
      settingsBlob,
    );
    const settingsHash = await calculateSettingsHash(settingsPayload);
    datasetMetas.push({
      key: SETTINGS_DATASET_KEY,
      hash: settingsHash,
      updatedAt: new Date().toISOString(),
      recordCount: Object.keys(settingsPayload).length,
      dataVersion: 1,
    });

    const remoteMeta: RemoteMeta = {
      schema: 'umm-meta',
      version: 1,
      generatedAt: new Date().toISOString(),
      datasets: datasetMetas,
    };
    await WebDAV.uploadMeta(webdavUrl, webdavUsername, webdavPassword, remoteMeta);

    sendResponse({
      success: true,
      totalUploaded,
      timestamp: remoteMeta.generatedAt,
      direction: 'upload',
      message: `已上传 ${totalUploaded} 条记录`,
    });
  } catch (err: unknown) {
    errorLog('WebDAV upload failed:', err);
    sendResponse({
      success: false,
      error: errorMessage(err),
      message: (err as Error)?.message || '上传失败',
    });
  }
}

/** WEBDAV_DOWNLOAD — WebDAV → local */
export async function handleWebDAVDownload(sendResponse: SendResponse) {
  try {
    const creds = await getWebDAVSettings();
    if (!creds.webdavUrl) {
      sendResponse({ success: false, error: 'WebDAV URL not configured' });
      return;
    }

    const remoteMeta = await WebDAV.fetchRemoteMeta(
      creds.webdavUrl,
      creds.webdavUsername,
      creds.webdavPassword,
    );
    if (!remoteMeta) {
      sendResponse({ success: false, error: 'No remote data found', message: '云端没有数据' });
      return;
    }

    let totalDownloaded = 0;
    const writtenStores = new Set<string>();
    const writtenKeys = new Map<string, string[]>();
    for (const ds of remoteMeta.datasets) {
      // ADR-016 decision 4/5: route the __settings__ virtual dataset to its
      // dedicated restore path BEFORE the BACKUP_STORES allowlist check
      // (details in webdav-restore.ts#restoreSettingsDataset).
      if (ds.key === SETTINGS_DATASET_KEY) {
        if (ds.recordCount === 0) continue;
        await restoreSettingsDataset(creds);
        continue;
      }
      if (ds.recordCount === 0) continue;
      // Security: only accept datasets whose store name is a known backup store
      // (record stores + jav_ids). remoteMeta comes from an external WebDAV server
      // and is attacker-influenceable; an arbitrary store name would let a malicious
      // server write into any store.
      if (!BACKUP_STORES.includes(ds.key as RecordStoreName)) {
        errorLog(`WebDAV download skipped '${ds.key}': not a known backup store`);
        continue;
      }
      try {
        totalDownloaded += await downloadDatasetIntoStore(
          creds,
          ds.key,
          'download',
          writtenStores,
          writtenKeys,
        );
      } catch (dsErr: unknown) {
        errorLog(`WebDAV download skipped '${ds.key}': ${errorMessage(dsErr)}`);
        continue;
      }
    }

    flushStoreCacheInvalidations(writtenStores, writtenKeys);
    broadcast('sync:completed', { direction: 'download', totalDownloaded });
    sendResponse({
      success: true,
      totalDownloaded,
      timestamp: remoteMeta.generatedAt,
      direction: 'download',
      message: `已下载 ${totalDownloaded} 条记录`,
    });
  } catch (err: unknown) {
    errorLog('WebDAV download failed:', err);
    sendResponse({
      success: false,
      error: errorMessage(err),
      message: (err as Error)?.message || '下载失败',
    });
  }
}
