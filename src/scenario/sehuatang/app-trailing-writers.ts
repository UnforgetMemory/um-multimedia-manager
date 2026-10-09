/**
 * Pending trailing throttle writers owned by the Sehuatang list overlay.
 *
 * `throttle()` keeps its trailing timer inside a closure, so a teardown that
 * only disconnects observers / unsubscribes events still leaves a scheduled
 * write: measured behaviour was a background read plus a card appended into the
 * already-detached grid, and a record-sync toast firing twice after release.
 *
 * The per-run throttles (pagination flush 250ms, record sync 300ms) register
 * here and are cancelled by `releaseTrailingWriters()`, which keeps the
 * module-level ones (stats refresh 120ms) registered for the next run.
 */
const permanent: { cancel(): void }[] = [];
let pending: Set<{ cancel(): void }> = new Set(permanent);

/** Register a throttle created during the current page run. */
export function trackTrailingWriter(writer: { cancel(): void }): void {
  pending.add(writer);
}

/** Register several per-run throttles at once (they are created in pairs). */
export function trackTrailingWriters(writers: readonly { cancel(): void }[]): void {
  for (const writer of writers) pending.add(writer);
}

/** Declare a module-level throttle that must survive a release-and-re-run. */
export function declarePermanentTrailingWriter(writer: { cancel(): void }): void {
  permanent.push(writer);
}

/** Cancel everything outstanding, then reset to the permanent set. */
export function releaseTrailingWriters(): void {
  for (const writer of pending) writer.cancel();
  pending = new Set(permanent);
}

/** Test seam: how many writers are currently armed. */
export function armedTrailingWriters(): number {
  return pending.size;
}
