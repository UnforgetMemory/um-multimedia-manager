/**
 * WEBDAV_SYNC merge handler（ADR-027）。
 *
 * 语义：**并集 + 逐记录较新者胜** —— 两侧同键取 `updatedAt` 较新者，单侧独有键保留，
 * 结果集永不小于任一侧（同步不删除记录）。此前实现按「整表 max(updatedAt) 较新者胜」
 * 决定方向、上传走整文件覆盖，会在跨设备分叉时静默销毁远端独有记录。
 *
 * 执行前做 TOCTOU 校验（预检指纹），执行后做计数复核（verified）。
 * 本地 meta / 计划推导在 `./webdav-preview`，并集算法在 `@/provider/webdav/plan`。
 */

import type { DatasetMeta, RecordStoreName, SyncPlanRow } from '@/types';
import { mediaDB, BACKUP_STORES } from '@/engine/database/models';
import * as WebDAV from '@/provider/webdav/api';
import { packageDataset } from '@/libraries/utils/zip-utils';
import { CURRENT_DATASET_VERSION } from '@/libraries/utils/dataset-version';
import { mergeDatasetEntries } from '@/provider/webdav/plan';
import { errorLog } from '@/libraries/utils/logger';
import { broadcast } from '@/libraries/utils/event-bus';
import { errorMessage, type SendResponse } from '@/libraries/utils/error-message';
import { getWebDAVSettings, SETTINGS_DATASET_KEY, type WebDAVCredentials } from './webdav-settings';
import { computePreview, verifyRemoteMeta } from './webdav-preview';
import { releaseWebdavWrite, tryAcquireWebdavWrite } from './webdav-lock';
import {
  flushStoreCacheInvalidations,
  downloadDatasetIntoStore,
  readDatasetEntries,
} from './webdav-restore';

interface WriteTracker {
  writtenStores: Set<string>;
  writtenKeys: Map<string, string[]>;
}

/** 两侧都无数据时写入 meta 的占位条目（保持远端数据集集合与本地对称）。 */
function placeholderMeta(key: string): DatasetMeta {
  return {
    key,
    hash: 'empty',
    updatedAt: new Date().toISOString(),
    recordCount: 0,
    dataVersion: CURRENT_DATASET_VERSION,
  };
}

/**
 * 合并单表：拉远端 → 与本地并集（较新者胜）→ 落盘 → 按持久化状态打包上传。
 *
 * 计数口径（R3）：`pushed` = **只有本地才有的键**（远端真的新增了这些），
 * `pulled` = 采纳了远端值的键（远端独有 + 远端更新）。合并行不再把「落盘后总数」
 * 记成「上传 N 条」——那会把云端本来就有的记录也算进上传量。
 */
