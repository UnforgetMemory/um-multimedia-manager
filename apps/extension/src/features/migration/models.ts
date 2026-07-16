/**
 * Record-level Schema Migration System
 *
 * Provides iterative, step-by-step data migration for StoreRecord and PtIdCacheEntry.
 * Each migration step transforms records from version N to N+1.
 * Records are migrated on read and stamped on write.
 *
 * Architecture:
 * - MigrationStep: { from, to, migrate(record) → record }
 * - migrateRecord(): applies steps iteratively until CURRENT_RECORD_VERSION
 * - MigrationError: thrown when migration fails or version is unsupported
 * - MediaDatabase calls normalizeRecord() on every read path
 *
 * Adding a new migration:
 * 1. Increment CURRENT_RECORD_VERSION
 * 2. Add a MigrationStep { from: prev, to: new, migrate: fn }
 * 3. Done — all existing records auto-migrate on next read
 */

import type { StoreRecord, PtIdCacheEntry } from '@/types'

// ==================== Version Constants ====================

/** Current schema version for StoreRecord */
export const CURRENT_RECORD_VERSION = 2

/** Current schema version for PtIdCacheEntry */
export const CURRENT_CACHE_VERSION = 1

/** Minimum supported record version (below this = data too old) */
export const MIN_SUPPORTED_RECORD_VERSION = 0

/** Minimum supported export data version */
export const MIN_SUPPORTED_EXPORT_VERSION = 1

/** Current export data version */
export const CURRENT_EXPORT_VERSION = 2

// ==================== Error Types ====================

export class MigrationError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'VERSION_TOO_OLD'
      | 'VERSION_TOO_NEW'
      | 'NO_MIGRATION_PATH'
      | 'MIGRATION_FAILED'
      | 'IMPORT_INCOMPATIBLE',
    public readonly details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'MigrationError'
  }
}

// ==================== Migration Step Interface ====================

export interface MigrationStep {
  /** Source version (0 = unversioned legacy) */
  from: number
  /** Target version */
  to: number
  /** Transform function — receives raw record, returns migrated record */
  migrate: (record: any) => any
}

// ==================== Record Migrations ====================

/**
 * Ordered list of migration steps for StoreRecord.
 * Each step transforms from version N to N+1.
 * Steps MUST be ordered by `from` ascending.
 */
const recordMigrations: MigrationStep[] = [
  {
    from: 0,
    to: 1,
    migrate: (record: any) => ({
      ...record,
      // Ensure all required fields exist with defaults
      url: record.url ?? '',
      status: typeof record.status === 'number' ? record.status : 0,
      rating: typeof record.rating === 'number' ? record.rating : 0,
      updatedAt: record.updatedAt ?? new Date().toISOString(),
      linkedIds: record.linkedIds ?? {},
      // Stamp version
      schemaVersion: 1,
    }),
  },
  {
    from: 1,
    to: 2,
    migrate: (record: any) => ({
      ...record,
      // Ensure comment field exists
      comment: record.comment ?? undefined,
      // Stamp version
      schemaVersion: 2,
    }),
  },
]

/**
 * Ordered list of migration steps for PtIdCacheEntry.
 */
const cacheMigrations: MigrationStep[] = [
  {
    from: 0,
    to: 1,
    migrate: (entry: any) => ({
      ...entry,
      ptUrl: entry.ptUrl ?? '',
      doubanId: entry.doubanId ?? undefined,
      imdbId: entry.imdbId ?? undefined,
      updatedAt: entry.updatedAt ?? new Date().toISOString(),
      schemaVersion: 1,
    }),
  },
]

// ==================== Migration Engine ====================

export interface MigrationResult<T> {
  /** The migrated record (or original if no migration needed) */
  record: T
  /** Whether any migration was applied */
  migrated: boolean
  /** List of version numbers that were applied (e.g., [1] means 0→1) */
  steps: number[]
}

/**
 * Iteratively migrate a record through each version step until CURRENT_RECORD_VERSION.
 *
 * Algorithm:
 * 1. Read current schemaVersion (default 0 for legacy)
 * 2. If > CURRENT → throw VERSION_TOO_NEW
 * 3. If < MIN_SUPPORTED → throw VERSION_TOO_OLD
 * 4. While version < CURRENT:
 *    a. Find migration step with `from === currentVersion`
 *    b. If no step found → throw NO_MIGRATION_PATH
 *    c. Apply step, advance version
 * 5. Return migrated record
 */
