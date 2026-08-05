/**
 * Optimistic Lock — type definitions for version-based concurrency control.
 */

export type WriteResult =
  | { ok: true; version: number }
  | { ok: false; conflict: { currentVersion: number; expectedVersion: number } }