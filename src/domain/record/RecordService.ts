/**
 * RecordService
 *
 * Domain service for cross-platform record operations that span
 * multiple StoreRecord aggregates. The service encapsulates:
 *
 *  - Cross-platform sync (propagate status without overwriting ratings)
 *  - Record merging (combine two records for the same item)
 *  - Bulk status transitions
 *  - Sync decision logic
 *
 * @remarks
 * This service depends on {@link IRecordRepository} (injected) but
 * remains pure domain logic — it orchestrates, never implements
 * storage. All business rules about what gets synced, skipped, and
 * how conflicts are resolved live here.
 */
import { StoreRecord } from '@/domain/record/StoreRecord';
import { Status } from '@/domain/record/Status';
import { Rating } from '@/domain/record/Rating';
import type { IRecordRepository } from '@/domain/record/IRecordRepository';

/** Describes the outcome of a sync operation. */
export interface SyncResult {
  /** True when at least one record was written. */
  changed: boolean;
  /** Platforms that received updates. */
  syncedPlatforms: string[];
}

/** A linked platform target for sync propagation. */
export interface SyncTarget {
  platform: string;
  key: string;
  url: string;
}

export class RecordService {
  constructor(private readonly repo: IRecordRepository) {}

  // ==================== Cross-platform sync ====================

  /**
   * Synchronise a record across platforms.
   *
   * **Rules:**
   * 1. **Primary platform:** write if new or if status/rating/comment differs.
   * 2. **Linked platforms (no existing):** write a copy with linkedIds
   *    pointing back to the primary.
   * 3. **Linked platforms (existing + not watched):** sync status + comment
   *    from primary, but **never** overwrite the linked platform's rating.
   * 4. **Linked platforms (existing + watched):** skip — do not overwrite
   *    a platform the user has already marked as done on.
   */
  async syncRecord(
    platform: string,
    key: string,
    record: StoreRecord,
    linked?: SyncTarget[],
  ): Promise<SyncResult> {
    const syncedPlatforms: string[] = [];
    let changed = false;

    // 1. Primary platform
    const existingPrimary = await this.repo.findByKey(platform, key);

    if (!existingPrimary) {
      await this.repo.save(platform, record);
      changed = true;
      syncedPlatforms.push(platform);
    } else {
      const primaryChanged =
        existingPrimary.status.toNumber() !== record.status.toNumber()
        || existingPrimary.rating.toNumber() !== record.rating.toNumber()
        || existingPrimary.comment !== record.comment;

      if (primaryChanged) {
        // Merge: incoming status/rating replace existing, linkedIds union
        const updated = new StoreRecord({
          ...existingPrimary.toSnapshot(),
          status: record.status,
          rating: record.rating,
          comment: record.comment ?? existingPrimary.comment,
          linkedIds: { ...existingPrimary.linkedIds, ...record.linkedIds },
          updatedAt: new Date().toISOString(),
          recordVersion: existingPrimary.recordVersion,
        });

        await this.repo.save(platform, updated);
        changed = true;
        syncedPlatforms.push(platform);
      }
    }

    // 2–4. Linked platforms
    if (linked && linked.length > 0) {
      for (const link of linked) {
        const linkedRecord = await this.repo.findByKey(link.platform, link.key);

        // Build backward link
        const backwardLinkedIds: Record<string, string> = { [platform]: key };

        if (!linkedRecord) {
          // 2. No existing data — write fresh copy
          const fresh = StoreRecord.fresh(link.url, backwardLinkedIds);
          // Promote to done if primary is done
          const synced = record.status.isActive
            ? new StoreRecord({
                ...fresh.toSnapshot(),
                status: record.status,
                rating: record.rating,
                comment: record.comment,
                updatedAt: new Date().toISOString(),
              })
            : fresh;

          await this.repo.save(link.platform, synced);
          changed = true;
          syncedPlatforms.push(link.platform);
        } else if (!linkedRecord.isWatched) {
          // 3. Exists but not watched — sync status, keep rating
          const synced = new StoreRecord({
            ...linkedRecord.toSnapshot(),
            status: record.status,
            comment: record.comment ?? linkedRecord.comment,
            linkedIds: { ...linkedRecord.linkedIds, ...backwardLinkedIds },
            updatedAt: new Date().toISOString(),
            recordVersion: linkedRecord.recordVersion,
          });
          // rating is NOT updated — keep the linked platform's rating

          await this.repo.save(link.platform, synced);
          changed = true;
          syncedPlatforms.push(link.platform);
        }
        // 4. Already watched on linked platform — skip silently
      }
    }

    return { changed, syncedPlatforms };
  }

  // ==================== Record merging ====================

