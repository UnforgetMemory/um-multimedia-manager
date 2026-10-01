/**
 * Trailing-edge debounce scheduler — pure, injectable timer surface.
 *
 * WHY here (libraries/utils) and not under a scenario: this is a scheduling
 * primitive with no DOM, store, or page knowledge. PT dimmer, mukaku refresh
 * and Douban's record cache all coalesce event storms through the same
 * 300ms trailing-edge window; a single source keeps those windows from
 * drifting apart (audit rule: one rule, one mechanism per physical face).
 */

/** Injected timer surface (production: window.setTimeout / clearTimeout). */
export interface TimerAdapter {
  setTimeout(callback: () => void, ms: number): number;
  clearTimeout(handle: number): void;
}

export interface DebouncedScheduler {
  /** Merge calls inside `delay`; only the latest callback fires after quiet. */
  schedule(callback: () => void): void;
  /** Drop a queued callback (teardown must stop already-scheduled work). */
  cancel(): void;
}

export function createDebouncedScheduler(delay: number, timer: TimerAdapter): DebouncedScheduler {
  let handle: number | null = null;
  return {
    schedule(callback: () => void): void {
      if (handle !== null) timer.clearTimeout(handle);
      handle = timer.setTimeout(() => {
        handle = null;
        callback();
      }, delay);
    },
    cancel(): void {
      if (handle !== null) {
        timer.clearTimeout(handle);
        handle = null;
      }
    },
  };
}
