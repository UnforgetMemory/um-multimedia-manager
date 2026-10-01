import { test, expect } from '@playwright/test';
import { RetryPolicy, calculateBackoffDelay } from '@/engine/data-scheduler/retry-policy';
import { DEFAULT_RETRY_CONFIG } from '@/engine/data-scheduler/types';
import type { RetryConfig } from '@/engine/data-scheduler/types';

/**
 * X12-A coverage wave — RetryPolicy (exponential backoff + jitter).
 *
 * Pure scheduling policy with no I/O, so the whole delay sequence and the
 * give-up condition are pinned exactly. Jitter is random by design: the only
 * external seam is `Math.random`, stubbed where an exact number is required.
 */

const REAL_RANDOM = Math.random;

/** Stub Math.random for the duration of one assertion block. */
function withRandom(value: number, body: () => void): void {
  Math.random = () => value;
  try {
    body();
  } finally {
    Math.random = REAL_RANDOM;
  }
}

function noJitter(over: Partial<RetryConfig> = {}): RetryConfig {
  return { ...DEFAULT_RETRY_CONFIG, jitter: false, ...over };
}

test.afterEach(() => {
  Math.random = REAL_RANDOM;
});

test.describe('calculateBackoffDelay', () => {
  test('without jitter the sequence is base * 2^attempt, capped at maxDelay', () => {
    const config = noJitter({ baseDelay: 100, maxDelay: 550 });
    expect([0, 1, 2, 3, 4, 5, 6].map((a) => calculateBackoffDelay(a, config))).toEqual([
      100, 200, 400, 550, 550, 550, 550,
    ]);
  });

  test('attempt is 0-based: attempt 0 already waits baseDelay (no free first retry)', () => {
    const config = noJitter({ baseDelay: 250, maxDelay: 100_000 });
    expect(calculateBackoffDelay(0, config)).toBe(250);
    expect(calculateBackoffDelay(1, config)).toBe(500);
    expect(calculateBackoffDelay(7, config)).toBe(250 * 2 ** 7);
  });

  test('defaults are 1s base / 10s cap', () => {
    expect(DEFAULT_RETRY_CONFIG).toEqual({
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10_000,
      jitter: true,
    });
    const config = noJitter();
    expect([0, 1, 2, 3, 4].map((a) => calculateBackoffDelay(a, config))).toEqual([
      1000, 2000, 4000, 8000, 10_000,
    ]);
  });

  test('jitter stays inside ±25% of the uncapped base and is rounded to whole ms', () => {
    const config: RetryConfig = { maxRetries: 3, baseDelay: 1000, maxDelay: 10_000, jitter: true };
    for (const attempt of [0, 1, 5]) {
      const base = Math.min(config.baseDelay * 2 ** attempt, config.maxDelay);
      for (let i = 0; i < 200; i++) {
        const delay = calculateBackoffDelay(attempt, config);
        expect(Number.isInteger(delay)).toBe(true);
        expect(delay).toBeGreaterThanOrEqual(Math.round(base * 0.75));
        expect(delay).toBeLessThanOrEqual(Math.round(base * 1.25));
      }
    }
  });

  test('jitter endpoints are exact for the stubbed random extremes', () => {
    const config: RetryConfig = { maxRetries: 3, baseDelay: 1000, maxDelay: 10_000, jitter: true };
    withRandom(0.5, () => expect(calculateBackoffDelay(1, config)).toBe(2000)); // offset 0
    withRandom(0, () => expect(calculateBackoffDelay(1, config)).toBe(1500)); // -25%
    withRandom(1, () => expect(calculateBackoffDelay(1, config)).toBe(2500)); // +25%
    withRandom(0.9, () => expect(calculateBackoffDelay(1, config)).toBe(2400));
  });
});

test.describe('RetryPolicy.calculateDelay', () => {
  test('delegates to the merged config (partial override keeps the other defaults)', () => {
    const noJit = new RetryPolicy({ jitter: false });
    expect(noJit.calculateDelay(0)).toBe(DEFAULT_RETRY_CONFIG.baseDelay);
    expect(noJit.calculateDelay(2)).toBe(4000);

    const tuned = new RetryPolicy({ baseDelay: 50, maxDelay: 120, jitter: false });
    expect([0, 1, 2, 3].map((a) => tuned.calculateDelay(a))).toEqual([50, 100, 120, 120]);
  });

  test('jitter config applies on the policy path too', () => {
    const jittered = new RetryPolicy({ baseDelay: 1000, jitter: true });
    withRandom(0, () => expect(jittered.calculateDelay(0)).toBe(750));
  });
});

