/**
 * Timeout-guarded fetch + promise deadline helpers.
 *
 * Shared by content-scenario pages and background handlers so no network
 * call can hang a worker/message channel forever (audit 2026-09-25 §P-C).
 */

export const DEFAULT_FETCH_TIMEOUT_MS = 15_000;

/**
 * `fetch` with a hard deadline (Chrome 103+ `AbortSignal.timeout`).
 * A caller-provided `init.signal` wins; otherwise a timeout signal is attached.
 */
export function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<Response> {
  return fetch(input, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(timeoutMs),
  });
}

/**
 * Reject with `Error(message)` if `promise` has not settled within `timeoutMs`.
 * The timer is cleared once the race settles, so no stray rejections leak.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message = 'Operation timed out',
): Promise<T> {
  const { promise: timeoutPromise, reject } = Promise.withResolvers<never>();
  const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}
