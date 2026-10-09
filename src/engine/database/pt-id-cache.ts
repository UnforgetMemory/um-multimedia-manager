/**
 * PT ID cache store operations — PT torrent URL → platform ID associations
 * (split from ./models). Entries are versioned via stampCacheVersion and
 * normalized via normalizeCacheEntry on read, with write-back of migrated entries.
 */

import type { PtIdCacheEntry } from '@/types';
import { normalizeCacheEntry, stampCacheVersion, MigrationError } from '@/engine/migration/models';
import { STORE_NAMES } from './schema';
import type { DatabaseConnection } from './connection';

/** Get a PT ID cache entry by URL. Normalizes on read. */
export async function getCacheEntry(
  conn: DatabaseConnection,
  ptUrl: string,
): Promise<PtIdCacheEntry | null> {
  const db = await conn.ensureDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAMES.PT_ID_CACHE, 'readonly');
    const store = tx.objectStore(STORE_NAMES.PT_ID_CACHE);
    const request = store.get(ptUrl);

    request.onsuccess = () => {
      if (!request.result) {
        resolve(null);
        return;
      }
      try {
        const { record, migrated } = normalizeCacheEntry(request.result);
        if (migrated) {
          putCacheEntry(conn, record).catch((err) => {
            console.warn(`[DB] Failed to write back migrated cache entry ${ptUrl}:`, err);
          });
        }
        resolve(record);
      } catch (err: unknown) {
        if (err instanceof MigrationError) {
          console.error(`[DB] Cache migration failed for ${ptUrl}:`, err.message);
          resolve(request.result as PtIdCacheEntry);
        } else {
          reject(err);
        }
      }
    };
    request.onerror = () => reject(request.error);
    tx.onerror = () => reject(tx.error);
  });
}

/** Batch get PT ID cache entries by URL in a single transaction. Missing keys are omitted. */
export async function getCacheEntries(
  conn: DatabaseConnection,
  ptUrls: string[],
): Promise<Record<string, PtIdCacheEntry>> {
  if (ptUrls.length === 0) return {};
  const db = await conn.ensureDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAMES.PT_ID_CACHE, 'readonly');
    const store = tx.objectStore(STORE_NAMES.PT_ID_CACHE);
    const entries: Record<string, PtIdCacheEntry> = {};

    for (const ptUrl of ptUrls) {
      const request = store.get(ptUrl);
      request.onsuccess = () => {
        if (!request.result) return;
        try {
          const { record, migrated } = normalizeCacheEntry(request.result);
          if (migrated) {
            putCacheEntry(conn, record).catch((err) => {
              console.warn(`[DB] Failed to write back migrated cache entry ${ptUrl}:`, err);
            });
          }
          entries[ptUrl] = record;
        } catch (err: unknown) {
          if (err instanceof MigrationError) {
            console.error(`[DB] Cache migration failed for ${ptUrl}:`, err.message);
            entries[ptUrl] = request.result as PtIdCacheEntry;
          } else {
            reject(err);
          }
        }
      };
    }

    tx.oncomplete = () => resolve(entries);
    tx.onerror = () => reject(tx.error);
  });
}

export async function putCacheEntry(
  conn: DatabaseConnection,
  entry: PtIdCacheEntry,
): Promise<void> {
  const db = await conn.ensureDB();
  const stamped = stampCacheVersion(entry);
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAMES.PT_ID_CACHE, 'readwrite');
    const store = tx.objectStore(STORE_NAMES.PT_ID_CACHE);
    const request = store.put(stamped, stamped.ptUrl);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    tx.onerror = () => reject(tx.error);
  });
}
