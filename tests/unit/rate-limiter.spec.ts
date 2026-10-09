import { test, expect } from '@playwright/test';
import { RateLimiter } from '@/engine/data-scheduler/rate-limiter';
import { DEFAULT_RATE_LIMIT_CONFIG } from '@/engine/data-scheduler/types';

/**
 * X12-A coverage wave — RateLimiter (token bucket, no persistent timers).
 *
 * The class reads the wall clock via `Date.now()` on every access, so the
 * injected seam here is a frozen/steppable `Date.now` (same technique as
 * dom-chunk.spec.ts injecting the scheduler). All refill maths is therefore
 * asserted exactly, never "within tolerance".
 */

const REAL_NOW = Date.now;

/** Clock that only moves when the test says so. */
function frozenClock(start = 1_000_000) {
  let current = start;
  Date.now = () => current;
  return {
    advance: (ms: number): void => {
      current += ms;
    },
  };
}

/** Clock that steps forward on every read — used to cross a deadline without waiting. */
function steppingClock(start: number, step: number) {
  let current = start;
  Date.now = (): number => {
    const value = current;
    current += step;
    return value;
  };
}

test.afterEach(() => {
  Date.now = REAL_NOW;
});

test.describe('defaults and constructor', () => {
  test('default config is 10 req/s with burst 5, and a full bucket starts at burstSize', () => {
    frozenClock();
    const limiter = new RateLimiter();

    expect(limiter.config).toEqual(DEFAULT_RATE_LIMIT_CONFIG);
    expect(DEFAULT_RATE_LIMIT_CONFIG).toEqual({ maxRequestsPerSecond: 10, burstSize: 5 });

    // Fresh bucket = burstSize grants, then hard denial while the clock stands still.
    expect([1, 2, 3, 4, 5].map(() => limiter.tryAcquire())).toEqual([true, true, true, true, true]);
    expect(limiter.tryAcquire()).toBe(false);
  });

  test('partial config merges over defaults instead of replacing them', () => {
    frozenClock();
    const limiter = new RateLimiter({ burstSize: 2 });
    expect(limiter.config).toEqual({ maxRequestsPerSecond: 10, burstSize: 2 });
  });

  test('config getter hands out a copy — mutating it must not retune the limiter', () => {
    frozenClock();
    const limiter = new RateLimiter({ burstSize: 1 });
    const snapshot = limiter.config;
    snapshot.burstSize = 999;
    snapshot.maxRequestsPerSecond = 999;

    expect(limiter.config).toEqual({ maxRequestsPerSecond: 10, burstSize: 1 });
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(false);
  });
});

test.describe('tryAcquire refill maths', () => {
  test('refill is strictly proportional to elapsed time (2 req/s grants one token per 500ms)', () => {
    const clock = frozenClock();
    const limiter = new RateLimiter({ maxRequestsPerSecond: 2, burstSize: 5 });

    for (let i = 0; i < 5; i++) expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(false);

    clock.advance(500); // exactly 1 token
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(false);

    clock.advance(499); // 0.998 tokens — still below the 1-token gate
    expect(limiter.tryAcquire()).toBe(false);
    clock.advance(1);
    expect(limiter.tryAcquire()).toBe(true);
  });

  test('fractional leftovers accumulate across refills (no per-step rounding loss)', () => {
    const clock = frozenClock();
    // burstSize 3 keeps the cap out of the way so the sub-token remainder is observable.
    const limiter = new RateLimiter({ maxRequestsPerSecond: 1, burstSize: 3 });

    for (let i = 0; i < 3; i++) expect(limiter.tryAcquire()).toBe(true);

    clock.advance(600); // +0.6 → 0.6 total, denied
    expect(limiter.tryAcquire()).toBe(false);
    clock.advance(600); // +0.6 → 1.2 total, granted and 0.2 kept
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(false); // the 0.2 remainder is not a token

    clock.advance(800); // 0.2 + 0.8 = exactly 1.0
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(false);
  });

  test('refill is capped at burstSize — idle time cannot bank extra burst', () => {
    const clock = frozenClock();
    const limiter = new RateLimiter({ maxRequestsPerSecond: 1000, burstSize: 3 });

    for (let i = 0; i < 3; i++) expect(limiter.tryAcquire()).toBe(true);
    clock.advance(10_000); // would be 10_000 tokens uncapped

    expect([1, 2, 3, 4].map(() => limiter.tryAcquire())).toEqual([true, true, true, false]);
  });

  test('a non-positive elapsed delta refills nothing and does not move the refill anchor', () => {
    let current = 5_000_000;
    Date.now = () => current;
    const limiter = new RateLimiter({ maxRequestsPerSecond: 1000, burstSize: 2 });

    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(true);

    current -= 10_000; // clock jumps backwards (NTP / SW suspend)
    expect(limiter.tryAcquire()).toBe(false);

    // Anchor stayed at the original t0, so the forward jump still refills.
    current += 20_000;
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(true); // capped at burstSize=2, no double grant
    expect(limiter.tryAcquire()).toBe(false);
  });
});

