/**
 * IndexedDB record loading helpers for Douban detail pages.
 */
import { Store } from '@/engine/database';
import type { UrlIdentity, StoreRecord } from '@/types';

/**
 * Load the StoreRecord for the given identity from the douban_records store.
 * Returns null when no record exists or on error.
 */
export async function loadRecord(identity: UrlIdentity): Promise<StoreRecord | null> {
  try {
    const key = `${identity.type}::${identity.providerId}`;
    return await Store.dbGet('douban_records', key);
  } catch {
    return null;
  }
}
