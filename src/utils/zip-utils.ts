/**
 * ZIP utilities for WebDAV sync
 *
 * ==================== UTF-8 encoding policy ====================
 * All text content (ZIP entry names, JSON data, metadata) is
 * explicitly handled as UTF-8 through fflate and TextEncoder/Decoder.
 * fflate uses UTF-8 for entry filenames and content by default.
 * ==============================================================
 *
 * Each dataset zip contains:
 *   - data.json    → { "movie::id": StoreRecord, ... }
 *   - meta.json    → { key, hash, updatedAt, recordCount, dataVersion }
 *
 * Migrated from JSZip to fflate (ADR-016 follow-up / U8):
 * - fflate is zero-dependency, ~8KB vs jszip's ~100KB + pako polyfills
 * - flate uses native CompressionStream where available, async non-blocking
 * - API: zip/unzip return Uint8Array; Blob conversion via Response/Blob
 */

import { zip, unzip } from 'fflate'
import type { StoreRecord, DatasetMeta } from '../types'
import { calculateStoreHash } from './hash-utils'
import { CURRENT_DATASET_VERSION, validateDatasetVersion } from '@/features/migration/models'

export interface PackedDataset {
  blob: Blob
  meta: DatasetMeta
}

/** Reject dataset blobs larger than 50 MiB before parsing (compression-bomb defence). */
const MAX_DATASET_BYTES = 50 * 1024 * 1024
/** Reject datasets with more than 100k records (memory-exhaustion defence). */
const MAX_DATASET_RECORDS = 100_000

/**
 * Package store entries into a standard ZIP blob.
 * Entry names and JSON content are UTF-8 throughout.
 */
export async function packageDataset(
  key: string,
  entries: Array<{ key: string; record: StoreRecord }>
): Promise<PackedDataset> {
  const dataObj: Record<string, StoreRecord> = {}
  let latestTs = ''
  for (const { key: k, record } of entries) {
    dataObj[k] = record
    if (record.updatedAt > latestTs) latestTs = record.updatedAt
  }

  const hash = await calculateStoreHash(entries)

  const meta: DatasetMeta = {
    key,
    hash,
    updatedAt: latestTs || new Date().toISOString(),
    recordCount: entries.length,
    dataVersion: CURRENT_DATASET_VERSION,
  }

  // JSON.stringify → UTF-8 bytes → stored in ZIP entry as-is
  const dataJson = JSON.stringify(dataObj, null, 2)
  const metaJson = JSON.stringify(meta, null, 2)

  // fflate expects Uint8Array values; encode strings as UTF-8
  const encoder = new TextEncoder()
  const files: Record<string, Uint8Array> = {
    'data.json': encoder.encode(dataJson),
    'meta.json': encoder.encode(metaJson),
  }

  // fflate zip is async and non-blocking (uses CompressionStream if available)
  const zipped: Uint8Array = await new Promise((resolve: (value: Uint8Array) => void, reject: (reason: unknown) => void) => {
    zip(files, { level: 6 }, (err: Error | null, data: Uint8Array) => {
      if (err) reject(err)
      else resolve(data)
    })
  })

  const blob = new Blob([zipped.slice()], { type: 'application/zip' })
  return { blob, meta }
}

/**
 * Unpackage a ZIP blob into its data records and metadata.
 * Entry names and content decoded as UTF-8.
 *
 * Hard size caps guard against malicious/oversized datasets (compression-bomb
 * and memory-exhaustion defence): reject the blob before parsing when larger
 * than MAX_DATASET_BYTES, and reject absurd record counts after JSON.parse.
 */
export async function unpackageDataset(
  blob: Blob
): Promise<{ data: Record<string, StoreRecord>; meta: DatasetMeta }> {
  if (blob.size > MAX_DATASET_BYTES) {
    throw new Error(`Invalid dataset ZIP: size ${blob.size} exceeds ${MAX_DATASET_BYTES} bytes limit`)
  }

  // Blob → Uint8Array for fflate unzip
  const arrayBuffer = await blob.arrayBuffer()
  const zipped = new Uint8Array(arrayBuffer)

  // fflate unzip is async and non-blocking (uses DecompressionStream if available)
  const unzipped: Record<string, Uint8Array> = await new Promise((resolve: (value: Record<string, Uint8Array>) => void, reject: (reason: unknown) => void) => {
    unzip(zipped, (err: Error | null, data: Record<string, Uint8Array>) => {
      if (err) reject(err)
      else resolve(data)
    })
  })

  const dataFile = unzipped['data.json']
  const metaFile = unzipped['meta.json']

  if (!dataFile || !metaFile) {
    throw new Error('Invalid dataset ZIP: missing data.json or meta.json')
  }

  // Decode Uint8Array as UTF-8 string then parse JSON
  const decoder = new TextDecoder()
  const dataStr = decoder.decode(dataFile)
  const metaStr = decoder.decode(metaFile)

  const data: Record<string, StoreRecord> = JSON.parse(dataStr)
  const meta: DatasetMeta = JSON.parse(metaStr)

  const recordCount = Object.keys(data).length
  if (recordCount > MAX_DATASET_RECORDS) {
    throw new Error(`Invalid dataset ZIP: ${recordCount} records exceeds ${MAX_DATASET_RECORDS} limit`)
  }

  // Reject datasets from incompatible versions — MigrationError propagates to caller
  validateDatasetVersion(meta.dataVersion)

  return { data, meta }
}