async function mergeDatasetRow(
  creds: WebDAVCredentials,
  key: string,
  tracker: WriteTracker,
  expectedHash: string | undefined,
  declaredCount: number | undefined,
): Promise<{
  meta: DatasetMeta;
  conflicts: number;
  pushed: number;
  pulled: number;
  staleGenerationRecovered: boolean;
  /** 云端自身异常：meta 条目声明的记录数 ≠ ZIP 实际内容条数（质疑并按实际纠错）。 */
  cloudAnomaly?: string;
}> {
  // 远端 ZIP 拉取（代际偏斜按 dataVersion 轴自愈，见 readDatasetEntries）。
  const remote = await readDatasetEntries(creds, key, 'sync', expectedHash);
  // 质疑云端：meta 条目声明的计数与 ZIP 实际内容不符 = 云端自身异常（历史上传中断/
  // meta 谎报）。合并按实际内容进行，上传会用真实值纠错 meta —— 但必须如实回报。
  const cloudAnomaly =
    typeof declaredCount === 'number' && declaredCount !== remote.rawCount
      ? `声明 ${declaredCount} / 实际 ${remote.rawCount}`
      : undefined;
  const local = await mediaDB.getAll(key);
  const outcome = mergeDatasetEntries(local, remote.entries);
  const remoteKeys = new Set(remote.entries.map((e) => e.key));
  const pushed = outcome.merged.filter((e) => !remoteKeys.has(e.key)).length;
  const pulled = outcome.fromRemote.length + outcome.takenRemoteNewer.length;

  // 落盘**增量写**：只写远端贡献的键（fromRemote 本地缺失 + takenRemoteNewer 远端较新）。
  // keptLocal / conflicts 的值本地已是，重写只会无谓膨胀 recordVersion（还会把乐观锁
  // 的 expectedVersion 全表打失效），且在万条级表上是纯浪费。上传侧仍打包**完整
  // persisted 并集** —— 远端需要的是完整集合，这一步不可省。
  const remoteTouched = new Set<string>([...outcome.fromRemote, ...outcome.takenRemoteNewer]);
  const writeSet =
    remoteTouched.size === 0 ? [] : outcome.merged.filter((e) => remoteTouched.has(e.key));
  if (writeSet.length > 0) {
    await mediaDB.batchPut(key as RecordStoreName, writeSet);
    tracker.writtenStores.add(key);
    tracker.writtenKeys.set(key, [
      ...(tracker.writtenKeys.get(key) ?? []),
      ...writeSet.map((e) => e.key),
    ]);
  }

  // 以落盘后的真实状态打包：既保证上传内容与本地一致，也顺带充当一次落盘复核。
  const persisted = await mediaDB.getAll(key);
  const { blob, meta } = await packageDataset(key, persisted);
  await WebDAV.uploadDataset(
    creds.webdavUrl,
    creds.webdavUsername,
    creds.webdavPassword,
    key,
    blob,
  );
  return {
    meta,
    conflicts: outcome.conflicts.length,
    pushed,
    pulled,
    staleGenerationRecovered: remote.staleGenerationRecovered,
    cloudAnomaly,
  };
}

interface RowOutcome {
  meta: DatasetMeta;
  uploaded: number;
  downloaded: number;
  skipped: number;
  /** 该行下载时被跳过的记录数（格式不合/单条迁移失败）—— 折进 `verified`。 */
  skippedRecords: number;
  conflicts: number;
  /** 该行是否为合并（两侧都有数据）——用于回报「合并 N 张表」。 */
  merged: boolean;
  /** 该行是否按 ZIP 自述自愈了云端 meta 代际陈旧（本地为空时的 R2 修正路径）。 */
  staleRecovered: boolean;
  /** 该行云端声明计数 ≠ ZIP 实际内容（质疑并按实际纠错）。 */
  cloudAnomaly?: string;
}

/** 按预检方向执行单表；方向语义见 `@/provider/webdav/plan` 的 `buildPreview`。 */
async function applyRow(
  creds: WebDAVCredentials,
  row: SyncPlanRow,
  tracker: WriteTracker,
  localMap: Map<string, DatasetMeta>,
  remoteMap: Map<string, DatasetMeta>,
): Promise<RowOutcome> {
  const key = row.key;
  const fallback = () => localMap.get(key) ?? remoteMap.get(key) ?? placeholderMeta(key);
  const none = {
    uploaded: 0,
    downloaded: 0,
    skipped: 0,
    skippedRecords: 0,
    conflicts: 0,
    merged: false,
    staleRecovered: false,
  };

  if (row.direction === 'skip') {
    return { ...none, meta: fallback(), skipped: 1 };
  }

  if (row.direction === 'merge') {
    const { meta, conflicts, pushed, pulled, staleGenerationRecovered, cloudAnomaly } =
      await mergeDatasetRow(
        creds,
        key,
        tracker,
        remoteMap.get(key)?.hash,
        remoteMap.get(key)?.recordCount,
      );
    return {
      ...none,
      meta,
      uploaded: pushed,
      downloaded: pulled,
      conflicts,
      merged: true,
      staleRecovered: staleGenerationRecovered,
      cloudAnomaly,
    };
  }

  if (row.direction === 'upload') {
    const entries = await mediaDB.getAll(key);
    const { blob, meta } = await packageDataset(key, entries);
    await WebDAV.uploadDataset(
      creds.webdavUrl,
      creds.webdavUsername,
      creds.webdavPassword,
      key,
      blob,
    );
    return { ...none, meta, uploaded: entries.length };
  }

  const { total, skipped, staleGenerationRecovered } = await downloadDatasetIntoStore(
    creds,
    key,
    'sync',
    tracker.writtenStores,
    tracker.writtenKeys,
    remoteMap.get(key)?.hash,
  );
  // 下载方向必须沿用远端真实 meta（含 hash），否则下一次预检的 hash 比对会失真。
  return {
    ...none,
    meta: remoteMap.get(key) ?? placeholderMeta(key),
    downloaded: total,
    skippedRecords: skipped,
    staleRecovered: staleGenerationRecovered,
  };
}

