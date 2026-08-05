/**
 * ZIP utilities for WebDAV sync
 *
 * ==================== UTF-8 encoding policy ====================
 * All text content (ZIP entry names, JSON data, metadata) is
 * explicitly handled as UTF-8 through JSZip and TextEncoder/Decoder.
 * JSZip defaults to UTF-8 for entry filenames (bit 11 in the ZIP
 * general purpose flag), and content is passed as raw UTF-8 bytes.
 * ==============================================================
 *
 * Each dataset zip contains:
 *   - data.json    → { "movie::id": StoreRecord, ... }
 *   - meta.json    → { key, hash, updatedAt, recordCount, dataVersion }
 */

import JSZip from 'jszip'
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

  const zip = new JSZip()
  zip.file('data.json', dataJson)
  zip.file('meta.json', metaJson)

  // JSZip defaults to UTF-8 filenames + content (bit 11 set in ZIP header)
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
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

  const zip = await JSZip.loadAsync(blob)

  const dataFile = zip.file('data.json')
  const metaFile = zip.file('meta.json')

  if (!dataFile || !metaFile) {
    throw new Error('Invalid dataset ZIP: missing data.json or meta.json')
  }

  // Read as string (UTF-8) then parse JSON
  const dataStr = await dataFile.async('string')
  const metaStr = await metaFile.async('string')

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
