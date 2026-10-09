import { test, expect } from '@playwright/test';
import { SchedulerMonitor } from '@/engine/data-scheduler/scheduler-monitor';
import type { SchedulerEvent, SchedulerEventType } from '@/engine/data-scheduler/types';

/**
 * X12-A coverage wave — SchedulerMonitor (rolling metrics + event fan-out).
 *
 * Pure in-memory accounting: every event is injected directly, so percentile
 * math, the 10k-entry response-time window, the counting rules per event
 * type, and listener isolation are all lockable to exact numbers.
 */

function evt(type: SchedulerEventType, over: Partial<SchedulerEvent> = {}): SchedulerEvent {
  return { type, timestamp: 1_700_000_000_000, ...over };
}

test.describe('empty state', () => {
  test('a fresh monitor reports all-zero metrics (no NaN rates, percentile 0)', () => {
    const m = new SchedulerMonitor();
    expect(m.getMetrics()).toEqual({
      responseTime: { p50: 0, p95: 0, p99: 0 },
      errorRate: 0,
      cacheHitRate: 0,
      queueDepth: 0,
      totalRequests: 0,
      totalErrors: 0,
      totalCacheHits: 0,
      totalCacheMisses: 0,
    });
  });
});

test.describe('counting rules per event type', () => {
  test('task:completed counts a request and only feeds responseTimes when duration is present', () => {
    const m = new SchedulerMonitor();
    m.recordEvent(evt('task:completed', { duration: 40 }));
    m.recordEvent(evt('task:completed')); // no duration → still a request, no latency sample
    const metrics = m.getMetrics();
    expect(metrics.totalRequests).toBe(2);
    expect(metrics.totalErrors).toBe(0);
    // A phantom third sample would move p50 off 40.
    expect(metrics.responseTime).toEqual({ p50: 40, p95: 40, p99: 40 });
  });

  test('task:failed and task:timeout each count as a request AND an error', () => {
    const m = new SchedulerMonitor();
    m.recordEvent(evt('task:failed', { duration: 999 }));
    m.recordEvent(evt('task:timeout'));
    m.recordEvent(evt('task:completed', { duration: 1 }));
    const metrics = m.getMetrics();
    expect([metrics.totalRequests, metrics.totalErrors]).toEqual([3, 2]);
    expect(metrics.errorRate).toBeCloseTo(2 / 3, 10);
    // failed/timeout durations must NOT enter the latency window.
    expect(metrics.responseTime.p99).toBe(1);
  });

  test('cache:hit / cache:miss feed only the cache rates, never totalRequests', () => {
    const m = new SchedulerMonitor();
    m.recordEvent(evt('cache:hit'));
    m.recordEvent(evt('cache:hit'));
    m.recordEvent(evt('cache:hit'));
    m.recordEvent(evt('cache:miss'));
    const metrics = m.getMetrics();
    expect(metrics.totalRequests).toBe(0);
    expect([metrics.totalCacheHits, metrics.totalCacheMisses]).toEqual([3, 1]);
    expect(metrics.cacheHitRate).toBe(0.75);
  });

  test('informational events (retrying / late-settled / rate:limited) change nothing', () => {
    const m = new SchedulerMonitor();
    m.recordEvent(evt('task:retrying', { attempt: 1 }));
    m.recordEvent(evt('task:late-settled'));
    m.recordEvent(evt('rate:limited'));
    expect(m.getMetrics()).toEqual({
      responseTime: { p50: 0, p95: 0, p99: 0 },
      errorRate: 0,
      cacheHitRate: 0,
      queueDepth: 0,
      totalRequests: 0,
      totalErrors: 0,
      totalCacheHits: 0,
      totalCacheMisses: 0,
    });
  });
});

test.describe('percentiles', () => {
  test('1..100 (fed in scrambled order): p50=50, p95=95, p99=99', () => {
    const m = new SchedulerMonitor();
    // Deterministic scramble: (i * 37) % 100 keeps every value exactly once.
    for (let i = 0; i < 100; i++)
      m.recordEvent(evt('task:completed', { duration: ((i * 37) % 100) + 1 }));
    expect(m.getMetrics().responseTime).toEqual({ p50: 50, p95: 95, p99: 99 });
  });

  test('index math is ceil(p/100*n)-1: for [10,20] p50 takes the LOW element', () => {
    const m = new SchedulerMonitor();
    m.recordEvent(evt('task:completed', { duration: 20 }));
    m.recordEvent(evt('task:completed', { duration: 10 }));
    expect(m.getMetrics().responseTime).toEqual({ p50: 10, p95: 20, p99: 20 });
  });

  test('a single sample equals itself at every percentile', () => {
    const m = new SchedulerMonitor();
    m.recordEvent(evt('task:completed', { duration: 7 }));
    expect(m.getMetrics().responseTime).toEqual({ p50: 7, p95: 7, p99: 7 });
  });
});

