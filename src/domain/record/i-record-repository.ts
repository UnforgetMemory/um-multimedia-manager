/**
 * IRecordRepository
 *
 * Repository interface for persisting and retrieving StoreRecord aggregates.
 * Implementations live in the infrastructure layer and handle storage
 * (IndexedDB, in-memory, remote API, etc.).
 */
import type { StoreRecord } from '@/domain/record/StoreRecord';

export interface IRecordRepository {
  /**
   * Find a single record by its composite store key.
   * Returns null when no record exists.
   */
  findByKey(storeName: string, key: string): Promise<StoreRecord | null>;

  /**
   * Persist a record (insert or update).
   * Stamps schema version and increments optimistic concurrency version.
   */
  save(storeName: string, record: StoreRecord): Promise<void>;
}
