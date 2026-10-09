/**
 * WEBDAV_PREVIEW —— 只读预检（ADR-027）。
 *
 * 由本地 meta 与远端 meta 推导逐表计划与计划指纹，**不写任何本地/远端数据**。
 * 本地 meta 的构造是唯一事实源 `BACKUP_STORES`：此前同步链路手写枚举
 * （7 平台表 + jav_ids）与备份白名单分叉，导致 usav_ids / sehuatang_ids
 * 两张用户数据表经同步永不参与（ADR-025 的「派生自动纳入」假设对同步不成立）。
 */

import type { DatasetMeta, RemoteMeta, SyncPlanMode, SyncPreview } from '@/types';
import { mediaDB, BACKUP_STORES } from '@/engine/database/models';
import * as WebDAV from '@/provider/webdav/api';
import { calculateStoreHash } from '@/libraries/utils/hash-utils';
import { CURRENT_DATASET_VERSION } from '@/libraries/utils/dataset-version';
import { errorMessage, type SendResponse } from '@/libraries/utils/error-message';
import { errorLog } from '@/libraries/utils/logger';
import { buildPreview, fingerprintPlan } from '@/provider/webdav/plan';
import {
  getWebDAVSettings,
  SETTINGS_DATASET_KEY,
  collectBackupSettings,
  calculateSettingsHash,
  type WebDAVCredentials,
} from './webdav-settings';

/**
 * 不参与合并的虚拟数据集键：其内容是标量 JSON 而非 StoreRecord，
 * 走合并路径会破坏数据（ADR-016 决策 5）。
 */
export const NON_MERGEABLE_KEYS: ReadonlySet<string> = new Set([SETTINGS_DATASET_KEY]);

/** 合法的预检模式白名单（信任边界校验的唯一事实源）。 */
const SYNC_PLAN_MODES: readonly SyncPlanMode[] = ['sync', 'upload', 'download'];

/**
 * 本地 meta 快照 —— 覆盖 `BACKUP_STORES` 全量（含空表，保持两侧数据集集合对称），
 * 外加 `__settings__` 虚拟条目。
 */
export async function buildLocalMeta(): Promise<RemoteMeta> {
  const datasets: DatasetMeta[] = [];
  for (const storeName of BACKUP_STORES) {
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
      dataVersion: CURRENT_DATASET_VERSION,
    });
  }

  const localSettings = collectBackupSettings();
  const settingsHash = await calculateSettingsHash(localSettings);
  datasets.push({
    key: SETTINGS_DATASET_KEY,
    hash: settingsHash,
    updatedAt: new Date().toISOString(),
    recordCount: Object.keys(localSettings).length,
    dataVersion: CURRENT_DATASET_VERSION,
  });

  return {
    schema: 'umm-meta',
    version: 1,
    generatedAt: new Date().toISOString(),
    datasets,
  };
}

export interface PreviewBundle {
  preview: SyncPreview;
  fingerprint: string;
  localMeta: RemoteMeta;
  remoteMeta: RemoteMeta | null;
}

/** 只读计算「本地 vs 远端」计划与指纹；调用方负责判定是否执行。 */
export async function computePreview(
  creds: WebDAVCredentials,
  mode: SyncPlanMode,
): Promise<PreviewBundle> {
  const localMeta = await buildLocalMeta();
  const remoteMeta = await WebDAV.fetchRemoteMeta(
    creds.webdavUrl,
    creds.webdavUsername,
    creds.webdavPassword,
  );
  const preview = buildPreview(localMeta, remoteMeta, mode, { skipKeys: NON_MERGEABLE_KEYS });
  // 无含义的时间戳已在 buildPreview 收敛为空串（单一规则），指纹直接取用即可。
  const fingerprint = await fingerprintPlan(preview);
  return { preview, fingerprint, localMeta, remoteMeta };
}

/** WEBDAV_PREVIEW —— 返回逐表计划与指纹，供 UI 渲染确认框。 */
export async function handleWebDAVPreview(
  payload: { mode?: SyncPlanMode } | undefined,
  sendResponse: SendResponse,
) {
  try {
    const creds = await getWebDAVSettings();
    if (!creds.webdavUrl) {
      sendResponse({ success: false, error: 'WebDAV URL not configured' });
      return;
    }
    // 信任边界：payload 是外部输入。`buildPreview` 对未知模式会落进 else（= download
    // 语义），不校验就是 fail-open —— 非法值必须显式拒绝，而不是被当成某个合法模式。
    const requested = payload?.mode ?? 'sync';
    if (!SYNC_PLAN_MODES.includes(requested)) {
      errorLog(`WebDAV preview rejected unsupported mode: ${String(requested)}`);
      sendResponse({
        success: false,
        error: 'INVALID_MODE',
        message: `不支持的预检模式：${String(requested)}`,
      });
      return;
    }
    const { preview, fingerprint } = await computePreview(creds, requested);
    sendResponse({ success: true, preview, fingerprint });
  } catch (err: unknown) {
    sendResponse({
      success: false,
      error: errorMessage(err),
      message: (err as Error)?.message || '预检失败',
    });
  }
}

/**
 * 执行后复核：远端 meta 是否包含全部预期数据集且计数一致。
 * 只做「落盘是否成功」级别断言（不重算内容哈希），失败即回报 `verified: false`。
 * 放在本模块（只读检查的家）：它是纯读操作，被 sync 与 upload 两条写路径共用。
 */
export async function verifyRemoteMeta(
  creds: WebDAVCredentials,
  expected: DatasetMeta[],
): Promise<boolean> {
  try {
    const actual = await WebDAV.fetchRemoteMeta(
      creds.webdavUrl,
      creds.webdavUsername,
      creds.webdavPassword,
    );
    if (!actual) return false;
    const actualMap = new Map(actual.datasets.map((d) => [d.key, d]));
    for (const ds of expected) {
      const got = actualMap.get(ds.key);
      if (!got || got.recordCount !== ds.recordCount) return false;
    }
    return true;
  } catch (err: unknown) {
    errorLog('WebDAV write-path verification failed:', err);
    return false;
  }
}
