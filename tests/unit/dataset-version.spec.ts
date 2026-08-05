import { test, expect } from '@playwright/test'
import {
  CURRENT_DATASET_VERSION,
  MIN_SUPPORTED_DATASET_VERSION,
  MigrationError,
  validateDatasetVersion,
} from '@/features/migration/models'
import { packageDataset, unpackageDataset } from '@/utils/zip-utils'

// Node (v26) does not expose the FileReader global, yet jszip 3.10.1 requires
// it to read Blob inputs (support.blob is true, but the Blob→bytes conversion
// only happens in the FileReader branch of prepareContent). Shim just enough
// of FileReader for jszip: readAsArrayBuffer + onload/onerror. Browser runs
// (real extension) use the native FileReader — this only bridges the unit-test
// environment.
if (typeof (globalThis as { FileReader?: unknown }).FileReader === 'undefined') {
  class FileReaderShim {
    onload: ((e: { target: { result: ArrayBuffer } }) => void) | null = null
    onerror: ((e: { error: unknown }) => void) | null = null
    readAsArrayBuffer(blob: Blob): void {
      blob.arrayBuffer().then(
        (result) => this.onload?.({ target: { result } }),
        (error) => this.onerror?.({ error })
      )
    }
  }
  ;(globalThis as { FileReader?: unknown }).FileReader = FileReaderShim
}

/**
 * Dataset (backup ZIP) versioning — T1 contract.
 *
 * Locks: CURRENT_DATASET_VERSION / MIN_SUPPORTED_DATASET_VERSION semantics,
 * validateDatasetVersion error codes, and the packageDataset → unpackageDataset
 * round-trip (dataVersion stamped on package, enforced on unpackage).
 */

/** Capture the MigrationError thrown by fn (expects exactly one). */
function captureMigrationError(fn: () => unknown): MigrationError {
  let caught: unknown
  try {
    fn()
  } catch (err) {
    caught = err
  }
  expect(caught, 'expected validateDatasetVersion to throw').toBeInstanceOf(MigrationError)
  return caught as MigrationError
}

test.describe('validateDatasetVersion', () => {
  test('CURRENT_DATASET_VERSION passes', () => {
    expect(validateDatasetVersion(CURRENT_DATASET_VERSION)).toBe(true)
  })

  test('below MIN_SUPPORTED_DATASET_VERSION throws MigrationError with IMPORT_INCOMPATIBLE', () => {
    const err = captureMigrationError(() => validateDatasetVersion(MIN_SUPPORTED_DATASET_VERSION - 1))
    expect(err.code).toBe('IMPORT_INCOMPATIBLE')
  })

  test('CURRENT_DATASET_VERSION + 1 throws MigrationError with VERSION_TOO_NEW', () => {
    const err = captureMigrationError(() => validateDatasetVersion(CURRENT_DATASET_VERSION + 1))
    expect(err.code).toBe('VERSION_TOO_NEW')
  })
})

test.describe('dataset ZIP round-trip (packageDataset → unpackageDataset)', () => {
  function record(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      url: 'https://example.com/subject/1',
      status: 0,
      rating: 0,
      updatedAt: '2026-08-04T00:00:00.000Z',
      linkedIds: {},
      schemaVersion: 2,
      recordVersion: 1,
      ...overrides,
    }
  }

  test('round-trip preserves data and stamps dataVersion = CURRENT_DATASET_VERSION', async () => {
    const entries = [
      { key: 'movie::1', record: record({ status: 1, rating: 4, comment: 'x' }) },
      { key: 'movie::2', record: record({ status: 2, rating: 8 }) },
    ]

    const { blob, meta } = await packageDataset('douban_records', entries)
    expect(meta.dataVersion).toBe(CURRENT_DATASET_VERSION)

    const { data, meta: unpackedMeta } = await unpackageDataset(blob)
    expect(unpackedMeta.dataVersion).toBe(CURRENT_DATASET_VERSION)
    expect(Object.keys(data).sort()).toEqual(['movie::1', 'movie::2'])
    expect(data['movie::1']).toEqual(entries[0].record)
    expect(data['movie::2']).toEqual(entries[1].record)
  })
})