test.describe('rolling window', () => {
  test('the response-time window caps at 10 000 samples, dropping the OLDEST', () => {
    const m = new SchedulerMonitor();
    // 101 outliers (1000ms) enqueued FIRST, then 9 900 normal samples (10ms)
    // → 10 001 events. The cap must evict one OUTLIER, leaving 100 outliers
    // below the p99 rank (9 900 normals fill indices 0..9899).
    for (let i = 0; i < 101; i++) m.recordEvent(evt('task:completed', { duration: 1000 }));
    for (let i = 0; i < 9_900; i++) m.recordEvent(evt('task:completed', { duration: 10 }));
    const metrics = m.getMetrics();
    expect(metrics.totalRequests).toBe(10_001); // counters are NOT windowed
    // With the cap: p99 = sorted[9899] = 10. Without it (10 001 samples),
    // sorted[9900] would be the first outlier: 1000 — the assertion is
    // chosen so both the cap end and the shift end are discriminating.
    expect(metrics.responseTime.p99).toBe(10);
  });
});

test.describe('listeners', () => {
  test('every listener sees the SAME event object; unsubscribe stops only its own delivery', () => {
    const m = new SchedulerMonitor();
    const seenA: SchedulerEvent[] = [];
    const seenB: SchedulerEvent[] = [];
    const offA = m.onEvent((e) => seenA.push(e));
    m.onEvent((e) => seenB.push(e));

    const event = evt('task:completed', { duration: 5, taskId: 't1' });
    m.recordEvent(event);
    offA();
    m.recordEvent(evt('cache:hit'));

    expect(seenA).toHaveLength(1);
    expect(seenA[0]).toBe(event); // same reference, no copying
    expect(seenB.map((e) => e.type)).toEqual(['task:completed', 'cache:hit']);
  });

  test('a throwing listener is silently isolated and does not block others or the metrics', () => {
    const m = new SchedulerMonitor();
    let secondGot = 0;
    m.onEvent(() => {
      throw new Error('listener explodes');
    });
    m.onEvent(() => {
      secondGot++;
    });

    expect(() => m.recordEvent(evt('task:completed', { duration: 3 }))).not.toThrow();
    expect(secondGot).toBe(1);
    expect(m.getMetrics().totalRequests).toBe(1);
  });

  test('registering the same function twice dedupes (Set semantics): one delivery per event', () => {
    const m = new SchedulerMonitor();
    let calls = 0;
    const listener = () => {
      calls++;
    };
    m.onEvent(listener);
    m.onEvent(listener);
    m.recordEvent(evt('cache:miss'));
    expect(calls).toBe(1);
  });
});

test.describe('queue depth and clear', () => {
  test('setQueueDepth is last-write-wins and surfaces in the metrics snapshot', () => {
    const m = new SchedulerMonitor();
    m.setQueueDepth(5);
    expect(m.getMetrics().queueDepth).toBe(5);
    m.setQueueDepth(0);
    expect(m.getMetrics().queueDepth).toBe(0);
  });

  test('clear resets counters, the latency window and queue depth but keeps listeners', () => {
    const m = new SchedulerMonitor();
    let after = 0;
    m.onEvent(() => {
      after++;
    });
    m.recordEvent(evt('task:failed'));
    m.recordEvent(evt('task:completed', { duration: 100 }));
    m.recordEvent(evt('cache:hit'));
    m.setQueueDepth(9);

    m.clear();
    expect(m.getMetrics()).toEqual({
      responseTime: { p50: 0, p95: 0, p99: 0 },
      errorRate: 0,
      cacheHitRate: 0,
      queueDepth: 0,
      totalRequests: 0,
      totalErrors: 0,
      totalCacheHits: 0,
      totalCacheMisses: 0,
    });

    m.recordEvent(evt('task:completed', { duration: 42 }));
    const metrics = m.getMetrics();
    expect(metrics.totalRequests).toBe(1);
    expect(metrics.responseTime.p50).toBe(42); // window restarted empty, not 100/42 mixed
    expect(after).toBe(4); // 3 events before clear + 1 after: listeners are NOT dropped by clear
  });
});
