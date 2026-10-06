/**
 * WebDAV e2e 共享桩与夹具（ADR-027 波次；X110/X111 共用）。
 *
 * 为什么需要它：两个 spec 都要「内存 WebDAV + ZIP 夹具 + 类型化消息驱动」，
 * 复制一份就违反 DRY，而 e2e 域内共享件的家是 `tests/e2e/fixtures/`
 * （见 host-mocks.ts / douban-live-record.ts 的先例）。同时把两个 spec 各自压到
 * <=600 行（size:check 棘轮）。
 *
 * 桩的 URL 形状必须与 `provider/webdav/api.ts` 对齐：
 *   `${base}/umm-data/meta.json` 与 `${base}/umm-data/<sha256(key)[0:16]>.zip`
 */

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { BrowserContext, Page } from '@playwright/test';
import type { DatasetMeta, RemoteMeta } from '@/types';
import { hashKeyToFilename } from '@/provider/webdav/mapping';
import { makeStoreRecord } from './extension-harness';

export const DAV_URL = 'https://webdav.e2e.test/dav/';
export const DOUBAN = 'douban_records';
export const IMDB = 'imdb_records';
export const TMDB = 'tmdb_records';
export const YOUTUBE = 'youtube_records';
export const BANGUMI = 'bangumi_records';
export const TTL_CACHE = 'ttl_cache';
export const SETTINGS_KEY = '__settings__';

/** EN|zh 双匹配（测试浏览器语言未固定，错标签必须显式失败而不是静默命中空集）。 */
export const label = (en: string, zh: string): RegExp => new RegExp(`${en}|${zh}`);

// ==================== 内存 WebDAV ====================

/**
 * dataset 在远端的文件名 —— **唯一事实源**（对齐 `api.ts` 的 `datasetUrl`：
 * `<sha256(storedKey)[0:16]>.zip`）。原子上传的暂存名再追加 `.tmp`。
 * 桩的 `blobs` 键、spec 的断言一律走这里，避免两处各写一遍而漂移。
 */
export async function datasetFileName(storedKey: string): Promise<string> {
  return `${await hashKeyToFilename(storedKey)}.zip`;
}

/** 暂存文件名（原子上传的中间名）。 */
export async function stagingFileName(storedKey: string): Promise<string> {
  return `${await datasetFileName(storedKey)}.tmp`;
}

/** 故障注入钩子（spec 可在运行中改写 `server.faults`，模拟远端不确定性）。 */
export interface DavFaults {
  /** 命中即返回该状态码（在正常处理之前判定）。 */
  statusFor?: (method: string, path: string) => number | null;
  /** 命中即断流（模拟网络中断；SW 侧表现为 fetch 抛错）。 */
  abortFor?: (method: string, path: string) => boolean;
  /** 命中即延迟该毫秒数后响应（模拟慢响应）。 */
  delayMsFor?: (method: string, path: string) => number;
  /** meta.json 的 GET 返回畸形 JSON（模拟被截断/损坏的远端 meta）。 */
  malformedMeta?: boolean;
  /** 每次请求的副作用钩子（用于「执行中途改写」等竞态构造）。 */
  onRequest?: (method: string, path: string) => void;
}

export interface DavServer {
  /** 当前 meta.json（PUT 会覆盖，便于断言「远端最终状态」）。 */
  meta: RemoteMeta | null;
  /** 文件名（含 `.zip` / `.zip.tmp` 后缀）→ 字节（GET 读、PUT 写、MOVE 换名）。 */
  blobs: Map<string, Uint8Array>;
  /** 被 PUT 过的文件名（有序；原子路径下先是 `<hash>.zip.tmp`）。 */
  datasetPuts: string[];
  /** 被 MOVE 过的源名（ADR-027 R2 原子落名的证据）。 */
  moves: string[];
  /** 被 DELETE 过的文件名。 */
  datasetDeletes: string[];
  metaPuts: number;
  /** 可变的故障注入钩子。 */
  faults: DavFaults;
}

