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
  private readonly repo: IRecordRepository

  constructor(repo: IRecordRepository) {
    this.repo = repo
  }

  // ==================== Cross-platform sync ====================

  /**
   * Synchronise a record across platforms.
   *
   * **Rules:**
   * 1. **Primary platform:** write if new or if status/rating/comment
   *    differs, or if linkedIds gained new links.
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
      // A newly-discovered link on an otherwise-unchanged record must persist
      // too — otherwise the linked record gets the backward link while the
      // primary never records the forward one (asymmetric drift, umreview D1).
      const mergedLinkedIds = { ...existingPrimary.linkedIds, ...record.linkedIds };
      const linksChanged = Object.entries(record.linkedIds).some(
        ([platform, id]) => existingPrimary.linkedIds[platform] !== id,
      );
      const primaryChanged =
        existingPrimary.status.toNumber() !== record.status.toNumber()
        || existingPrimary.rating.toNumber() !== record.rating.toNumber()
        || existingPrimary.comment !== record.comment
        || linksChanged;

      if (primaryChanged) {
        // Merge: incoming status/rating replace existing, linkedIds union.
        // recordVersion is kept from the existing record (not bumped) so cross-platform
        // sync merges never look like local edits (optimistic-lock semantics).
        const updated = new StoreRecord({
          ...existingPrimary.toSnapshot(),
          status: record.status,
          rating: record.rating,
          comment: record.comment ?? existingPrimary.comment,
          linkedIds: mergedLinkedIds,
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

}


