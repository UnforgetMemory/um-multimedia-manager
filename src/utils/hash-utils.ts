/**
 * Hash utilities for WebDAV sync
 *
 * ==================== UTF-8 encoding policy ====================
 * TextEncoder.encode() always produces UTF-8 bytes from JS strings
 * (which are UTF-16 internally). This ensures the hash input is
 * consistently UTF-8 regardless of platform or JS engine.
 * ==============================================================
 *
 * Computes SHA-256 hash of sorted store records to detect changes.
 */

import type { StoreRecord } from '../types'

/**
 * Compute SHA-256 hash of an array of store entries.
 * Sorted by key for deterministic output; excludes updatedAt
 * which changes on every write and would cause false mismatches.
 *
 * Encoding chain: record data → JSON.stringify → TextEncoder(UTF-8) → SHA-256
 */
export async function calculateStoreHash(
  entries: Array<{ key: string; record: StoreRecord }>
): Promise<string> {
  if (entries.length === 0) return 'empty'

  const sorted = [...entries].sort((a, b) => a.key.localeCompare(b.key))

  const dataToHash = sorted.map(({ key, record }) => ({
    key,
    status: record.status,
    rating: record.rating,
    linkedIds: record.linkedIds,
    url: record.url,
  }))

  // JSON → UTF-8 bytes via TextEncoder (explicit, platform-independent)
  const encoder = new TextEncoder()
  const data = encoder.encode(JSON.stringify(dataToHash))
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}
