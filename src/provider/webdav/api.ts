/**
 * WebDAV transport — HTTP protocol layer.
 *
 * ==================== UTF-8 encoding policy ====================
 * 1. Basic Auth: username:password encoded as UTF-8 bytes before btoa()
 * 2. JSON payloads: serialised as UTF-8 bytes, Content-Type includes charset
 * 3. URL paths: store names pass through encodeURIComponent for non-ASCII safety
 * 4. ZIP blobs: binary transfer, charset not applicable
 * ==============================================================
 *
 * Internal seam (ADR-026 req-9): this file is transport-only — URLs, headers,
 * fetch, status→error mapping. Pure rules (URL normalization, credential
 * stripping, key→filename hash, meta payload normalization) live in
 * `./mapping.ts`; the stable public surface is `./index.ts`.
 * No Store/IndexedDB dependency — receives data, returns data.
 * Orchestration happens in background.ts handlers.
 */

import type { RemoteMeta } from '@/types';
import { errorMessage } from '@/libraries/utils/error-message';
import { warnLog } from '@/libraries/utils/logger';
import {
  hashKeyToFilename,
  normalizeRemoteMetaPayload,
  normalizeUrl,
  stripUrlCredentials,
} from './mapping';

const WEBDAV_TIMEOUT = 30_000;

// ==================== Auth helpers ====================

function basicAuth(username: string, password: string): string {
  // btoa() throws on non-Latin1 chars; encode as UTF-8 first for full Unicode support
  const encoder = new TextEncoder();
  const bytes = encoder.encode(`${username}:${password}`);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return 'Basic ' + btoa(binary);
}

function authHeaders(username: string, password: string): Record<string, string> {
  return { Authorization: basicAuth(username, password) };
}

// ==================== HTTP helpers ====================

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout = WEBDAV_TIMEOUT,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (err: unknown) {
    clearTimeout(timer);
    if (err instanceof DOMException && err.name === 'AbortError') {
      // Never surface userinfo (user:pass@) embedded in the URL to logs (CWE-532).
      throw new Error(`WebDAV timeout after ${timeout}ms: ${stripUrlCredentials(url)}`);
    }
    throw err;
  }
}

// ==================== URL composition ====================

const BASE_PATH = 'umm-data';

function metaUrl(baseUrl: string): string {
  return `${normalizeUrl(baseUrl)}/${BASE_PATH}/meta.json`;
}

function datasetUrl(baseUrl: string, filename: string): string {
  // filename is already a safe hash string, no encoding needed
  return `${normalizeUrl(baseUrl)}/${BASE_PATH}/${filename}.zip`;
}

// ==================== Public API ====================

/** Test WebDAV connection — PROPFIND on base path */
export async function testConnection(
  baseUrl: string,
  username: string,
  password: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    const url = normalizeUrl(baseUrl);
    const res = await fetchWithTimeout(
      url,
      {
        method: 'PROPFIND',
        headers: { ...authHeaders(username, password), Depth: '0' },
      },
      15_000,
    );
    if (res.status >= 200 && res.status < 300) {
      return { ok: true, message: 'Connected' };
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: 'Authentication failed (401/403)' };
    }
    return { ok: false, message: `HTTP ${res.status}` };
  } catch (err: unknown) {
    return { ok: false, message: errorMessage(err) };
  }
}