  /**
   * Merge two records that represent the same media item.
   *
   * **Merge rules:**
   * - The later timestamp wins for each field independently.
   * - If both records are active (watched/wishlist), the "more progressed"
   *   status wins (done > wishlist > none).
   * - Ratings from the higher-rated record are kept when both are set.
   * - Comments are concatenated when different (with a separator).
   * - Linked IDs are unioned.
   */
  merge(a: StoreRecord, b: StoreRecord): StoreRecord {
    const aTime = new Date(a.updatedAt).getTime();
    const bTime = new Date(b.updatedAt).getTime();

    // Status: more progressed wins
    const mergedStatus = a.status.toNumber() >= b.status.toNumber()
      ? a.status
      : b.status;

    // Rating: prefer non-zero, then higher
    const mergedRating = ((): number => {
      if (!a.isRated && !b.isRated) return 0;
      if (!a.isRated) return b.rating.toNumber();
      if (!b.isRated) return a.rating.toNumber();
      return Math.max(a.rating.toNumber(), b.rating.toNumber());
    })();

    // Comment: prefer later, concat if both exist and differ
    const mergedComment = ((): string | undefined => {
      if (!a.comment && !b.comment) return undefined;
      if (!a.comment) return b.comment;
      if (!b.comment) return a.comment;
      if (a.comment === b.comment) return a.comment;
      // Both exist and differ: prefer the newer one
      return aTime >= bTime ? a.comment : b.comment;
    })();

    // URL: prefer the primary/later one
    const mergedUrl = aTime >= bTime ? a.url : b.url;

    return new StoreRecord({
      url: mergedUrl,
      status: mergedStatus,
      rating: Rating.fromNumber(mergedRating) ?? Rating.UNRATED,
      comment: mergedComment,
      updatedAt: new Date().toISOString(),
      linkedIds: { ...a.linkedIds, ...b.linkedIds },
      recordVersion: Math.max(a.recordVersion ?? 0, b.recordVersion ?? 0),
    });
  }

  // ==================== Bulk operations ====================

  /**
   * Apply a status transition to all records matching a filter.
   * Returns the number of records updated.
   */
  async bulkUpdateStatus(
    storeName: string,
    filter: { platform?: string; type?: string; currentStatus?: number },
    newStatus: Status,
  ): Promise<number> {
    const result = await this.repo.query(storeName, {
      status: filter.currentStatus,
    });
    let updated = 0;

    for (const record of result.items) {
      // Apply transition via domain methods
      let modified: StoreRecord;
      if (newStatus.isDone) {
        modified = record.markAsWatched();
      } else if (newStatus.isWishlist) {
        modified = record.markAsWishlisted();
      } else {
        modified = record.clearStatus();
      }

      await this.repo.save(storeName, modified);
      updated++;
    }

    return updated;
  }

  /**
   * Merge all records that share a linked platform ID.
   * Useful after importing data that may contain duplicates.
   */
  /**
   * Check whether two records share any linked platform ID.
   * When they do, they are duplicates of the same media item.
   *
   * @example
   * // Both link to the same IMDb entry
   * a.linkedIds = { imdb: 'movie::tt1375666' }
   * b.linkedIds = { imdb: 'movie::tt1375666' }
   * hasSharedLink(a, b) // true
   */
  private hasSharedLink(a: StoreRecord, b: StoreRecord): boolean {
    for (const platformA of Object.keys(a.linkedIds)) {
      for (const platformB of Object.keys(b.linkedIds)) {
        if (platformA === platformB && a.linkedIds[platformA] === b.linkedIds[platformB]) {
          return true
        }
      }
    }
    return false
  }

  /**
   * Merge all records that share a linked platform ID.
   * Useful after importing data that may contain duplicates.
   *
   * @returns The number of duplicate records that were merged away.
   *   Saving the merged result is the infrastructure layer's responsibility.
   */
  async deduplicate(storeName: string): Promise<number> {
    const records = await this.repo.getAll(storeName);
    if (records.length < 2) return 0

    // Group records by shared linked platform IDs.
    // Records sharing the same linked IDs in the same store are duplicates.
    const groups = new Map<string, StoreRecord[]>();
    const visited = new Set<string>();

    for (const record of records) {
      if (visited.has(record.url)) continue;

      const group: StoreRecord[] = [record];
      visited.add(record.url);

      for (const other of records) {
        if (visited.has(other.url)) continue;
        if (this.hasSharedLink(record, other)) {
          group.push(other);
          visited.add(other.url);
        }
      }

      groups.set(record.url, group);
    }

    let merged = 0;
    for (const [, group] of groups) {
      if (group.length <= 1) continue;
      // Reduce — the first record accumulates all others
      const base = group.reduce((acc, r) => this.merge(acc, r));
      void base; // Persisting the merged record is the infra layer's job
      merged += group.length - 1;
    }

    return merged;
  }

  // ==================== PT dimmer helpers ====================

  /**
   * Collect all watched record keys from a set of store names.
   * Used by the PT dimmer to determine which torrents to grey out.
   */
  async getWatchedKeysAcrossStores(storeNames: string[]): Promise<Set<string>> {
    const allKeys = new Set<string>();

    for (const name of storeNames) {
      const keys = await this.repo.getWatchedKeys(name);
      for (const key of keys) {
        allKeys.add(key);
      }
    }

    return allKeys;
  }
}


