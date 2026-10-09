import { getCurrentInstance, onUnmounted } from 'vue';

/** Trailing window shared by every debounced query box (options tabs). */
export const DEBOUNCED_QUERY_DELAY_MS = 500;

/** How many extra windows a request waits while a pass is still in flight. */
export const MAX_BUSY_RETRIES = 5;

export interface DebouncedQueryOptions {
  /** Override the trailing window (tests use short values). */
  delay?: number;
  /**
   * In-flight guard: while true no second pass starts. A newer request is kept
   * pending (re-armed) rather than discarded, bounded by MAX_BUSY_RETRIES.
   */
  isRunning?: () => boolean;
  /**
   * Failure seam. A rejected/throwing query is never swallowed here: it lands
   * on `onError` (caller decides the user-visible channel) or on the console.
   */
  onError?: (error: unknown) => void;
}

export interface DebouncedQuery<A extends unknown[] = []> {
  /** Schedule a trailing invocation, latest call wins; args pass through. */
  run: (...args: A) => void;
  /** Drop the pending invocation without forbidding later ones. */
  cancel: () => void;
  /** Cancel and stop accepting further `run` calls. Auto-called on unmount. */
  dispose: () => void;
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

/**
 * Single source of truth for the "user types → query local state" pattern:
 * coalesces rapid calls into one trailing pass, guards re-entry while a pass
 * is running, cancels the pending pass on dispose/unmount, and surfaces query
 * failures instead of swallowing them.
 */
export function useDebouncedQuery<A extends unknown[] = []>(
  query: (...args: A) => unknown,
  options: DebouncedQueryOptions = {},
): DebouncedQuery<A> {
  const delay = options.delay ?? DEBOUNCED_QUERY_DELAY_MS;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const cancel = (): void => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
  };

  const fail = (error: unknown): void => {
    if (options.onError) {
      options.onError(error);
      return;
    }
    console.warn('[UMM] useDebouncedQuery failed:', error);
  };

  const invoke = (args: A): void => {
    try {
      const result = query(...args);
      // WHY: a promise rejection must not become an unhandled rejection here;
      // it is routed to the same failure seam as a synchronous throw.
      if (isThenable(result)) result.then(undefined, fail);
    } catch (error) {
      fail(error);
    }
  };

  const arm = (args: A, attempt: number): void => {
    cancel();
    timer = setTimeout(() => {
      timer = null;
      if (disposed) return;
      if (options.isRunning?.() === true) {
        // WHY re-arm instead of drop: discarding loses the newest keystroke and
        // leaves the panel showing results for stale input. The retry cap keeps a
        // hung pass from spinning; past it the request is dropped as before.
        if (attempt < MAX_BUSY_RETRIES) arm(args, attempt + 1);
        return;
      }
      invoke(args);
    }, delay);
  };

  const run = (...args: A): void => {
    if (disposed) return;
    arm(args, 0);
  };

  const dispose = (): void => {
    disposed = true;
    cancel();
  };

  // Inside a component setup the pending pass must not survive unmount;
  // outside one (tests, plain modules) the caller owns `dispose`.
  if (getCurrentInstance()) onUnmounted(dispose);

  return { run, cancel, dispose };
}