export async function installDavServer(
  ctx: BrowserContext,
  initial: {
    meta: RemoteMeta | null;
    datasets?: Record<string, Uint8Array>;
    /** 吞掉 meta PUT（返回 201 但不落盘）—— 用于制造「复核必失败」的远端。 */
    ignoreMetaPut?: boolean;
    /** 不支持 MOVE（返回 405）—— 用于覆盖「降级为直接 PUT」路径。默认支持。 */
    noMoveSupport?: boolean;
    faults?: DavFaults;
  },
): Promise<DavServer> {
  const server: DavServer = {
    meta: initial.meta,
    blobs: new Map(),
    datasetPuts: [],
    moves: [],
    datasetDeletes: [],
    metaPuts: 0,
    faults: initial.faults ?? {},
  };
  for (const [key, bytes] of Object.entries(initial.datasets ?? {})) {
    server.blobs.set(await datasetFileName(key), bytes);
  }

  await ctx.route('https://webdav.e2e.test/**', async (route) => {
    const req = route.request();
    const method = req.method();
    const path = new URL(req.url()).pathname;

    const faults = server.faults;
    faults.onRequest?.(method, path);
    if (faults.abortFor?.(method, path) === true) {
      return route.abort('failed');
    }
    const delayMs = faults.delayMsFor?.(method, path) ?? 0;
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    const forced = faults.statusFor?.(method, path);
    if (typeof forced === 'number') {
      return route.fulfill({ status: forced, body: 'injected-failure' });
    }

    if (method === 'MKCOL') return route.fulfill({ status: 201, body: '' });
    if (method === 'PROPFIND') {
      return route.fulfill({
        status: 207,
        contentType: 'application/xml; charset=utf-8',
        body: '<?xml version="1.0"?><d:multistatus xmlns:d="DAV:"></d:multistatus>',
      });
    }

    if (path.endsWith('/meta.json')) {
      if (method === 'GET') {
        if (!server.meta) return route.fulfill({ status: 404, body: '' });
        return route.fulfill({
          status: 200,
          contentType: 'application/json; charset=utf-8',
          body: faults.malformedMeta
            ? '{"schema":"umm-meta","datasets":[{'
            : JSON.stringify(server.meta),
        });
      }
      if (method === 'PUT') {
        const raw = req.postDataBuffer();
        // ignoreMetaPut：把 PUT 变成「假成功」（201 但保持旧 meta）——
        // 让写后复核读到与写入不符的计数，从而可判定 verified=false 真的可达。
        if (!initial.ignoreMetaPut) {
          server.meta = JSON.parse(raw ? raw.toString('utf8') : '{}') as RemoteMeta;
        }
        server.metaPuts += 1;
        return route.fulfill({ status: 201, body: '' });
      }
    }

    // dataset 名 = 16 位 hex + `.zip`，原子路径的暂存名再带 `.tmp`。
    const blobMatch = /\/umm-data\/([0-9a-f]{16}\.zip(?:\.tmp)?)$/.exec(path);
    const filename = blobMatch?.[1];
    if (filename) {
      if (method === 'GET') {
        const bytes = server.blobs.get(filename);
        if (!bytes) return route.fulfill({ status: 404, body: '' });
        return route.fulfill({
          status: 200,
          contentType: 'application/zip',
          body: Buffer.from(bytes),
        });
      }
      if (method === 'PUT') {
        const raw = req.postDataBuffer();
        server.blobs.set(filename, new Uint8Array(raw ?? Buffer.alloc(0)));
        server.datasetPuts.push(filename);
        return route.fulfill({ status: 201, body: '' });
      }
      if (method === 'DELETE') {
        server.blobs.delete(filename);
        server.datasetDeletes.push(filename);
        return route.fulfill({ status: 204, body: '' });
      }
      if (method === 'MOVE') {
        if (initial.noMoveSupport) {
          return route.fulfill({ status: 405, body: 'MOVE not allowed' });
        }
        const destination = req.headers()['destination'];
        const target = destination?.split('/').pop();
        const payload = server.blobs.get(filename);
        if (target && payload) {
          server.blobs.set(target, payload);
          server.blobs.delete(filename);
        }
        server.moves.push(filename);
        return route.fulfill({ status: 201, body: '' });
      }
    }

    return route.fulfill({ status: 405, body: '' });
  });

  return server;
}

// ==================== 数据夹具 ====================

export function remoteRecord(id: string, updatedAt: string): Record<string, unknown> {
  return {
    url: `https://movie.douban.com/subject/${id}/`,
    status: 2,
    rating: 8,
    comment: `remote-${id}`,
    updatedAt,
    linkedIds: {},
  };
}

