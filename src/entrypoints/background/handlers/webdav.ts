/**
 * WebDAV Sync Message Handlers
 *
 * Handles WEBDAV_TEST, WEBDAV_UPLOAD, WEBDAV_DOWNLOAD messages（ADR-027：三者
 * 均先做预检指纹校验、后做完整性复核）。预览/计划推导在 ./webdav-preview，
 * 合并语义在 ./webdav-sync，共享原语在 ./webdav-restore / ./webdav-settings。
 */

import type { DatasetMeta, MessagePayloadMap, RecordStoreName, RemoteMeta } from '@/types';
import { mediaDB, BACKUP_STORES } from '@/engine/database/models';
import { CURRENT_DATASET_VERSION } from '@/libraries/utils/dataset-version';
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
import { computePreview, buildLocalMeta, verifyRemoteMeta } from './webdav-preview';
import { releaseWebdavWrite, tryAcquireWebdavWrite } from './webdav-lock';
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

/** ADR-027：三个写动作共用的载荷（预检指纹）。 */
type WebDAVOpPayload = MessagePayloadMap['WEBDAV_UPLOAD'];

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

/** 空数据集 meta（本机该表无记录时）。 */
function emptyMeta(key: string): DatasetMeta {
  return {
    key,
    hash: 'empty',
    updatedAt: new Date().toISOString(),
    recordCount: 0,
    dataVersion: CURRENT_DATASET_VERSION,
  };
}

/** WEBDAV_UPLOAD — local → WebDAV（显式覆盖；ADR-027 加预检指纹与执行后复核） */
export async function handleWebDAVUpload(payload: WebDAVOpPayload, sendResponse: SendResponse) {
  if (!tryAcquireWebdavWrite()) {
    sendResponse({
      success: false,
      error: 'WRITE_IN_PROGRESS',
      message: '另一个 WebDAV 写操作正在进行，已拒绝本次上传',
      errorCode: 'WRITE_IN_PROGRESS',
    });
    return;
  }
  try {
    const { webdavUrl, webdavUsername, webdavPassword } = await getWebDAVSettings();
    if (!webdavUrl) {
      sendResponse({ success: false, error: 'WebDAV URL not configured' });
      return;
    }
    const creds = { webdavUrl, webdavUsername, webdavPassword };

    const { fingerprint, remoteMeta } = await computePreview(creds, 'upload');
    if (payload?.expectedFingerprint && payload.expectedFingerprint !== fingerprint) {
      sendResponse({
        success: false,
        error: 'STALE_PLAN',
        message: '数据在预检后已变化，已中止上传（未写入任何数据），请重新预检',
        errorCode: 'STALE_PLAN',
      });
      return;
    }
    const remoteMap = new Map((remoteMeta?.datasets ?? []).map((d) => [d.key, d]));

    await WebDAV.createDirectory(webdavUrl, webdavUsername, webdavPassword);

    let totalUploaded = 0;
    let failedStores = 0;
    const datasetMetas: DatasetMeta[] = [];

    // 备份全部记录 store 与成人三表（BACKUP_STORES 唯一事实源）。
    //
    // 逐表错误隔离（umreview U1）：单表的读/打包/上传失败**不得**中止整轮备份 ——
    // 否则它后面的每张表都不会进备份（「备份没完全」），且 meta 停在上一次的样子，
    // 而已写成功的 blob 与陈旧 meta 跨代不一致，读侧的 hash 一致性校验会连带拒绝这些表。
    // 失败时推**远端侧的旧条目**（远端没有该表则记 0，如实表示「云端没有这份数据」），
    // 这样留存下来的表 meta 与 blob 始终自洽，本地领先的部分留给下一次上传收敛。
    for (const storeName of BACKUP_STORES) {
      try {
        const entries = await mediaDB.getAll(storeName);

        if (entries.length === 0) {
          const remoteEntry = remoteMap.get(storeName);
          if (remoteEntry && remoteEntry.recordCount > 0) {
            // ADR-027 D4：本机为空而云端有数据 —— 写**空数据集**而非只把 meta 计为 0。
            // 只写 0 会让既有 blob 变成 UI 不可达的孤儿（下载侧按 recordCount===0 跳过）；
            // 写空数据集使「完全覆盖」名副其实且 meta 不撒谎。风险已在预检中标示。
            const { blob, meta } = await packageDataset(storeName, []);
            await WebDAV.uploadDataset(webdavUrl, webdavUsername, webdavPassword, storeName, blob);
            datasetMetas.push(meta);
          } else {
            datasetMetas.push(emptyMeta(storeName));
          }
          continue;
        }

        const { blob, meta } = await packageDataset(storeName, entries);
        await WebDAV.uploadDataset(webdavUrl, webdavUsername, webdavPassword, storeName, blob);
        datasetMetas.push(meta);
        totalUploaded += entries.length;
      } catch (storeErr: unknown) {
        errorLog(`WebDAV upload skipped dataset '${storeName}': ${errorMessage(storeErr)}`);
        failedStores += 1;
        datasetMetas.push(remoteMap.get(storeName) ?? emptyMeta(storeName));
      }
    }

    // ADR-016 decision 1: upload non-sensitive settings (12 keys, excludes
    // WebDAV credentials) as a virtual __settings__ dataset. Settings are
    // scalar values, not StoreRecord rows, so they travel as a plain JSON blob
    // (application/json) instead of a packaged ZIP. This is the single source
    // of truth for the upload side; buildLocalMeta mirrors the meta entry.
    try {
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
        dataVersion: CURRENT_DATASET_VERSION,
      });
    } catch (settingsErr: unknown) {
      errorLog(`WebDAV upload skipped settings: ${errorMessage(settingsErr)}`);
      failedStores += 1;
      datasetMetas.push(remoteMap.get(SETTINGS_DATASET_KEY) ?? emptyMeta(SETTINGS_DATASET_KEY));
    }

    const remoteMetaOut: RemoteMeta = {
      schema: 'umm-meta',
      version: 1,
      generatedAt: new Date().toISOString(),
      datasets: datasetMetas,
    };
    await WebDAV.uploadMeta(webdavUrl, webdavUsername, webdavPassword, remoteMetaOut);

    // `verified` = 本次上传完整落地（任一张表失败即未通过），与远端 meta 的元数据级复核取与。
    const verified = failedStores === 0 && (await verifyRemoteMeta(creds, datasetMetas));
    const parts = [`已上传 ${totalUploaded} 条记录`];
    if (failedStores > 0) parts.push(`${failedStores} 张表上传失败（云端保持原状）`);
    if (!verified) parts.push('完整性复核未通过');
    sendResponse({
      success: true,
      totalUploaded,
      timestamp: remoteMetaOut.generatedAt,
      direction: 'upload',
      message: parts.join('，'),
      verified,
    });
  } catch (err: unknown) {
    errorLog('WebDAV upload failed:', err);
    sendResponse({
      success: false,
      error: errorMessage(err),
      message: (err as Error)?.message || '上传失败',
    });
  } finally {
    releaseWebdavWrite();
  }
}

