/**
 * zip-utils boundary & error-path tests
 *
 * Covers safety guards and edge cases that are NOT exercised by the
 * round-trip + version-validation tests in dataset-version.spec.ts.
 *
 * Focus areas:
 *   - Empty / oversized / malformed / truncated inputs
 *   - Record-count ceiling (memory-exhaustion defence)
 *   - UTF-8 fidelity (Chinese, emoji)
 *   - Large-record round-trip
 */

import { test, expect } from '@playwright/test'
import { zip } from 'fflate'
import { packageDataset, unpackageDataset } from '@/utils/zip-utils'
import type { StoreRecordSnapshot } from '@/domain/record/StoreRecord'

// FileReader shim for the test runner (jszip legacy — harmless for fflate).
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

/** Minimal StoreRecordSnapshot factory. */
function record(overrides: Partial<StoreRecordSnapshot> = {}): StoreRecordSnapshot {
  return {
    url: 'https://example.com/subject/1',
    status: 0,
    rating: 0,
    updatedAt: '2026-08-04T00:00:00.000Z',
    linkedIds: {},
    ...overrides,
  }
}

/** Wrap fflate zip callback into a Promise. */
function fflateZip(files: Record<string, Uint8Array>): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    zip(files, { level: 0 }, (err, data) => {
      if (err) reject(err)
      else resolve(data)
    })
  })
}

// ---------------------------------------------------------------------------
// 1. Empty entries round-trip
// ---------------------------------------------------------------------------
test.describe('empty dataset', () => {
  test('packageDataset with 0 entries records meta.recordCount === 0', async () => {
    const { meta } = await packageDataset('test', [])
    expect(meta.recordCount).toBe(0)
  })

  test('unpackageDataset yields empty data after 0-entry round-trip', async () => {
    const { blob } = await packageDataset('test', [])
    const { data } = await unpackageDataset(blob)
    expect(Object.keys(data)).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 2. Oversized blob (> 50 MB) rejection
// ---------------------------------------------------------------------------
test.describe('size guard', () => {
  test('rejects blob larger than 50 MB', async () => {
    // 50 MiB + 1 byte → immediately caught by blob.size check before parsing
    const oversized = new Blob([new Uint8Array(50 * 1024 * 1024 + 1)])
    await expect(unpackageDataset(oversized)).rejects.toThrow('exceeds')
  })
})

// ---------------------------------------------------------------------------
// 3. Non-ZIP garbage rejection
// ---------------------------------------------------------------------------
test.describe('malformed input', () => {
  test('rejects plain text that is not a ZIP', async () => {
    const textBlob = new Blob(['not a zip file at all'], { type: 'text/plain' })
    await expect(unpackageDataset(textBlob)).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// 4. Missing data.json ZIP
// ---------------------------------------------------------------------------
test.describe('missing required files', () => {
  test('rejects ZIP that contains meta.json but no data.json', async () => {
    const encoder = new TextEncoder()
    const metaJson = JSON.stringify({
      key: 'test',
      hash: 'x',
      updatedAt: '2026-08-04T00:00:00.000Z',
      recordCount: 0,
      dataVersion: 1,
    })
    const zipped = await fflateZip({ 'meta.json': encoder.encode(metaJson) })
    const blob = new Blob([zipped.buffer as ArrayBuffer], { type: 'application/zip' })
    await expect(unpackageDataset(blob)).rejects.toThrow('missing data.json or meta.json')
  })
})

// ---------------------------------------------------------------------------
// 5. Record-count ceiling (100 k records)
// ---------------------------------------------------------------------------
test.describe('record-count guard', () => {
  test('rejects dataset with 100_001 records', async () => {
    const count = 100_001
    const entries: Array<{ key: string; record: StoreRecordSnapshot }> = []
    for (let i = 0; i < count; i++) {
      entries.push({
        key: `m::${i}`,
        record: record({ url: `https://e.com/s/${i}` }),
      })
    }

    const { blob } = await packageDataset('test', entries)
    await expect(unpackageDataset(blob)).rejects.toThrow('records exceeds')
  })
})

// ---------------------------------------------------------------------------
// 6. UTF-8 content fidelity (Chinese key, emoji in comment)
// ---------------------------------------------------------------------------
test.describe('UTF-8 fidelity', () => {
  test('preserves Chinese key and emoji in comment across round-trip', async () => {
    const entries = [
      {
        key: 'movie::中文测试',
        record: record({ comment: '🎬 电影评论 😊' }),
      },
    ]

    const { blob } = await packageDataset('test', entries)
    const { data } = await unpackageDataset(blob)
    expect(data['movie::中文测试']).toBeDefined()
    expect(data['movie::中文测试'].comment).toBe('🎬 电影评论 😊')
  })
})

// ---------------------------------------------------------------------------
// 7. Large-record round-trip (100 KB comment)
// ---------------------------------------------------------------------------
test.describe('large record', () => {
  test('round-trips a single record with 100 KB comment', async () => {
    const largeComment = 'A'.repeat(100 * 1024) // 100 KiB
    const entries = [
      {
        key: 'movie::large',
        record: record({ comment: largeComment }),
      },
    ]

    const { blob } = await packageDataset('test', entries)
    const { data } = await unpackageDataset(blob)
    expect(data['movie::large'].comment).toBe(largeComment)
    expect(data['movie::large'].comment!.length).toBe(100 * 1024)
  })
})