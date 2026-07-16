/**
 * WebDAV client — pure HTTP + ZIP operations
 *
 * ==================== UTF-8 encoding policy ====================
 * 1. Basic Auth: username:password encoded as UTF-8 bytes before btoa()
 * 2. JSON payloads: serialised as UTF-8 bytes, Content-Type includes charset
 * 3. URL paths: store names pass through encodeURIComponent for non-ASCII safety
 * 4. ZIP blobs: binary transfer, charset not applicable
 * ==============================================================
 *
 * No Store/IndexedDB dependency — receives data, returns data.
 * Orchestration happens in background.ts handlers.
 */

import type { RemoteMeta } from '@/types'

const WEBDAV_TIMEOUT = 30_000

// ==================== Auth helpers ====================

function basicAuth(username: string, password: string): string {
  // btoa() throws on non-Latin1 chars; encode as UTF-8 first for full Unicode support
  const encoder = new TextEncoder()
  const bytes = encoder.encode(`${username}:${password}`)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return 'Basic ' + btoa(binary)
}

function authHeaders(username: string, password: string): Record<string, string> {
  return { Authorization: basicAuth(username, password) }
}

// ==================== HTTP helpers ====================

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout = WEBDAV_TIMEOUT
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const res = await fetch(url, { ...options, signal: controller.signal })
    clearTimeout(timer)
    return res
  } catch (err) {
    clearTimeout(timer)
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`WebDAV timeout after ${timeout}ms: ${url}`)
    }
    throw err
  }
}

// ==================== URL helpers ====================

export function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

const BASE_PATH = 'umm-data'

/**
 * Convert a store key to a safe filename via SHA-256 hash.
 * Keys like "movie:douban" contain :: which is illegal in URL paths.
 * Hashing produces ASCII-only filenames with no special characters.
 */
async function keyToFilename(key: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(key)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  return hashHex.slice(0, 16) // 16 hex chars = 64-bit collision space
}

function metaUrl(baseUrl: string): string {
  return `${normalizeUrl(baseUrl)}/${BASE_PATH}/meta.json`
}

function datasetUrl(baseUrl: string, filename: string): string {
  // filename is already a safe hash string, no encoding needed
  return `${normalizeUrl(baseUrl)}/${BASE_PATH}/${filename}.zip`
}

// ==================== Public API ====================

/** Test WebDAV connection — PROPFIND on base path */
export async function testConnection(
  baseUrl: string,
  username: string,
  password: string
): Promise<{ ok: boolean; message: string }> {
  try {
    const url = normalizeUrl(baseUrl)
    const res = await fetchWithTimeout(
      url,
      {
        method: 'PROPFIND',
        headers: { ...authHeaders(username, password), Depth: '0' },
      },
      15_000
    )
    if (res.status >= 200 && res.status < 300) {
      return { ok: true, message: 'Connected' }
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: 'Authentication failed (401/403)' }
    }
    return { ok: false, message: `HTTP ${res.status}` }
  } catch (err: any) {
    return { ok: false, message: err?.message || String(err) }
  }
}

/** Fetch remote meta.json — returns null if not found */
export async function fetchRemoteMeta(
  baseUrl: string,
  username: string,
  password: string
): Promise<RemoteMeta | null> {
  const url = metaUrl(baseUrl)
  const res = await fetchWithTimeout(url, {
    method: 'GET',
    headers: {
      ...authHeaders(username, password),
      Accept: 'application/json; charset=utf-8',
    },
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Failed to fetch meta: HTTP ${res.status}`)

  // Read as text then parse for full UTF-8 control (bypass auto-charset detection)
  const text = await res.text()
  const raw = JSON.parse(text)

  // Normalize old format → new format
  // Old: { version, timestamp, schema: 'umm-webdav-meta' }
  // New: { dataVersion, updatedAt, schema: 'umm-meta' }
  if (raw.datasets && Array.isArray(raw.datasets)) {
    raw.datasets = raw.datasets.map((ds: any) => ({
      key: ds.key,
      hash: ds.hash || 'unknown',
      updatedAt: ds.updatedAt || ds.timestamp || '',
      recordCount: ds.recordCount || 0,
      dataVersion: ds.dataVersion ?? ds.version ?? 1,
    }))
  }

  return raw as RemoteMeta
}

/** Upload meta.json to WebDAV — UTF-8 encoded JSON */
export async function uploadMeta(
  baseUrl: string,
  username: string,
  password: string,
  meta: RemoteMeta
): Promise<void> {
  const url = metaUrl(baseUrl)
  const jsonBytes = new TextEncoder().encode(JSON.stringify(meta))
  const res = await fetchWithTimeout(url, {
    method: 'PUT',
    headers: {
      ...authHeaders(username, password),
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: jsonBytes,
  })
  if (!res.ok) throw new Error(`Failed to upload meta: HTTP ${res.status}`)
}

/** Create WebDAV directory (MKCOL) */
export async function createDirectory(
  baseUrl: string,
  username: string,
  password: string
): Promise<void> {
  const url = `${normalizeUrl(baseUrl)}/${BASE_PATH}`
  const res = await fetchWithTimeout(url, {
    method: 'MKCOL',
    headers: authHeaders(username, password),
  })
  // 405 = already exists, that's fine
  if (res.status !== 405 && !res.ok) {
    throw new Error(`Failed to create directory: HTTP ${res.status}`)
  }
}

/** Upload a dataset ZIP blob — key is hashed to safe filename */
export async function uploadDataset(
  baseUrl: string,
  username: string,
  password: string,
  key: string,
  blob: Blob
): Promise<void> {
  const filename = await keyToFilename(key)
  const url = datasetUrl(baseUrl, filename)
  const headers = { ...authHeaders(username, password), 'Content-Type': 'application/zip' }

  const res = await fetchWithTimeout(url, { method: 'PUT', headers, body: blob })
  // 409 = directory doesn't exist, create and retry
  if (res.status === 409) {
    await createDirectory(baseUrl, username, password)
    const retryRes = await fetchWithTimeout(url, { method: 'PUT', headers, body: blob })
    if (!retryRes.ok) throw new Error(`Failed to upload dataset: HTTP ${retryRes.status}`)
    return
  }
  if (!res.ok) throw new Error(`Failed to upload dataset: HTTP ${res.status}`)
}

/** Download a dataset ZIP blob — key is hashed to safe filename */
export async function downloadDataset(
  baseUrl: string,
  username: string,
  password: string,
  key: string
): Promise<Blob> {
  const filename = await keyToFilename(key)
  const url = datasetUrl(baseUrl, filename)
  const res = await fetchWithTimeout(url, {
    method: 'GET',
    headers: authHeaders(username, password),
  })
  if (res.status === 404) throw new Error(`Dataset not found: ${key} (${url})`)
  if (!res.ok) throw new Error(`Failed to download dataset: HTTP ${res.status} for ${key} (${url})`)
  return res.blob()
}

/** Delete a dataset ZIP from WebDAV — key is hashed to safe filename */
export async function deleteDataset(
  baseUrl: string,
  username: string,
  password: string,
  key: string
): Promise<void> {
  const filename = await keyToFilename(key)
  const url = datasetUrl(baseUrl, filename)
  const res = await fetchWithTimeout(url, {
    method: 'DELETE',
    headers: authHeaders(username, password),
  })
  if (!res.ok && res.status !== 404) {
    throw new Error(`Failed to delete dataset: HTTP ${res.status}`)
  }
}
