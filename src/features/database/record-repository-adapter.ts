/**
 * RecordRepositoryAdapter — IRecordRepository implementation backed by MediaDatabase.
 *
 * Derives IndexedDB storage keys from StoreRecord canonical URLs via Identity.fromUrl().
 * Converts between domain StoreRecord instances and their serialized snapshots at the
 * boundary, keeping the repository layer infrastructure-agnostic.
 *
 * Store name normalization: accepts both "douban" (short) and "douban_records" (full).
 */

import type { IRecordRepository, RecordFilter, PageOptions, PageResult } from '@/domain/record/IRecordRepository'
import { StoreRecord } from '@/domain/record/StoreRecord'
import { Identity } from '@/shared/identity'
/** Minimal interface for the database dependency — makes the adapter testable. */
export interface DbAdapterForRepo {
  get(storeName: string, key: string): Promise<any>
  put(storeName: string, key: string, record: any): Promise<void>
  optimisticPut(storeName: string, key: string, record: any, expectedVersion: number): Promise<{ ok: boolean; version?: number; conflict?: any }>
  delete(storeName: string, key: string): Promise<void>
  getAll(storeName: string): Promise<Array<{ key: string; record: any }>>
  batchGet(storeName: string, keys: string[]): Promise<Map<string, any>>
  count(storeName: string): Promise<number>
  getWatchedIds(storeName: string): Promise<Set<string>>
  clearAll(): Promise<void>
}

export class RecordRepositoryAdapter implements IRecordRepository {
  constructor(private readonly db: DbAdapterForRepo) {}

  async findByKey(storeName: string, key: string): Promise<StoreRecord | null> {
    const snapshot = await this.db.get(this.normalizeStore(storeName), key)
    if (!snapshot) return null
    return StoreRecord.fromSnapshot(snapshot)
  }

  async findByUrl(storeName: string, url: string): Promise<StoreRecord | null> {
    const identity = Identity.fromUrl(url)
    if (identity) {
      return this.findByKey(storeName, `${identity.type}::${identity.providerId}`)
    }
    // Fallback: linear scan
    const entries = await this.db.getAll(this.normalizeStore(storeName))
    for (const { record } of entries) {
      if (record.url === url) return StoreRecord.fromSnapshot(record)
    }
    return null
  }

  async save(storeName: string, record: StoreRecord): Promise<void> {
    const key = this.resolveKey(record)
    await this.db.put(this.normalizeStore(storeName), key, record.toSnapshot())
  }

  async saveIfUnchanged(
    storeName: string,
    record: StoreRecord,
    expectedVersion: number,
  ): Promise<boolean> {
    const key = this.resolveKey(record)
    const result = await this.db.optimisticPut(
      this.normalizeStore(storeName),
      key,
      record.toSnapshot(),
      expectedVersion,
    )
    return result.ok
  }

  async delete(storeName: string, key: string): Promise<void> {
    await this.db.delete(this.normalizeStore(storeName), key)
  }

  async getAll(storeName: string): Promise<StoreRecord[]> {
    const entries = await this.db.getAll(this.normalizeStore(storeName))
    return entries.map(({ record }) => StoreRecord.fromSnapshot(record))
  }

  async query(storeName: string, filter?: RecordFilter, page?: PageOptions): Promise<PageResult> {
    const all = await this.getAll(storeName)
    let items = all

    if (filter) {
      if (filter.status !== undefined) {
        items = items.filter(r => r.status.toNumber() === filter.status)
      }
      if (filter.isRated === true) {
        items = items.filter(r => r.isRated)
      }
      if (filter.isRated === false) {
        items = items.filter(r => !r.isRated)
      }
      if (filter.updatedAfter) {
        const after = new Date(filter.updatedAfter).getTime()
        items = items.filter(r => new Date(r.updatedAt).getTime() >= after)
      }
      if (filter.updatedBefore) {
        const before = new Date(filter.updatedBefore).getTime()
        items = items.filter(r => new Date(r.updatedAt).getTime() <= before)
      }
    }

    const total = items.length
    const offset = page?.offset ?? 0
    const limit = page?.limit ?? total

    return {
      items: items.slice(offset, offset + limit),
      total,
      offset,
      limit,
    }
  }

  async count(storeName: string, filter?: RecordFilter): Promise<number> {
    if (!filter) return this.db.count(this.normalizeStore(storeName))
    const result = await this.query(storeName, filter)
    return result.total
  }

  async getWatchedKeys(storeName: string): Promise<Set<string>> {
    return this.db.getWatchedIds(this.normalizeStore(storeName))
  }

  async batchGet(storeName: string, keys: string[]): Promise<Map<string, StoreRecord>> {
    const entries = await this.db.batchGet(this.normalizeStore(storeName), keys)
    const result = new Map<string, StoreRecord>()
    for (const [key, record] of entries.entries()) {
      result.set(String(key), StoreRecord.fromSnapshot(record as any))
    }
    return result
  }

  async clearAll(): Promise<void> {
    await this.db.clearAll()
  }

  // ==================== Private helpers ====================

  /** Normalize store name: "douban" → "douban_records", "douban_records" → "douban_records". */
  private normalizeStore(storeName: string): string {
    return storeName.endsWith('_records') || storeName === 'jav_ids' || storeName === 'ttl_cache'
      ? storeName
      : `${storeName}_records`
  }

  /** Derive IndexedDB key (`{type}::{providerId}`) from a StoreRecord's canonical URL. */
  private resolveKey(record: StoreRecord): string {
    const identity = Identity.fromUrl(record.url)
    if (!identity || !identity.providerId) {
      throw new Error(`Cannot resolve storage key for URL: ${record.url}`)
    }
    return `${identity.type}::${identity.providerId}`
  }
}