export function migrateRecord(
  raw: any,
  steps: MigrationStep[],
  currentVersion: number,
  minSupported: number = 0
): MigrationResult<any> {
  const recordVersion = raw?.schemaVersion ?? 0

  // Already at current version — no migration needed
  if (recordVersion === currentVersion) {
    return { record: raw, migrated: false, steps: [] }
  }

  // Version too new — data from a newer extension version
  if (recordVersion > currentVersion) {
    throw new MigrationError(
      `Record schema version ${recordVersion} is newer than supported version ${currentVersion}. ` +
        `Please update the extension.`,
      'VERSION_TOO_NEW',
      { recordVersion, currentVersion }
    )
  }

  // Version too old — below minimum supported
  if (recordVersion < minSupported) {
    throw new MigrationError(
      `Record schema version ${recordVersion} is too old (minimum supported: ${minSupported}). ` +
        `Data may be corrupted or from an incompatible version.`,
      'VERSION_TOO_OLD',
      { recordVersion, minSupported }
    )
  }

  // Iterative migration: apply each step in order
  let result = { ...raw }
  const appliedSteps: number[] = []
  let version = recordVersion

  while (version < currentVersion) {
    const step = steps.find((s) => s.from === version)
    if (!step) {
      throw new MigrationError(
        `No migration path from schema version ${version} to ${currentVersion}. ` +
          `Missing migration step for version ${version}.`,
        'NO_MIGRATION_PATH',
        { currentVersion: version, targetVersion: currentVersion }
      )
    }

    try {
      result = step.migrate(result)
      version = step.to
      appliedSteps.push(step.to)
    } catch (err) {
      throw new MigrationError(
        `Migration from v${step.from} to v${step.to} failed: ${err instanceof Error ? err.message : String(err)}`,
        'MIGRATION_FAILED',
        { from: step.from, to: step.to, error: err }
      )
    }
  }

  return { record: result, migrated: true, steps: appliedSteps }
}

/**
 * Normalize a StoreRecord on read.
 * Applies iterative migrations if the record's schemaVersion is behind.
 * Returns the migrated record (caller should write it back if migrated).
 */
export function normalizeStoreRecord(raw: any): MigrationResult<StoreRecord> {
  return migrateRecord(raw, recordMigrations, CURRENT_RECORD_VERSION, MIN_SUPPORTED_RECORD_VERSION) as MigrationResult<StoreRecord>
}

/**
 * Normalize a PtIdCacheEntry on read.
 */
export function normalizeCacheEntry(raw: any): MigrationResult<PtIdCacheEntry> {
  return migrateRecord(raw, cacheMigrations, CURRENT_CACHE_VERSION, MIN_SUPPORTED_RECORD_VERSION) as MigrationResult<PtIdCacheEntry>
}

/**
 * Stamp a StoreRecord with the current schema version before write.
 * Ensures all records written to DB have the correct version.
 */
export function stampRecordVersion(record: StoreRecord): StoreRecord {
  return { ...record, schemaVersion: CURRENT_RECORD_VERSION }
}

/**
 * Stamp a PtIdCacheEntry with the current cache version before write.
 */
export function stampCacheVersion(entry: PtIdCacheEntry): PtIdCacheEntry {
  return { ...entry, schemaVersion: CURRENT_CACHE_VERSION }
}

/**
 * Validate export data compatibility.
 * Returns true if importable, throws MigrationError if not.
 */
export function validateExportVersion(exportVersion: number): boolean {
  if (exportVersion < MIN_SUPPORTED_EXPORT_VERSION) {
    throw new MigrationError(
      `Export data version ${exportVersion} is too old to import (minimum supported: ${MIN_SUPPORTED_EXPORT_VERSION}). ` +
        `Please export from a newer version of the extension first.`,
      'IMPORT_INCOMPATIBLE',
      { exportVersion, minSupported: MIN_SUPPORTED_EXPORT_VERSION }
    )
  }
  if (exportVersion > CURRENT_EXPORT_VERSION) {
    throw new MigrationError(
      `Export data version ${exportVersion} was created by a newer version of the extension. ` +
        `Please update before importing.`,
      'IMPORT_INCOMPATIBLE',
      { exportVersion, currentVersion: CURRENT_EXPORT_VERSION }
    )
  }
  return true
}

/**
 * Get migration status info for diagnostics.
 */
export function getMigrationInfo() {
  return {
    currentRecordVersion: CURRENT_RECORD_VERSION,
    currentCacheVersion: CURRENT_CACHE_VERSION,
    currentExportVersion: CURRENT_EXPORT_VERSION,
    minSupportedRecordVersion: MIN_SUPPORTED_RECORD_VERSION,
    minSupportedExportVersion: MIN_SUPPORTED_EXPORT_VERSION,
    recordMigrationSteps: recordMigrations.length,
    cacheMigrationSteps: cacheMigrations.length,
  }
}