test.describe('updateConfig', () => {
  test('merges partially and clamps the live token count down to the new burst', () => {
    frozenClock();
    const limiter = new RateLimiter({ maxRequestsPerSecond: 10, burstSize: 5 });

    limiter.updateConfig({ burstSize: 2 });
    expect(limiter.config).toEqual({ maxRequestsPerSecond: 10, burstSize: 2 });

    // 5 stored tokens were clamped to 2 — not 5, and not refilled on update.
    expect([1, 2, 3].map(() => limiter.tryAcquire())).toEqual([true, true, false]);
  });

  test('raising burstSize does not mint tokens immediately (clamp is a min, not a reset)', () => {
    const clock = frozenClock();
    const limiter = new RateLimiter({ maxRequestsPerSecond: 1, burstSize: 1 });
    expect(limiter.tryAcquire()).toBe(true);

    limiter.updateConfig({ burstSize: 10 });
    expect(limiter.tryAcquire()).toBe(false);

    clock.advance(1000); // +1 token at 1 req/s
    expect(limiter.tryAcquire()).toBe(true);
  });
});

test.describe('acquire (async gate)', () => {
  test('resolves immediately when a token is available and consumes exactly one', async () => {
    frozenClock();
    const limiter = new RateLimiter({ burstSize: 2 });

    await limiter.acquire();
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(false);
  });

  test('waits for refill and resolves once the clock advances', async () => {
    const clock = frozenClock();
    const limiter = new RateLimiter({ maxRequestsPerSecond: 1000, burstSize: 1 });
    expect(limiter.tryAcquire()).toBe(true); // bucket empty

    const pending = limiter.acquire();
    clock.advance(10); // 10ms * 1000/s — plenty, but the bucket caps at 1
    await pending;
    // The burst cap means the waiter took the only token it was ever granted.
    expect(limiter.tryAcquire()).toBe(false);
  });

  test('does not resolve while the clock stands still (refill needs elapsed time)', async () => {
    frozenClock();
    const limiter = new RateLimiter({ maxRequestsPerSecond: 1000, burstSize: 1 });
    expect(limiter.tryAcquire()).toBe(true);

    let settled = false;
    const pending = limiter.acquire().then(() => {
      settled = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 250)); // >2 poll intervals
    expect(settled).toBe(false);

    // Hand the real clock back: elapsed now grows, so the parked poll is released
    // (acquire is checked before the deadline → resolution, not timeout).
    Date.now = REAL_NOW;
    await pending;
    expect(settled).toBe(true);
  });

  test('rejects with the acquire-timeout error once the deadline passes without a token', async () => {
    // Every clock read jumps 20s (> ACQUIRE_TIMEOUT_MS) and the 0 req/s rate means
    // the bucket can never refill → the first poll must hit the deadline branch.
    steppingClock(1_000_000, 20_000);
    const limiter = new RateLimiter({ maxRequestsPerSecond: 0, burstSize: 1 });
    expect(limiter.tryAcquire()).toBe(true);

    await expect(limiter.acquire()).rejects.toThrow('Rate limit acquire timeout');
  });

  test('two waiters are serialized: one refill releases exactly one of them', async () => {
    const clock = frozenClock();
    const limiter = new RateLimiter({ maxRequestsPerSecond: 1000, burstSize: 1 });
    expect(limiter.tryAcquire()).toBe(true); // bucket empty

    let resolvedCount = 0;
    const track = (): Promise<void> =>
      limiter.acquire().then(() => {
        resolvedCount += 1;
      });
    const all = Promise.all([track(), track()]);

    clock.advance(5); // enough for exactly one token (burst cap 1)
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(resolvedCount).toBe(1);

    clock.advance(5); // the survivor is released by the next refill
    await all;
    expect(resolvedCount).toBe(2);
  });
});
