import { sleep } from '@/utils'

export interface WithRetryOptions<T> {
  /** Max number of attempts. Defaults to 8. */
  attempts?: number
  /** Base delay in ms; the wait before retry N is `baseDelay * (N + 1)`. Defaults to 300. */
  baseDelay?: number
  /** Fixed delay in ms before every retry, overriding the `baseDelay` scaling when provided. */
  fixedDelay?: number
  /**
   * Predicate deciding whether the extracted value is acceptable. Truthiness-checked,
   * mirroring the original `if (data && …) break` conditions. Defaults to truthy check.
   */
  isValid?: (value: T) => unknown
}

/**
 * Runs `fn` up to `attempts` times, returning the first value for which
 * `isValid(value)` is truthy. Between failed attempts it sleeps — using the
 * legacy `baseDelay * (i + 1)` increasing delay, or `fixedDelay` when set.
 *
 * Replaces the per-page "extract-with-retry" loops that previously inlined
 * `for (let i = 0; i < n; i++) { data = extract(); if (valid) break; await … }`.
 * Timing and validation semantics are preserved exactly.
 */
export async function withRetry<T>(
  fn: () => T,
  opts: WithRetryOptions<T> = {},
): Promise<T> {
  const { attempts = 8, baseDelay = 300, fixedDelay, isValid } = opts
  const isAcceptable = isValid ?? ((value: T) => Boolean(value))

  let value!: T
  for (let i = 0; i < attempts; i++) {
    value = fn()
    if (isAcceptable(value)) return value
    await sleep(fixedDelay !== undefined ? fixedDelay : baseDelay * (i + 1))
  }
  return value
}
