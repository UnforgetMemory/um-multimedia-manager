/**
 * IndexedDB connection + shared read-cache primitives (split from ./models, 2026-09-27 size gate).
 *
 * Owns the single IDBDatabase handle: open with version-upgrade wiring, unexpected-close
 * handling, a generic single-store transaction helper, and the LRU read cache shared by
 * record operations. Store CRUD / query / cache-entry ops live in sibling modules that
 * receive a DatabaseConnection instance.
 */

import type { StoreRecord } from '@/types';
import { LruCache, DEFAULT_LRU_MAX_SIZE, DEFAULT_LRU_TTL_MS } from '@/engine/cache/lru-cache';
import { warnLog } from '@/libraries/utils/logger';
import { migrateSchema } from './migrate';
import { rescueLegacyAdultRecords } from './legacy-store-rescue';
import {
  DB_NAME,
  DB_VERSION,
  STORE_NAMES,
  RECORD_STORES,
  normalizeVideoKey,
  ADULT_AV_ID_INDEX,
  adultAvIdFromKey,
} from './schema';

/** Value shape cached by the read cache: single record, null (miss), or full list. */
export type ReadCacheValue = StoreRecord | null | Array<{ key: string; record: StoreRecord }>;

export class DatabaseConnection {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;
  readonly readCache = new LruCache<ReadCacheValue>({
    maxSize: DEFAULT_LRU_MAX_SIZE,
    defaultTtlMs: DEFAULT_LRU_TTL_MS,
  });

  // ==================== Initialization ====================

  async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const oldVersion = event.oldVersion;

        migrateSchema(db, oldVersion, request, {
          DB_VERSION,
          STORE_NAMES,
          RECORD_STORES,
          normalizeVideoKey,
          ADULT_AV_ID_INDEX,
          adultAvIdFromKey,
        });
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;

        // Handle unexpected close (e.g. extension update)
        this.db.onversionchange = () => {
          this.db?.close();
          this.db = null;
          this.initPromise = null;
        };

        // Handle error events on db
        this.db.onerror = () => {
          console.warn('[DB] Unhandled database error event');
        };

        // umreview U2：把遗留 sehuatang_avids 的残留条目补进 jav_ids（幂等、只增不删）。
        // 不 await：救援绝不能拖慢/阻塞 DB 打开（它自己有完整容错）。实现在每次 SW 启动
        // 都会跑一次，且成功后遗留表为空，后续成本仅为一次 objectStoreNames 检查。
        // 注意 this.db 已在上方赋值 —— 救援内部的 ensureDB() 会立即返回，不会自锁。
        void rescueLegacyAdultRecords(this)
          .then(({ rescued }) => {
            if (rescued > 0) {
              warnLog(`[DB] rescued ${rescued} legacy adult record(s) from sehuatang_avids`);
            }
          })
          .catch((err: unknown) => {
            warnLog('[DB] legacy adult rescue failed:', err);
          });

        resolve();
      };

      request.onerror = (event) => {
        this.initPromise = null;
        const error = (event.target as IDBOpenDBRequest).error;
        console.error('[DB] Failed to open database:', error);
        reject(error || new Error('Failed to open IndexedDB'));
      };

      request.onblocked = () => {
        console.warn('[DB] Database open blocked — close other tabs/windows');
      };
    });

    return this.initPromise;
  }

  /** Re-initialize after close */
  async ensureDB(): Promise<IDBDatabase> {
    if (!this.db) await this.init();
    return this.db!;
  }

  /** Create a transaction and return the object store helper */
  async storeOp<T>(
    storeName: string,
    mode: IDBTransactionMode,
    cb: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const db = await this.ensureDB();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      const request = cb(store);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        console.error(`[DB] Error on ${storeName}:`, request.error);
        reject(request.error);
      };
      tx.onerror = () => {
        console.error(`[DB] Transaction error on ${storeName}:`, tx.error);
        reject(tx.error);
      };
    });
  }

  invalidateStoreCache(storeName: string): void {
    this.readCache.deleteByPrefix(`${storeName}::`);
    this.readCache.delete(`__list__${storeName}`);
  }

  /** Close the database connection. */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initPromise = null;
    }
  }
}