test.describe('RetryPolicy.execute', () => {
  test('success on first attempt: one call, no onRetry, value passed through', async () => {
    const policy = new RetryPolicy({ maxRetries: 3, baseDelay: 1, jitter: false });
    let calls = 0;
    const retries: Array<{ attempt: number; error: unknown }> = [];

    const result = await policy.execute(
      async () => {
        calls += 1;
        return { ok: true, n: 42 };
      },
      (attempt, error) => {
        retries.push({ attempt, error });
      },
    );

    expect(result).toEqual({ ok: true, n: 42 });
    expect(calls).toBe(1);
    expect(retries).toEqual([]);
  });

  test('recovers mid-way: onRetry is 1-indexed and receives the exact error objects', async () => {
    const policy = new RetryPolicy({ maxRetries: 4, baseDelay: 1, jitter: false });
    const err1 = new Error('first');
    const err2 = new Error('second');
    const queue: unknown[] = [err1, err2];
    const retries: Array<{ attempt: number; message: string }> = [];
    let calls = 0;

    const value = await policy.execute<number>(
      async () => {
        calls += 1;
        const next = queue.shift();
        if (next) throw next;
        return calls;
      },
      (attempt, error) => retries.push({ attempt, message: (error as Error).message }),
    );

    expect(value).toBe(3);
    expect(calls).toBe(3);
    expect(retries).toEqual([
      { attempt: 1, message: 'first' },
      { attempt: 2, message: 'second' },
    ]);
  });

  test('give-up condition: exactly maxRetries + 1 calls and the LAST error is rethrown', async () => {
    const policy = new RetryPolicy({ maxRetries: 2, baseDelay: 1, jitter: false });
    const errors = [new Error('e1'), new Error('e2'), new Error('e3')];
    const seen: number[] = [];
    let calls = 0;

    await expect(
      policy.execute(async () => {
        const err = errors.shift();
        if (!err) throw new Error('called past the give-up point');
        calls += 1;
        seen.push(calls);
        throw err;
      }),
    ).rejects.toThrow('e3');

    expect(calls).toBe(3); // 1 initial + 2 retries
    expect(seen).toEqual([1, 2, 3]);
    expect(errors).toEqual([]);
  });

  test('onRetry does not fire for the final failed attempt', async () => {
    const policy = new RetryPolicy({ maxRetries: 3, baseDelay: 1, jitter: false });
    const attempts: number[] = [];
    let calls = 0;

    await expect(
      policy.execute(
        async () => {
          calls += 1;
          throw new Error('boom');
        },
        (attempt) => {
          attempts.push(attempt);
        },
      ),
    ).rejects.toThrow('boom');

    expect(calls).toBe(4);
    expect(attempts).toEqual([1, 2, 3]); // never 4 — the last failure has no wait after it
  });

  test('maxRetries 0 means single-shot: no retry, no onRetry, original error', async () => {
    const policy = new RetryPolicy({ maxRetries: 0, jitter: false });
    let calls = 0;
    let retryCalls = 0;

    await expect(
      policy.execute(
        async () => {
          calls += 1;
          throw new TypeError('no retry for me');
        },
        () => {
          retryCalls += 1;
        },
      ),
    ).rejects.toBeInstanceOf(TypeError);

    expect(calls).toBe(1);
    expect(retryCalls).toBe(0);
  });

  test('a synchronous throw inside fn is retried like a rejection', async () => {
    const policy = new RetryPolicy({ maxRetries: 2, baseDelay: 1, jitter: false });
    let calls = 0;

    const value = await policy.execute<number>(() => {
      calls += 1;
      if (calls < 3) throw new Error(`sync ${calls}`);
      return Promise.resolve(calls);
    });

    expect(value).toBe(3);
    expect(calls).toBe(3);
  });

  test('non-Error rejection values are rethrown unchanged', async () => {
    const policy = new RetryPolicy({ maxRetries: 1, baseDelay: 1, jitter: false });
    let calls = 0;
    const failure: unknown = { code: 'EBUSY', retryable: false };

    const error = await policy
      .execute(async () => {
        calls += 1;
        throw failure;
      })
      .catch((err: unknown) => err);

    expect(error).toBe(failure);
    expect(calls).toBe(2);
  });

  test('waits really happen, with the planned cumulative backoff', async () => {
    const policy = new RetryPolicy({ maxRetries: 2, baseDelay: 30, maxDelay: 1000, jitter: false });
    let calls = 0;
    const started = Date.now();

    await expect(
      policy.execute(async () => {
        calls += 1;
        throw new Error('always');
      }),
    ).rejects.toThrow('always');

    const elapsed = Date.now() - started;
    expect(calls).toBe(3);
    // Planned sleeps are 30ms (attempt 0) + 60ms (attempt 1); timers never fire early.
    expect(elapsed).toBeGreaterThanOrEqual(90);
  });

  test('no wait is incurred on the success path even with large delays configured', async () => {
    const policy = new RetryPolicy({ maxRetries: 5, baseDelay: 60_000, jitter: false });
    const started = Date.now();
    expect(await policy.execute(async () => 'immediate')).toBe('immediate');
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
