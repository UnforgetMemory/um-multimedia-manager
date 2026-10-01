import { test, expect } from '@playwright/test';
import {
  bumpGlobalStats,
  getCachedGlobalStats,
  invalidateGlobalStats,
  loadGlobalStats,
  readWatchedIds,
  STATS_UNKNOWN,
} from '@/scenario/sehuatang/background-reads';
import { initFileSandbox, defineGlobal } from './helpers/global-sandbox';

/**
 * Overlay background reads: retry instead of caching a fabricated answer.
 *
 * The sehuatang list/search overlays read the watched set + the three-segment
 * global stats once at mount. While the service worker was asleep or mid
 * IndexedDB-open, that one shot returned "nothing watched / 0,0,0" and the
 * overlay cached it — the header then showed a confident wrong number for the
 * rest of the page's life and the retry branch was unreachable because the
 * provider never reported failure. Pinned here:
 *  - a read that was never answered resolves ok:false (never rejects — these
 *    are fire-and-forget calls from a content script),
 *  - the ladder re-issues the message instead of accepting the first dud,
 *  - a failed stats read leaves the cache EMPTY (so the next refresh retries)
 *    instead of writing zeros,
 *  - an answered read IS cached: no extra messages per header refresh.
 *
 * Timing is driven by the injected `wait`, so no test sleeps.
 */

initFileSandbox();

interface Step {
  respond?: unknown;
  lastError?: string;
}

const sent: string[] = [];
let script: Step[] = [];

function stubRuntime(): void {
  const runtime = {
    id: 'mmextensionidabcdefgh',
    lastError: null as { message: string } | null,
    sendMessage: (message: { type: string }, callback: (r: unknown) => void) => {
      const step = script[Math.min(sent.length, script.length - 1)]!;
      sent.push(message.type);
      if (step.lastError !== undefined) {
        runtime.lastError = { message: step.lastError };
        callback(undefined);
        runtime.lastError = null;
        return;
      }
      callback(step.respond);
    },
  };
  defineGlobal('chrome', { runtime });
}

const DEAD = { lastError: 'Receiving end does not exist.' };
const STATS = (jp: number, us: number, tid: number): Step => ({
  respond: { success: true, jp, us, tid },
});
const WATCHED = (ids: string[]): Step => ({ respond: { success: true, watched: ids } });

/** Zero-delay wait recorder — replaces the real backoff sleep. */
function waitSpy(): { waits: number[]; wait: (ms: number) => Promise<void> } {
  const waits: number[] = [];
  return { waits, wait: async (ms: number) => void waits.push(ms) };
}

test.beforeEach(() => {
  sent.length = 0;
  script = [];
  invalidateGlobalStats();
  stubRuntime();
});

test.describe('readWatchedIds — retry ladder', () => {
  test('a dead background is reported as a failure, not as an empty watched set', async () => {
    script = [DEAD];
    const { waits, wait } = waitSpy();
    const res = await readWatchedIds(['SSIS-123'], { wait });
    expect(res.ok).toBe(false);
    expect(res.watched.size).toBe(0);
    expect((res.error ?? '').length).toBeGreaterThan(0);
    // The ladder actually retried rather than accepting the first dud.
    expect(sent.filter((t) => t === 'ADULT_AV_CHECK_BATCH').length).toBeGreaterThan(1);
    expect(waits.length).toBe(sent.filter((t) => t === 'ADULT_AV_CHECK_BATCH').length - 1);
  });

  test('a background that wakes up on the second attempt yields an authoritative set', async () => {
    script = [DEAD, WATCHED(['ssis-123'])];
    const res = await readWatchedIds(['SSIS-123'], { wait: async () => {} });
    expect(res.ok).toBe(true);
    expect(Array.from(res.watched)).toEqual(['SSIS-123']);
    expect(sent.filter((t) => t === 'ADULT_AV_CHECK_BATCH')).toHaveLength(2);
  });

  test('backoff grows between attempts and nothing is sent for an empty query', async () => {
    const { waits, wait } = waitSpy();
    script = [DEAD];
    const res = await readWatchedIds(['SSIS-123'], { wait });
    expect(waits.length).toBeGreaterThanOrEqual(2);
    expect(waits.every((ms) => ms > 0)).toBe(true);
    expect(waits).toEqual([...waits].sort((a, b) => a - b));
    expect(res.ok).toBe(false);

    const unused = waitSpy();
    const beforeEmpty = sent.length;
    const empty = await readWatchedIds([], { wait: unused.wait });
    expect(empty.ok).toBe(true);
    expect(empty.watched.size).toBe(0);
    expect(unused.waits).toHaveLength(0);
    expect(sent.length).toBe(beforeEmpty);
  });
});

test.describe('loadGlobalStats — cache only answered reads', () => {
  test('exhausted ladder leaves the cache untouched so the next refresh retries', async () => {
    script = [DEAD];
    const first = await loadGlobalStats({ wait: async () => {} });
    expect(first.ok).toBe(false);
    expect(getCachedGlobalStats()).toBe(null);

    // Same trigger again: the header asks once more instead of painting zeros.
    const before = sent.length;
    script = [STATS(2, 1, 1)];
    const second = await loadGlobalStats({ wait: async () => {} });
    expect(second.ok).toBe(true);
    expect(second.stats).toEqual({ jp: 2, us: 1, tid: 1 });
    expect(sent.length).toBeGreaterThan(before);
    expect(getCachedGlobalStats()).toEqual({ jp: 2, us: 1, tid: 1 });
  });

  test('an answered read is cached: later refreshes cost zero messages', async () => {
    script = [STATS(9, 8, 7)];
    const first = await loadGlobalStats({ wait: async () => {} });
    expect(first.ok).toBe(true);
    const afterFirst = sent.length;
    const second = await loadGlobalStats({ wait: async () => {} });
    expect(second.stats).toEqual({ jp: 9, us: 8, tid: 7 });
    expect(sent.length).toBe(afterFirst);
  });

  test('concurrent refreshes share one in-flight read', async () => {
    script = [STATS(1, 1, 1)];
    const [a, b] = await Promise.all([
      loadGlobalStats({ wait: async () => {} }),
      loadGlobalStats({ wait: async () => {} }),
    ]);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(sent.filter((t) => t === 'ADULT_AV_STATS')).toHaveLength(1);
  });

  test('bump after a local save, invalidate after a remote change', async () => {
    script = [STATS(1, 1, 1)];
    await loadGlobalStats({ wait: async () => {} });
    bumpGlobalStats(['SSIS-123', 'STUDIO.23.06.10', 'TID-9']);
    expect(getCachedGlobalStats()).toEqual({ jp: 2, us: 2, tid: 2 });
    invalidateGlobalStats();
    expect(getCachedGlobalStats()).toBe(null);
    // Bumping a cache that holds nothing must not resurrect a fake number.
    bumpGlobalStats(['SSIS-123']);
    expect(getCachedGlobalStats()).toBe(null);
  });

  test('the unknown placeholder carries no digits (a dash is not a count)', async () => {
    expect(STATS_UNKNOWN).not.toMatch(/\d/);
    expect(STATS_UNKNOWN.length).toBeGreaterThan(0);
  });
});
