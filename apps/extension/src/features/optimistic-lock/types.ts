/**
 * Optimistic Lock — type definitions for version-based concurrency control.
 */

export type WriteResult =
  | { ok: true; version: number }
  | { ok: false; conflict: { currentVersion: number; expectedVersion: number } }

export type ConflictAction =
  /** Abort the write entirely (return conflict error). */
  | 'abort'
  /** Force-overwrite the record despite the conflict. */
  | 'force'
  /** Merge: apply status/rating changes but keep the existing version. */
  | 'merge'