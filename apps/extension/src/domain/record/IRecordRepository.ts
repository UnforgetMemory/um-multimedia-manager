/**
 * IRecordRepository
 *
 * Repository interface for persisting and retrieving StoreRecord aggregates.
 * Implementations live in the infrastructure layer and handle storage
 * (IndexedDB, in-memory, remote API, etc.).
 *
 * @remarks
 * All methods operate in terms of domain primitives. Query filters are
 * expressed as plain objects to keep the interface infrastructure-agnostic.
 */
import type { StoreRecord } from '@/domain/record/StoreRecord';

/** Filter options for record queries. */
export interface RecordFilter {
  platform?: string;
  type?: string;
  status?: number;
  isRated?: boolean;
  updatedAfter?: string;  // ISO-8601
  updatedBefore?: string; // ISO-8601
}

/** Options for paginated queries. */
export interface PageOptions {
  limit?: number;
  offset?: number;
}

/** A single page of query results. */
export interface PageResult<T = StoreRecord> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
}

export interface IRecordRepository {
  /**
   * Find a single record by its composite store key.
   * Returns null when no record exists.
   */
  findByKey(storeName: string, key: string): Promise<StoreRecord | null>;

  /**
   * Find a record by its canonical URL.
   * Returns null when not found.
   */
  findByUrl(storeName: string, url: string): Promise<StoreRecord | null>;

  /**
   * Persist a record (insert or update).
   * Stamps schema version and increments optimistic concurrency version.
   */
  save(storeName: string, record: StoreRecord): Promise<void>;

  /**
   * Persist a record with optimistic locking.
   * Fails (returns false) if the stored version does not match expectedVersion.
   */
  saveIfUnchanged(
    storeName: string,
    record: StoreRecord,
    expectedVersion: number,
  ): Promise<boolean>;

  /**
   * Remove a record.
   * No-op if the record does not exist.
   */
  delete(storeName: string, key: string): Promise<void>;

  /**
   * Retrieve all records from a store.
   */
  getAll(storeName: string): Promise<StoreRecord[]>;

  /**
   * Query records by filter and pagination options.
   */
  query(storeName: string, filter?: RecordFilter, page?: PageOptions): Promise<PageResult>;

  /**
   * Count records in a store. Optionally filtered.
   */
  count(storeName: string, filter?: RecordFilter): Promise<number>;

  /**
   * Get all store keys for records with status >= 2 (watched/done).
   * Used by the PT dimmer to determine which torrents to grey out.
   */
  getWatchedKeys(storeName: string): Promise<Set<string>>;

  /**
   * Batch-get records by multiple keys in a single operation.
   */
  batchGet(storeName: string, keys: string[]): Promise<Map<string, StoreRecord>>;

  /**
   * Cross-platform sync: write a primary record and propagate status
   * (but NOT rating) to linked platform records.
   *
   * @returns Descriptor of what changed and which platforms were synced.
   */
  syncRecord(
    platform: string,
    key: string,
    record: StoreRecord,
    linked?: Array<{ platform: string; key: string; url: string }>,
  ): Promise<{ changed: boolean; syncedPlatforms: string[] }>;

  /** Remove all records from all stores. */
  clearAll(): Promise<void>;
}
