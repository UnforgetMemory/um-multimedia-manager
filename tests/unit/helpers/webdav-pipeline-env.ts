/**
 * WebDAV 全链路管线的共享环境装配与调用桩（`webdav-full-pipeline*.spec.ts` 双文件共用）。
 *
 * 为什么抽出来：size:check 单文件 ≤600 行硬门禁。管线按「失败路径 / 自愈与收敛」
 * 拆成两个 spec 文件，但两者共享同一套环境（fake-indexeddb + 真文件系统 WebDAV +
 * settings 绑定）与调用桩 —— 抽到 helpers 一处维护，避免双文件漂移。
 */

import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { zipSync } from 'fflate';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startLiveDav, type LiveDav } from './webdav-live-server';
import { handleWebDAVPreview } from '@/entrypoints/background/handlers/webdav-preview';
import { handleWebDAVUpload, handleWebDAVDownload } from '@/entrypoints/background/handlers/webdav';
import { handleWebDAVSync } from '@/entrypoints/background/handlers/webdav-sync';
import { mediaDB } from '@/engine/database/models';
import type { DatasetMeta, RecordStoreName, StoreRecord } from '@/types';
import { packageDataset } from '@/libraries/utils/zip-utils';
import { CURRENT_DATASET_VERSION } from '@/libraries/utils/dataset-version';
import { calculateStoreHash } from '@/libraries/utils/hash-utils';
import * as WebDAV from '@/provider/webdav/api';
import { __bindSettingsAreaForTests } from '@/engine/settings/items';
import { settingsCache } from '@/engine/settings/cache';
import type { SendResponse } from '@/libraries/utils/error-message';

// ==================== 用户云端矩阵（2026-10-05 预览截图实测值） ====================

export const CLOUD_MATRIX: ReadonlyArray<readonly [string, number]> = [
  ['douban_records', 15018],
  ['jav_ids', 9668],
  ['bilibili_records', 1851],
  ['imdb_records', 789],
  ['neodb_records', 1233],
  ['tmdb_records', 117],
  ['youtube_records', 31],
  ['bangumi_records', 2],
];
export const TOTAL_CLOUD_RECORDS = CLOUD_MATRIX.reduce((sum, [, n]) => sum + n, 0); // 28709

export const USER = 'um-deep';
export const PASS = 'deep-pass';
/** URL 在 setup 时注入（live server 端口动态）。 */
export const CREDS = { webdavUrl: '', webdavUsername: USER, webdavPassword: PASS };

/** 12 个导出设置（对齐用户对话框「设置 12」）。 */
const SETTINGS_SEED: Record<string, unknown> = {
  autoSync: false,
  autoSyncNeoDB: false,
  syncInterval: 30,
  theme: 'auto',
  language: 'zh-CN',
  notificationEnabled: true,
  appearance: 'auto',
  accentColor: '#3b82f6',
  grayColor: '#6b7280',
  debugEnabled: false,
  logLevel: 'info',
  sehuatangHideViewed: true,
};

/** 确定性种子记录；i % 997 === 0 带遗留 schemaVersion 1（验证恢复侧逐条迁移）。 */
export function seedEntry(
  store: string,
  i: number,
  over: Partial<StoreRecord> = {},
): { key: string; record: StoreRecord } {
  const adult = store === 'jav_ids' || store === 'usav_ids' || store === 'sehuatang_ids';
  const key = adult
    ? `TEST-${String(i + 1).padStart(4, '0')}`
    : `${i % 3 === 0 ? 'tv' : 'movie'}::${i + 1}`;
  const record: StoreRecord = {
    url: `https://example.com/${store}/${i + 1}`,
    status: i % 4,
    rating: i % 10 === 0 ? 8 : 0,
    updatedAt: `2026-01-${String((i % 28) + 1).padStart(2, '0')}T10:00:00.000Z`,
    linkedIds: i % 7 === 0 ? { tmdb: `tm-${i + 1}` } : {},
    ...(i % 5 === 0 ? { comment: `c-${store}-${i + 1}` } : {}),
    ...(i % 997 === 996 ? { schemaVersion: 1 } : {}),
    ...over,
  };
  return { key, record };
}

export async function seedStore(
  store: string,
  count: number,
  over?: Partial<StoreRecord>,
): Promise<void> {
  const entries = Array.from({ length: count }, (_, i) => seedEntry(store, i, over));
  await mediaDB.batchPut(store as RecordStoreName, entries);
}

// ==================== 环境与应答捕获 ====================

const ORIGINAL_INDEXEDDB = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
const ORIGINAL_IDB_KEY_RANGE = Object.getOwnPropertyDescriptor(globalThis, 'IDBKeyRange');

function capture<R>(): { promise: Promise<R>; sendResponse: SendResponse } {
  let resolve!: (value: R) => void;
  const promise = new Promise<R>((r) => {
    resolve = r;
  });
  const sendResponse = ((value: unknown) => resolve(value as R)) as SendResponse;
  return { promise, sendResponse };
}

export interface OpReply {
  success: boolean;
  message?: string;
  verified?: boolean;
  totalUploaded?: number;
  totalDownloaded?: number;
  uploaded?: number;
  downloaded?: number;
  skipped?: number;
  mergedTables?: number;
  error?: string;
  errorCode?: string;
}
export interface PreviewReply {
  success: boolean;
  fingerprint?: string;
  preview?: {
    mode: string;
    totals: { upload: number; download: number; merge: number; skip: number };
    rows: Array<{ key: string; direction: string; localCount: number; localLatest: string }>;
  };
}