/**
 * WEBDAV_SYNC — 并集合并：预检指纹校验 → 逐表执行 → 回写 meta → 计数复核
 */
export async function handleWebDAVSync(
  payload: { expectedFingerprint?: string } | undefined,
  sendResponse: SendResponse,
) {
  if (!tryAcquireWebdavWrite()) {
    sendResponse({
      success: false,
      error: 'WRITE_IN_PROGRESS',
      message: '另一个 WebDAV 写操作正在进行，已拒绝本次同步',
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

    const { preview, fingerprint, localMeta, remoteMeta } = await computePreview(creds, 'sync');

    // TOCTOU：预检之后任何一侧被改写都会让指纹变化 —— 立即中止，零写入。
    if (payload?.expectedFingerprint && payload.expectedFingerprint !== fingerprint) {
      sendResponse({
        success: false,
        error: 'STALE_PLAN',
        message: '数据在预检后已变化，已中止同步（未写入任何数据），请重新预检',
        errorCode: 'STALE_PLAN',
      });
      return;
    }

    const localMap = new Map(localMeta.datasets.map((d) => [d.key, d]));
    const remoteMap = new Map((remoteMeta?.datasets ?? []).map((d) => [d.key, d]));

    let uploaded = 0;
    let downloaded = 0;
    let skipped = 0;
    let mergeConflicts = 0;
    let mergedTables = 0;
    let dropped = 0;
    let rowFailures = 0;
    let skippedRecords = 0;
    const staleRecoveredNames: string[] = [];
    const cloudAnomalies: string[] = [];
    const resultingMetas: DatasetMeta[] = [];
    const tracker: WriteTracker = { writtenStores: new Set(), writtenKeys: new Map() };

    for (const row of preview.rows) {
      const key = row.key;

      // __settings__ 是我方虚拟数据集（ADR-016），不是 R4 要防的恶意/异构键：不参与
      // 合并（skipKeys 强制 skip），但其 meta 条目必须**保留** —— 此前 R4 白名单把它
      // 当「非备份数据集」丢弃，每次同步都会把设置备份从远端 meta 抹掉，下载侧自此
      // 不再恢复设置（直到下次上传才回来）。保留**远端**条目（如实描述服务器上仍
      // 存在的 blob）；远端从未备份过设置时记 0 占位（诚实表示「云端没有这份数据」，
      // 与上传路径的 emptyMeta 口径一致），不得推本地条目 —— 那会声称一个不存在的 blob。
      if (key === SETTINGS_DATASET_KEY) {
        resultingMetas.push(remoteMap.get(key) ?? placeholderMeta(key));
        skipped += 1;
        continue;
      }

      // 安全边界（R4）：远端 dataset 键可被恶意/异构 WebDAV 服务端伪造。非备份 store
      // 既不写入本地表，也**不再回写进新 meta** —— 否则脏键会被永久保留在远端 meta 里。
      if (!BACKUP_STORES.includes(key as RecordStoreName)) {
        errorLog(`WebDAV sync dropped dataset '${key}': not a known backup store`);
        dropped += 1;
        continue;
      }

      try {
        const outcome = await applyRow(creds, row, tracker, localMap, remoteMap);
        resultingMetas.push(outcome.meta);
        uploaded += outcome.uploaded;
        downloaded += outcome.downloaded;
        skipped += outcome.skipped;
        mergeConflicts += outcome.conflicts;
        skippedRecords += outcome.skippedRecords;
        if (outcome.merged) mergedTables += 1;
        if (outcome.staleRecovered) staleRecoveredNames.push(key);
        if (outcome.cloudAnomaly) cloudAnomalies.push(`${key}（${outcome.cloudAnomaly}）`);
      } catch (dsErr: unknown) {
        errorLog(`WebDAV sync skipped dataset '${key}': ${errorMessage(dsErr)}`);
        // 写失败时**不能推本地 meta**：那会让远端 meta 声称 blob 已更新（而它没有），
        // 于是下一次预检按旧 hash 比对会以为「无变化」而永不重试。推远端侧 meta
        // （远端没有该表时用空占位，如实表示「云端没有这份数据」）才与 blob 的真实
        // 内容一致；本地领先的部分留给下一次同步收敛（并集幂等，不会丢）。
        resultingMetas.push(remoteMap.get(key) ?? placeholderMeta(key));
        rowFailures += 1;
      }
    }

    await WebDAV.createDirectory(creds.webdavUrl, creds.webdavUsername, creds.webdavPassword);
    await WebDAV.uploadMeta(creds.webdavUrl, creds.webdavUsername, creds.webdavPassword, {
      schema: 'umm-meta',
      version: 1,
      generatedAt: new Date().toISOString(),
      datasets: resultingMetas,
    });

    flushStoreCacheInvalidations(tracker.writtenStores, tracker.writtenKeys);
    // `verified` 的语义 = 「本次写操作完整落地」：任一行写入失败、或有记录因格式不合
    // 被跳过，即未通过 —— 与远端 meta 是否等于我们推送的内容（元数据级复核）两者取与。
    const verified =
      rowFailures === 0 && skippedRecords === 0 && (await verifyRemoteMeta(creds, resultingMetas));

    const parts: string[] = [];
    if (uploaded > 0) parts.push(`上传 ${uploaded} 条`);
    if (downloaded > 0) parts.push(`下载 ${downloaded} 条`);
    if (mergedTables > 0) parts.push(`合并 ${mergedTables} 张表`);
    if (skipped > 0) parts.push(`${skipped} 个数据集无变化`);
    if (staleRecoveredNames.length > 0)
      parts.push(
        `${staleRecoveredNames.length} 张表按 ZIP 自述恢复（云端 meta 代际陈旧，已自愈：${staleRecoveredNames.join('、')}；下次上传将收敛 meta）`,
      );
    if (cloudAnomalies.length > 0)
      parts.push(
        `云端数据存疑（声明计数与实际不符，已按实际内容合并并纠错 meta）：${cloudAnomalies.join('；')}`,
      );
    if (mergeConflicts > 0) parts.push(`${mergeConflicts} 条同时刻冲突保留本地`);
    if (dropped > 0) parts.push(`${dropped} 个非备份数据集已丢弃`);
    if (skippedRecords > 0) parts.push(`${skippedRecords} 条记录被跳过（格式不合）`);
    if (rowFailures > 0)
      parts.push(`${rowFailures} 张表写入失败（已跳过，云端保持原状；可用「上传」以本机为准收敛）`);
    if (!verified) parts.push('完整性复核未通过');
    const msg = parts.length > 0 ? parts.join('，') : '所有数据集均无变化';

    broadcast('sync:completed', {
      direction: 'merge',
      uploaded,
      downloaded,
      skipped,
      mergedTables,
      verified,
    });
    sendResponse({
      success: true,
      direction: 'merge',
      message: msg,
      uploaded,
      downloaded,
      skipped,
      mergedTables,
      verified,
      mergeConflicts,
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    errorLog('WebDAV sync failed:', err);
    sendResponse({
      success: false,
      error: errorMessage(err),
      message: (err as Error)?.message || '同步失败',
    });
  } finally {
    releaseWebdavWrite();
  }
}
