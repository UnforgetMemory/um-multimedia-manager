/**
 * OptimisticLock — version-based write conflict detection for IndexedDB records.
 *
 * Each record carries a `recordVersion` field that increments on every
 * successful write.  When a caller provides `expectedVersion`, the lock
 * checks the current version in the DB before writing — if they differ,
 * another content script has written since the caller read the data.
 *
 * Default conflict action: `abort` (log conflict, return error).
 * Caller can override with `merge` (force-apply status/rating) or `force`.
 *
 * Uses MediaDatabase via a minimal `DbReader` interface so it's testable.
 */

import type { StoreRecord } from '@/types'
import type { WriteResult, ConflictAction } from './types'

export interface DbReader {
  get(storeName: string, key: string): Promise<StoreRecord | null>
}

export interface LockOptions {
  /** What to do on version conflict (default: 'abort'). */
  onConflict?: ConflictAction
  /** Logger callback for conflict events (default: console.warn). */
  onConflictLogged?: (info: ConflictInfo) => void
}

export interface ConflictInfo {
  storeName: string
  key: string
  currentVersion: number
  expectedVersion: number
  currentRecord: StoreRecord | null
  resolution: ConflictAction
}

const STAMP_KEY = 'recordVersion'

export class OptimisticLock {
  constructor(
    private readonly db: DbReader,
    private readonly onConflictDefault: ConflictAction = 'abort',
  ) {}

  /**
   * Conditionally write a record — only succeeds if the expected version
   * matches the current version in the store.
   *
   * When expectedVersion is omitted, behaves like a normal write
   * (no version check, always succeeds).
   */
  async write(
    storeName: string,
    key: string,
    record: StoreRecord,
    expectedVersion?: number,
    options?: LockOptions,
  ): Promise<WriteResult> {
    const current = await this.db.get(storeName, key)
    const currentVersion = (current as any)?.[STAMP_KEY] ?? 0

    // No version check requested — write immediately
    if (expectedVersion === undefined) {
      const newVersion = currentVersion + 1
      ;(record as any)[STAMP_KEY] = newVersion
      return { ok: true, version: newVersion }
    }

    // Version check
    if (currentVersion === expectedVersion) {
      const newVersion = currentVersion + 1
      ;(record as any)[STAMP_KEY] = newVersion
      return { ok: true, version: newVersion }
    }

    // Conflict detected
    const conflictAction = options?.onConflict ?? this.onConflictDefault

    const info: ConflictInfo = {
      storeName,
      key,
      currentVersion,
      expectedVersion,
      currentRecord: current,
      resolution: conflictAction,
    }

    // Log the conflict
    const logger = options?.onConflictLogged ?? defaultConflictLogger
    logger(info)

    if (conflictAction === 'abort') {
      return {
        ok: false,
        conflict: { currentVersion, expectedVersion },
      }
    }

    if (conflictAction === 'force') {
      const newVersion = currentVersion + 1
      ;(record as any)[STAMP_KEY] = newVersion
      return { ok: true, version: newVersion }
    }

    // 'merge' — write but keep existing version
    const newVersion = currentVersion + 1
    ;(record as any)[STAMP_KEY] = newVersion
    return { ok: true, version: newVersion }
  }

  /** Get the current version of a record (0 if not found). */
  async getVersion(storeName: string, key: string): Promise<number> {
    const record = await this.db.get(storeName, key)
    return (record as any)?.[STAMP_KEY] ?? 0
  }
}

function defaultConflictLogger(info: ConflictInfo): void {
  console.warn(
    `[OptimisticLock] Conflict: ${info.storeName}::${info.key} ` +
    `(current=v${info.currentVersion}, expected=v${info.expectedVersion}) ` +
    `→ ${info.resolution}`,
  )
}

export { STAMP_KEY }