/** Fetch remote meta.json — returns null if not found */
export async function fetchRemoteMeta(
  baseUrl: string,
  username: string,
  password: string,
): Promise<RemoteMeta | null> {
  const url = metaUrl(baseUrl);
  const res = await fetchWithTimeout(url, {
    method: 'GET',
    headers: {
      ...authHeaders(username, password),
      Accept: 'application/json; charset=utf-8',
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to fetch meta: HTTP ${res.status}`);

  // Read as text then parse for full UTF-8 control (bypass auto-charset detection)
  const text = await res.text();
  // Old→new format normalization policy lives in the pure seam (mapping.ts).
  return normalizeRemoteMetaPayload(JSON.parse(text));
}

/** Upload meta.json to WebDAV — UTF-8 encoded JSON */
export async function uploadMeta(
  baseUrl: string,
  username: string,
  password: string,
  meta: RemoteMeta,
): Promise<void> {
  const url = metaUrl(baseUrl);
  const jsonBytes = new TextEncoder().encode(JSON.stringify(meta));
  const res = await fetchWithTimeout(url, {
    method: 'PUT',
    headers: {
      ...authHeaders(username, password),
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: jsonBytes,
  });
  if (!res.ok) throw new Error(`Failed to upload meta: HTTP ${res.status}`);
}

/** Create WebDAV directory (MKCOL) */
export async function createDirectory(
  baseUrl: string,
  username: string,
  password: string,
): Promise<void> {
  const url = `${normalizeUrl(baseUrl)}/${BASE_PATH}`;
  const res = await fetchWithTimeout(url, {
    method: 'MKCOL',
    headers: authHeaders(username, password),
  });
  // 405 = already exists, that's fine
  if (res.status !== 405 && !res.ok) {
    throw new Error(`Failed to create directory: HTTP ${res.status}`);
  }
}

/** 暂存后缀：原子上传路径先写 `<file>.tmp` 再 MOVE 到最终名（ADR-027 R2）。 */
const STAGING_SUFFIX = '.tmp';

/**
 * 「MOVE 对我们不可用」的状态码集合 —— 命中即降级为直接 PUT：
 * 403/401 无权、405/501 未实现、400/502 服务端或代理不接受该请求形态、
 * 409 冲突（坚果云真机实证：MOVE 一律 409，直传 PUT 正常 —— 旧版从不 MOVE
 * 故从未暴露；`putBlobWithMkcol` 已兜底「父集合缺失型 409」）。
 */
const MOVE_UNUSABLE_STATUSES: ReadonlySet<number> = new Set([400, 401, 403, 405, 409, 501, 502]);

/** PUT 一个 blob；遇 409（父集合不存在）先建目录再重试一次。 */
async function putBlobWithMkcol(
  url: string,
  headers: Record<string, string>,
  blob: Blob,
  baseUrl: string,
  username: string,
  password: string,
): Promise<Response> {
  const res = await fetchWithTimeout(url, { method: 'PUT', headers, body: blob });
  if (res.status !== 409) return res;
  await createDirectory(baseUrl, username, password);
  return fetchWithTimeout(url, { method: 'PUT', headers, body: blob });
}

/**
 * Upload a dataset ZIP blob — key is hashed to safe filename.
 *
 * ADR-027 R2：**先 PUT 到 `<file>.tmp`，再 MOVE 到最终名**。PUT 是原地覆盖，
 * 一旦中断/失败就把既有 blob 写成半截 ZIP（读侧整表报错）；经临时名切换后，最终名
 * 在任何时刻要么是完整的旧内容、要么是完整的新内容。
 *
 * MOVE 不可用时降级为直接 PUT（与服务端能力对齐，而不是让备份永久失败）：
 * 401/403（无权 MOVE）、405/501（未实现）、**400/502**（服务端不接受我们这种
 * Destination 形态或经由代理失败 —— 无法与「真的坏请求」区分，而降级严格比让
 * 备份永久失败更安全，`warnLog` 保留可诊断性）。
 *
 * 硬失败（网络中断、MOVE 5xx 之外的服务端错误）会**留下 `<file>.tmp` 暂存文件**：
 * 最终名保持旧内容（这正是原子性的目的），孤儿暂存会在下一次上传同名 store 时被覆盖。
 */
export async function uploadDataset(
  baseUrl: string,
  username: string,
  password: string,
  key: string,
  blob: Blob,
): Promise<void> {
  const filename = await hashKeyToFilename(key);
  const finalUrl = datasetUrl(baseUrl, filename);
  const stagingUrl = `${finalUrl}${STAGING_SUFFIX}`;
  const headers = { ...authHeaders(username, password), 'Content-Type': 'application/zip' };

  const staged = await putBlobWithMkcol(stagingUrl, headers, blob, baseUrl, username, password);
  if (!staged.ok) throw new Error(`Failed to upload dataset (staging): HTTP ${staged.status}`);

  const moved = await fetchWithTimeout(stagingUrl, {
    method: 'MOVE',
    headers: { ...authHeaders(username, password), Destination: finalUrl, Overwrite: 'T' },
  });
  if (moved.ok) return;

  if (!MOVE_UNUSABLE_STATUSES.has(moved.status)) {
    throw new Error(`Failed to finalize dataset: HTTP ${moved.status}`);
  }

  warnLog(
    `[WebDAV] MOVE unavailable (HTTP ${moved.status}) — falling back to in-place PUT ` +
      `for '${key}' (no atomic swap)`,
  );
  // 尽力清掉暂存文件；删不掉也不影响主流程（下次上传会覆盖同名暂存）。
  await fetchWithTimeout(stagingUrl, {
    method: 'DELETE',
    headers: authHeaders(username, password),
  }).catch(() => undefined);

  const direct = await putBlobWithMkcol(finalUrl, headers, blob, baseUrl, username, password);
  if (!direct.ok) throw new Error(`Failed to upload dataset: HTTP ${direct.status}`);
}

/** Download a dataset ZIP blob — key is hashed to safe filename */
export async function downloadDataset(
  baseUrl: string,
  username: string,
  password: string,
  key: string,
): Promise<Blob> {
  const filename = await hashKeyToFilename(key);
  const url = datasetUrl(baseUrl, filename);
  const res = await fetchWithTimeout(url, {
    method: 'GET',
    headers: authHeaders(username, password),
  });
  if (res.status === 404) throw new Error(`Dataset not found: ${key} (${url})`);
  if (!res.ok)
    throw new Error(`Failed to download dataset: HTTP ${res.status} for ${key} (${url})`);
  return res.blob();
}