/** WEBDAV_DOWNLOAD — WebDAV → local（显式恢复；ADR-027 加预检指纹与执行后复核） */
export async function handleWebDAVDownload(payload: WebDAVOpPayload, sendResponse: SendResponse) {
  if (!tryAcquireWebdavWrite()) {
    sendResponse({
      success: false,
      error: 'WRITE_IN_PROGRESS',
      message: '另一个 WebDAV 写操作正在进行，已拒绝本次下载',
      errorCode: 'WRITE_IN_PROGRESS',
    });
    return;
  }
  try {
    const creds = await getWebDAVSettings();
    if (!creds.webdavUrl) {
      sendResponse({ success: false, error: 'WebDAV URL not configured' });
      return;
    }

    const { preview, fingerprint, localMeta, remoteMeta } = await computePreview(creds, 'download');
    if (payload?.expectedFingerprint && payload.expectedFingerprint !== fingerprint) {
      sendResponse({
        success: false,
        error: 'STALE_PLAN',
        message: '数据在预检后已变化，已中止下载（未写入任何数据），请重新预检',
        errorCode: 'STALE_PLAN',
      });
      return;
    }
    if (!remoteMeta) {
      sendResponse({ success: false, error: 'No remote data found', message: '云端没有数据' });
      return;
    }

    let totalDownloaded = 0;
    let skippedRecords = 0;
    // 执行消费本次预检的方向矩阵（指纹校验保证它就是用户确认的那份计划）：
    // hash 相等（无变化）的表不重拉重写 —— 内容逐签名一致，重拉只会用云端（可能更旧
    // 的）updatedAt 覆盖本地统计口径，并无谓膨胀 recordVersion，还白耗整表 I/O；
    // 跳过同时让执行与预览的「无变化」口径一致。
    const directionByKey = new Map(preview.rows.map((r) => [r.key, r.direction]));
    let unchangedDatasets = 0;
    // dataset 级失败（hash 混装/404/坏 ZIP/版本过新）与 upload 的 failedStores、sync 的
    // rowFailures 同口径计数 —— 此前只 errorLog 就 continue，既不翻转 `verified` 也不
    // 进消息，UI 会对「丢了一整张表」的恢复照报成功（umpp 深度模拟 D 用例 RED 实证）。
    let failedDatasets = 0;
    const failedNames: string[] = [];
    // R2 修正（代际偏斜自愈）：完整一代 ZIP 一律采纳（显式 cloud-wins、幂等可重复），
    // 仅真损坏拒绝。
    const staleRecovered: string[] = [];
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
      // (record stores + adult stores). remoteMeta comes from an external WebDAV
      // server and is attacker-influenceable; an arbitrary store name would let a
      // malicious server write into any store.
      if (!BACKUP_STORES.includes(ds.key as RecordStoreName)) {
        errorLog(`WebDAV download skipped '${ds.key}': not a known backup store`);
        continue;
      }
      if (directionByKey.get(ds.key) === 'skip') {
        unchangedDatasets += 1;
        continue;
      }
      try {
        const outcome = await downloadDatasetIntoStore(
          creds,
          ds.key,
          'download',
          writtenStores,
          writtenKeys,
          ds.hash,
        );
        totalDownloaded += outcome.total;
        skippedRecords += outcome.skipped;
        if (outcome.staleGenerationRecovered) staleRecovered.push(ds.key);
      } catch (dsErr: unknown) {
        errorLog(`WebDAV download skipped '${ds.key}': ${errorMessage(dsErr)}`);
        failedDatasets += 1;
        failedNames.push(ds.key);
        continue;
      }
    }

    flushStoreCacheInvalidations(writtenStores, writtenKeys);
    // `verified` = 本次恢复完整落地：任一整表失败、被跳过的记录（损坏/异构）、
    // 或本地计数缩减，都算未通过。
    const verified =
      failedDatasets === 0 &&
      skippedRecords === 0 &&
      (await verifyLocalNeverShrunk(localMeta, writtenStores));
    const parts = [`已下载 ${totalDownloaded} 条记录`];
    if (unchangedDatasets > 0) parts.push(`${unchangedDatasets} 个数据集无变化`);
    if (staleRecovered.length > 0)
      parts.push(
        `${staleRecovered.length} 张表按 ZIP 自述恢复（云端 meta 代际陈旧，已自愈：${staleRecovered.join('、')}；下次上传将收敛 meta）`,
      );
    if (skippedRecords > 0) parts.push(`${skippedRecords} 条记录被跳过（格式不合）`);
    if (failedDatasets > 0)
      parts.push(
        `${failedDatasets} 张表下载失败（已跳过：${failedNames.join('、')}；云端保持原状，可重试或用「同步」收敛）`,
      );
    if (!verified) parts.push('完整性复核未通过');
    broadcast('sync:completed', { direction: 'download', totalDownloaded, verified });
    sendResponse({
      success: true,
      totalDownloaded,
      timestamp: remoteMeta.generatedAt,
      direction: 'download',
      message: parts.join('，'),
      verified,
    });
  } catch (err: unknown) {
    errorLog('WebDAV download failed:', err);
    sendResponse({
      success: false,
      error: errorMessage(err),
      message: (err as Error)?.message || '下载失败',
    });
  } finally {
    releaseWebdavWrite();
  }
}

/**
 * 下载后复核：被写入的表记录数不得少于下载前（下载是逐记录 upsert，永不删除）。
 * 计数减少即意味着发生了非预期删除 —— 回报 `verified: false`。
 */
async function verifyLocalNeverShrunk(before: RemoteMeta, written: Set<string>): Promise<boolean> {
  try {
    const beforeMap = new Map(before.datasets.map((d) => [d.key, d.recordCount]));
    const after = await buildLocalMeta();
    const afterMap = new Map(after.datasets.map((d) => [d.key, d.recordCount]));
    for (const key of written) {
      const prev = beforeMap.get(key) ?? 0;
      if ((afterMap.get(key) ?? 0) < prev) return false;
    }
    return true;
  } catch (err: unknown) {
    errorLog('WebDAV download verification failed:', err);
    return false;
  }
}