export async function callPreview(mode: 'upload' | 'download' | 'sync'): Promise<PreviewReply> {
  const { promise, sendResponse } = capture<PreviewReply>();
  await handleWebDAVPreview({ mode }, sendResponse);
  return promise;
}
export async function callUpload(fingerprint: string): Promise<OpReply> {
  const { promise, sendResponse } = capture<OpReply>();
  await handleWebDAVUpload({ expectedFingerprint: fingerprint }, sendResponse);
  return promise;
}
export async function callDownload(fingerprint: string): Promise<OpReply> {
  const { promise, sendResponse } = capture<OpReply>();
  await handleWebDAVDownload({ expectedFingerprint: fingerprint }, sendResponse);
  return promise;
}
export async function callSync(fingerprint: string): Promise<OpReply> {
  const { promise, sendResponse } = capture<OpReply>();
  await handleWebDAVSync({ expectedFingerprint: fingerprint }, sendResponse);
  return promise;
}

export async function currentRemoteMeta(): Promise<
  NonNullable<Awaited<ReturnType<typeof WebDAV.fetchRemoteMeta>>>
> {
  const meta = await WebDAV.fetchRemoteMeta(CREDS.webdavUrl, USER, PASS);
  if (!meta) throw new Error('remote meta missing');
  return meta;
}

/** 换掉远端某表的 ZIP（真传输），返回新 DatasetMeta 供调用方写回 meta.json。 */
export async function replaceRemoteDataset(
  store: string,
  entries: Array<{ key: string; record: StoreRecord }>,
): Promise<DatasetMeta> {
  const { blob, meta } = await packageDataset(store, entries);
  await WebDAV.uploadDataset(CREDS.webdavUrl, USER, PASS, store, blob);
  return meta;
}

/** 手工打包 ZIP（测试注入用）：可伪造内层 manifest 的 hash / dataVersion。 */
export async function handBuildZip(
  entries: Array<{ key: string; record: StoreRecord }>,
  opts: { hash?: string; dataVersion?: number } = {},
): Promise<Uint8Array> {
  const dataObj: Record<string, StoreRecord> = {};
  for (const { key, record } of entries) dataObj[key] = record;
  const encoder = new TextEncoder();
  return zipSync({
    'data.json': encoder.encode(JSON.stringify(dataObj)),
    'meta.json': encoder.encode(
      JSON.stringify({
        key: 'injected',
        hash: opts.hash ?? (await calculateStoreHash(entries)),
        updatedAt: new Date().toISOString(),
        recordCount: entries.length,
        dataVersion: opts.dataVersion ?? CURRENT_DATASET_VERSION,
      }),
    ),
  });
}

// ==================== 环境装配（每个 spec 文件一份；mediaDB 单例绑定一次） ====================

let davRoot = '';
let dav: LiveDav | undefined;

/** beforeAll 体内调用：绑定 fake-indexeddb + 真 WebDAV server + settings 内存区。 */
export async function setupWebdavPipelineEnv(): Promise<void> {
  const g = globalThis as unknown as { indexedDB?: IDBFactory; IDBKeyRange?: typeof IDBKeyRange };
  g.indexedDB = new IDBFactory();
  g.IDBKeyRange = IDBKeyRange;

  davRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'umm-webdav-pipeline-'));
  dav = await startLiveDav(davRoot, { auth: { user: USER, pass: PASS } });
  CREDS.webdavUrl = dav.baseUrl;

  const backing = new Map<string, unknown>(
    Object.entries({
      ...SETTINGS_SEED,
      webdavUrl: CREDS.webdavUrl,
      webdavUsername: USER,
      webdavPassword: PASS,
    }),
  );
  __bindSettingsAreaForTests({
    get: async (keys) => {
      const out: Record<string, unknown> = {};
      const list = keys === null ? [...backing.keys()] : Array.isArray(keys) ? keys : [keys];
      for (const k of list) if (backing.has(k)) out[k] = backing.get(k);
      return out;
    },
    set: async (items) => {
      for (const [k, v] of Object.entries(items)) backing.set(k, v);
    },
    remove: async (keys) => {
      for (const k of Array.isArray(keys) ? keys : [keys]) backing.delete(k);
    },
  });
  await settingsCache.init();
}

/** afterAll 体内调用：释放 server / settings 绑定 / globalThis 桩。 */
export async function teardownWebdavPipelineEnv(): Promise<void> {
  await dav?.close();
  dav = undefined;
  __bindSettingsAreaForTests(undefined);
  if (davRoot) fs.rmSync(davRoot, { recursive: true, force: true });
  davRoot = '';
  const g = globalThis as unknown as { indexedDB?: unknown; IDBKeyRange?: unknown };
  if (ORIGINAL_INDEXEDDB) Object.defineProperty(globalThis, 'indexedDB', ORIGINAL_INDEXEDDB);
  else delete g.indexedDB;
  if (ORIGINAL_IDB_KEY_RANGE)
    Object.defineProperty(globalThis, 'IDBKeyRange', ORIGINAL_IDB_KEY_RANGE);
  else delete g.IDBKeyRange;
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** live server 的文件根目录（盘面断言用：无暂存残留 / 最终名清单）。 */
export function getDavRoot(): string {
  return davRoot;
}