/** 远端 dataset 的 ZIP（data.json + meta.json），版本可注入以测版本门禁。 */
export function datasetZip(records: Record<string, unknown>, dataVersion = 1): Uint8Array {
  return zipSync({
    'data.json': strToU8(JSON.stringify(records, null, 2)),
    'meta.json': strToU8(
      JSON.stringify({
        key: 'stub',
        hash: 'stub-hash',
        updatedAt: '2026-01-01T00:00:00.000Z',
        recordCount: Object.keys(records).length,
        dataVersion,
      }),
    ),
  });
}

/** `<prefix>1..count` 形态的远端记录集合。 */
export function manyRemote(
  prefix: string,
  count: number,
  updatedAt: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (let i = 1; i <= count; i++) {
    out[`movie::${prefix}${i}`] = remoteRecord(`${prefix}${i}`, updatedAt);
  }
  return out;
}

export function metaEntry(
  key: string,
  recordCount: number,
  hash: string,
  updatedAt: string,
): DatasetMeta {
  return { key, hash, updatedAt, recordCount, dataVersion: 1 };
}

export function metaOf(datasets: DatasetMeta[]): RemoteMeta {
  return { schema: 'umm-meta', version: 1, generatedAt: '2026-01-01T00:00:00.000Z', datasets };
}

/** 解包一个 dataset ZIP 并返回其记录数 —— 「落盘了什么」的可判定证据。 */
export function zipRecordCount(bytes: Uint8Array): number {
  const files = unzipSync(bytes);
  const dataFile = files['data.json'];
  if (!dataFile) throw new Error('uploaded dataset has no data.json');
  return Object.keys(JSON.parse(strFromU8(dataFile)) as Record<string, unknown>).length;
}

// ==================== 类型化消息驱动 ====================

export interface PreviewRow {
  key: string;
  localCount: number;
  remoteCount: number;
  /** 计数为 0 或非合并数据集（如 `__settings__`）时为空串（无含义的时间戳不透出）。 */
  localLatest: string;
  remoteLatest: string;
  hashEqual: boolean;
  direction: string;
  lossEstimate: number;
  orphansRemote: boolean;
  revertsNewer: boolean;
}

export interface PreviewReply {
  success?: boolean;
  error?: string;
  message?: string;
  fingerprint?: string;
  preview?: { mode: string; rows: PreviewRow[]; totals: Record<string, number> };
}

export interface OpReply {
  success?: boolean;
  error?: string;
  errorCode?: string;
  message?: string;
  verified?: boolean;
  uploaded?: number;
  downloaded?: number;
  totalDownloaded?: number;
  mergeConflicts?: number;
}

export interface EntriesReply {
  success?: boolean;
  error?: string;
  message?: string;
  entries?: Array<{ key: string; record: Record<string, unknown> }>;
}

export async function send<T>(page: Page, type: string, payload?: unknown): Promise<T> {
  return (await page.evaluate(
    ({ type, payload }) => chrome.runtime.sendMessage({ type, payload }) as Promise<unknown>,
    { type, payload },
  )) as T;
}

export async function seed(page: Page, storeName: string, key: string): Promise<void> {
  const res = await send<{ success?: boolean }>(page, 'DB_PUT', {
    storeName,
    key,
    record: makeStoreRecord(`https://movie.douban.com/subject/${key}/`, 2, 8),
  });
  // 测试断言不引第三方 expect：这里只做「不成功就抛」的硬失败。
  if (!res.success) throw new Error(`DB_PUT ${storeName}/${key} failed`);
}

export async function storeKeys(page: Page, storeName: string): Promise<string[]> {
  const res = await send<EntriesReply>(page, 'DB_GET_ALL', { storeName });
  if (!res.success) throw new Error(`DB_GET_ALL ${storeName} failed: ${res.error ?? 'unknown'}`);
  return (res.entries ?? []).map((e) => e.key);
}

/**
 * 只读预检并断言成功。失败即抛（带上后台 message/error），避免把「预检静默失败」
 * 误当成「计划为空」。
 */
export async function preview(page: Page, mode: string): Promise<PreviewReply> {
  const res = await send<PreviewReply>(page, 'WEBDAV_PREVIEW', { mode });
  if (!res.success) {
    throw new Error(`预检失败：${res.message ?? res.error ?? '未知'}`);
  }
  return res;
}
