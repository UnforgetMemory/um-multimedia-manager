/**
 * RecordRepositoryAdapter — IRecordRepository implementation backed by MediaDatabase.
 *
 * Derives IndexedDB storage keys from StoreRecord canonical URLs via UrlResolverBuilder.fromUrl().
 * Converts between domain StoreRecord instances and their serialized snapshots at the
 * boundary, keeping the repository layer infrastructure-agnostic.
 *
 * Store name normalization: accepts both "douban" (short) and "douban_records" (full).
 */

import type { IRecordRepository } from '@/domain/record/IRecordRepository'
import { StoreRecord } from '@/domain/record/StoreRecord'
import type { StoreRecordSnapshot } from '@/types'
import { UrlResolverBuilder } from '@/shared/identity'
/** Minimal interface for the database dependency — makes the adapter testable. */
export interface DbAdapterForRepo {
  get(storeName: string, key: string): Promise<StoreRecordSnapshot | null>
  put(storeName: string, key: string, record: StoreRecordSnapshot): Promise<void>
}

export class RecordRepositoryAdapter implements IRecordRepository {
  private readonly db: DbAdapterForRepo

  constructor(db: DbAdapterForRepo) {
    this.db = db
  }

  async findByKey(storeName: string, key: string): Promise<StoreRecord | null> {
    const snapshot = await this.db.get(this.normalizeStore(storeName), key)
    if (!snapshot) return null
    return StoreRecord.fromSnapshot(snapshot)
  }

  async save(storeName: string, record: StoreRecord): Promise<void> {
    const key = this.resolveKey(record)
    await this.db.put(this.normalizeStore(storeName), key, record.toSnapshot())
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
    const identity = UrlResolverBuilder.fromUrl(record.url)
    if (!identity || !identity.providerId) {
      throw new Error(`Cannot resolve storage key for URL: ${record.url}`)
    }
    return `${identity.type}::${identity.providerId}`
  }
}
