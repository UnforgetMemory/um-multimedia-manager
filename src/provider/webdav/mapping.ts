/**
 * WebDAV pure seam — transformations and policy only, zero I/O.
 *
 * Transport (src/provider/webdav/api.ts) owns fetch/headers/URL composition;
 * this file owns the deterministic rules: URL string normalization,
 * credential stripping for logs, store-key → filename hashing, and the
 * meta.json payload → RemoteMeta normalization (old-format compat policy).
 */

import type { RemoteMeta } from '@/types';

/** Trim and drop trailing slashes — the single URL normalization rule. */
export function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

/** Remove embedded `user:pass@` credentials from a URL for safe logging. */
export function stripUrlCredentials(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    u.username = '';
    u.password = '';
    return u.toString();
  } catch {
    // Unparseable URL — strip the common `scheme://user:pass@` prefix defensively.
    return rawUrl.replace(/^(\w+:\/\/)[^@/]+@/, '$1');
  }
}

/**
 * Convert a store key to a safe filename via SHA-256 hash.
 * Keys like "movie:douban" contain :: which is illegal in URL paths.
 * Hashing produces ASCII-only filenames with no special characters.
 * Deterministic by design (crypto.subtle only — no network/storage here).
 */
export async function hashKeyToFilename(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return hashHex.slice(0, 16); // 16 hex chars = 64-bit collision space
}

/** Dataset entry as it may appear in old or new meta.json payloads. */
interface RawDatasetEntry {
  key?: string;
  hash?: string;
  updatedAt?: string;
  timestamp?: string;
  recordCount?: number;
  dataVersion?: number;
  version?: number;
}

/**
 * Normalize old meta format → new format (mutates `datasets` in place):
 * Old: { version, timestamp, schema: 'umm-webdav-meta' }
 * New: { dataVersion, updatedAt, schema: 'umm-meta' }
 * Takes the JSON.parse output directly (`unknown`) — the original code
 * never inspected anything but `datasets`.
 */
export function normalizeRemoteMetaPayload(raw: unknown): RemoteMeta {
  const meta = raw as { datasets?: unknown };
  if (meta.datasets && Array.isArray(meta.datasets)) {
    meta.datasets = meta.datasets.map((ds) => {
      const entry = ds as RawDatasetEntry;
      return {
        key: entry.key,
        hash: entry.hash || 'unknown',
        updatedAt: entry.updatedAt || entry.timestamp || '',
        recordCount: entry.recordCount || 0,
        dataVersion: entry.dataVersion ?? entry.version ?? 1,
      };
    });
  }
  return meta as RemoteMeta;
}
