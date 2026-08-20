import { test, expect } from '@playwright/test'
import {
  migrateRecord,
  validateExportVersion,
  getMigrationInfo,
  stampRecordVersion,
  stampCacheVersion,
  MigrationError,
  CURRENT_EXPORT_VERSION,
  MIN_SUPPORTED_EXPORT_VERSION,
  CURRENT_RECORD_VERSION,
  CURRENT_CACHE_VERSION,
} from '@/features/migration/models'
import type { MigrationStep } from '@/features/migration/models'

/**
 * Migration/version-compatibility contract tests.
 *
 * Covers the branches that the earlier migration specs did not:
 * - validateExportVersion (the export-JSON import gate — counterpart to the
 *   already-tested validateDatasetVersion)
 * - migrateRecord engine error branches (VERSION_TOO_NEW / TOO_OLD /
 *   NO_MIGRATION_PATH / MIGRATION_FAILED) plus the happy path
 * - getMigrationInfo / stampRecordVersion / stampCacheVersion (version surface)
 */

function captureMigrationError(fn: () => unknown): MigrationError {
  let caught: unknown
  try {
    fn()
  } catch (err) {
    caught = err
  }
  expect(caught, 'expected a MigrationError to be thrown').toBeInstanceOf(MigrationError)
  return caught as MigrationError
}

test.describe('validateExportVersion', () => {
  test('CURRENT_EXPORT_VERSION passes', () => {
    expect(validateExportVersion(CURRENT_EXPORT_VERSION)).toBe(true)
  })

  test('below MIN_SUPPORTED_EXPORT_VERSION throws IMPORT_INCOMPATIBLE', () => {
    const err = captureMigrationError(() => validateExportVersion(MIN_SUPPORTED_EXPORT_VERSION - 1))
    expect(err.code).toBe('IMPORT_INCOMPATIBLE')
  })

  test('above CURRENT_EXPORT_VERSION throws IMPORT_INCOMPATIBLE (too new)', () => {
    const err = captureMigrationError(() => validateExportVersion(CURRENT_EXPORT_VERSION + 1))
    expect(err.code).toBe('IMPORT_INCOMPATIBLE')
  })
})

test.describe('migrateRecord — engine branches', () => {
  const steps: MigrationStep[] = [
    { from: 0, to: 1, migrate: (r) => ({ ...r, url: r.url ?? '', schemaVersion: 1 }) },
    { from: 1, to: 2, migrate: (r) => ({ ...r, comment: r.comment ?? undefined, schemaVersion: 2 }) },
  ]

  test('already at current version → no migration, empty steps', () => {
    const res = migrateRecord({ schemaVersion: 2, url: 'u' }, steps, 2)
    expect(res.migrated).toBe(false)
    expect(res.steps).toEqual([])
  })

  test('0 → 2 happy path applies steps in order and stamps version', () => {
    const res = migrateRecord({ schemaVersion: 0, url: 'u', status: 1 }, steps, 2)
    expect(res.migrated).toBe(true)
    expect(res.steps).toEqual([1, 2])
    expect(res.record.schemaVersion).toBe(2)
    expect(res.record.status).toBe(1)
    expect(res.record.comment).toBeUndefined()
  })

  test('VERSION_TOO_NEW when record schemaVersion exceeds current', () => {
    const err = captureMigrationError(() => migrateRecord({ schemaVersion: 3 }, steps, 2))
    expect(err.code).toBe('VERSION_TOO_NEW')
  })

  test('VERSION_TOO_OLD when below minSupported', () => {
    const err = captureMigrationError(() => migrateRecord({ schemaVersion: -1 }, steps, 2))
    expect(err.code).toBe('VERSION_TOO_OLD')
  })

  test('NO_MIGRATION_PATH when a version has no matching step', () => {
    const gapped = [{ from: 0, to: 2, migrate: (r) => ({ ...r, schemaVersion: 2 }) }]
    const err = captureMigrationError(() => migrateRecord({ schemaVersion: 1 }, gapped, 2))
    expect(err.code).toBe('NO_MIGRATION_PATH')
  })

  test('MIGRATION_FAILED when a step transform throws', () => {
    const bad = [{ from: 0, to: 1, migrate: () => { throw new Error('boom') } }]
    const err = captureMigrationError(() => migrateRecord({ schemaVersion: 0 }, bad, 1))
    expect(err.code).toBe('MIGRATION_FAILED')
  })
})

test.describe('version surface helpers', () => {
  test('getMigrationInfo exposes current + min versions and step counts', () => {
    const info = getMigrationInfo()
    expect(info.currentRecordVersion).toBe(CURRENT_RECORD_VERSION)
    expect(info.currentCacheVersion).toBe(CURRENT_CACHE_VERSION)
    expect(info.currentExportVersion).toBe(CURRENT_EXPORT_VERSION)
    expect(info.minSupportedExportVersion).toBe(MIN_SUPPORTED_EXPORT_VERSION)
    expect(info.recordMigrationSteps).toBeGreaterThan(0)
  })

  test('stampRecordVersion writes CURRENT_RECORD_VERSION', () => {
    const stamped = stampRecordVersion({ url: 'u', status: 2, rating: 0, updatedAt: 't', linkedIds: {} })
    expect(stamped.schemaVersion).toBe(CURRENT_RECORD_VERSION)
  })

  test('stampCacheVersion writes CURRENT_CACHE_VERSION', () => {
    const stamped = stampCacheVersion({ ptUrl: 'u', updatedAt: 't' })
    expect(stamped.schemaVersion).toBe(CURRENT_CACHE_VERSION)
  })
})