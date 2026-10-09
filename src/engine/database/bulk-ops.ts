/**
 * Cross-store bulk maintenance — full export read and full wipe (split from ./models).
 * Export path (WebDAV backup) and reset flows are the only callers.
 */

import type { StoreRecord } from '@/types';
import { getAll } from './record-store';
import { RECORD_STORES, ADULT_STORES } from './schema';
import type { DatabaseConnection } from './connection';

/** Get all records from all record stores + adult stores (for export). */
export async function getAllStores(
  conn: DatabaseConnection,
): Promise<Record<string, Record<string, StoreRecord>>> {
  const result: Record<string, Record<string, StoreRecord>> = {};

  for (const storeName of RECORD_STORES) {
    const entries = await getAll(conn, storeName);
    const map: Record<string, StoreRecord> = {};
    for (const entry of entries) {
      map[entry.key] = entry.record;
    }
    result[storeName] = map;
  }

  // Include adult stores (not in RECORD_STORES but need export support)
  for (const storeName of ADULT_STORES) {
    const entries = await getAll(conn, storeName);
    if (entries.length > 0) {
      const map: Record<string, StoreRecord> = {};
      for (const entry of entries) {
        map[entry.key] = entry.record;
      }
      result[storeName] = map;
    }
  }

  return result;
}

/** Clear all records from all stores. */
export async function clearAll(conn: DatabaseConnection): Promise<void> {
  const db = await conn.ensureDB();
  const allStoreNames = Array.from(db.objectStoreNames);
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(allStoreNames, 'readwrite');
    for (const name of allStoreNames) {
      tx.objectStore(name).clear();
    }
    tx.oncomplete = () => {
      conn.readCache.clear();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}
