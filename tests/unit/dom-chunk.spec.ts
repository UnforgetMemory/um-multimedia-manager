import { test, expect } from '@playwright/test';
import { runChunked } from '@/libraries/utils/dom-chunk';

// Injectable synchronous scheduler: each schedule() call is one "frame";
// tests drive frames manually to assert exact chunk boundaries.
function makeClock() {
  const queue: (() => void)[] = [];
  return {
    schedule: (task: () => void) => {
      queue.push(task);
      return () => {
        const i = queue.indexOf(task);
        if (i >= 0) queue.splice(i, 1);
      };
    },
    tick: () => {
      const task = queue.shift();
      task?.();
    },
    pendingFrames: () => queue.length,
  };
}

test.describe('runChunked', () => {
  test('writes first chunk synchronously, rest one chunk per frame', async () => {
    const clock = makeClock();
    const seen: number[] = [];
    const run = runChunked([0, 1, 2, 3, 4, 5, 6], (n) => seen.push(n), {
      chunkSize: 3,
      schedule: clock.schedule,
    });
    expect(seen).toEqual([0, 1, 2]);
    clock.tick();
    expect(seen).toEqual([0, 1, 2, 3, 4, 5]);
    clock.tick();
    expect(seen).toEqual([0, 1, 2, 3, 4, 5, 6]);
    await run.promise;
    expect(clock.pendingFrames()).toBe(0);
  });

  test('empty input resolves without scheduling', async () => {
    const clock = makeClock();
    const run = runChunked([], () => {}, { schedule: clock.schedule });
    await run.promise;
    expect(clock.pendingFrames()).toBe(0);
  });

  test('cancel stops remaining chunks; completed writes stay', async () => {
    const clock = makeClock();
    const seen: number[] = [];
    const run = runChunked([0, 1, 2, 3, 4, 5], (n) => seen.push(n), {
      chunkSize: 2,
      schedule: clock.schedule,
    });
    run.cancel();
    clock.tick();
    expect(seen).toEqual([0, 1]);
    await run.promise;
  });

  test('chunkSize is floored to 1', async () => {
    const clock = makeClock();
    let count = 0;
    const run = runChunked([0, 1], () => count++, { chunkSize: 0, schedule: clock.schedule });
    expect(count).toBe(1);
    clock.tick();
    expect(count).toBe(2);
    await run.promise;
  });

  test('resolves with a done/failed tally for an all-success batch', async () => {
    const clock = makeClock();
    const run = runChunked([0, 1, 2, 3], () => {}, { chunkSize: 2, schedule: clock.schedule });
    clock.tick();
    await run.promise;
    expect(run.result).toEqual({ done: 4, failed: 0, errors: [] });
  });

  test('a throwing write is isolated: rest of the batch still runs, promise settles, error observable', async () => {
    const clock = makeClock();
    const seen: number[] = [];
    const boom = new Error('write failed');
    const run = runChunked(
      [0, 1, 2, 3, 4],
      (n) => {
        if (n === 2) throw boom;
        seen.push(n);
      },
      { chunkSize: 2, schedule: clock.schedule },
    );
    clock.tick();
    clock.tick();
    // WHY: awaiting must not hang — an escaping throw inside a frame callback
    // used to leave `step` unarmed and the promise unsettled forever.
    await run.promise;
    expect(seen).toEqual([0, 1, 3, 4]);
    expect(run.result.done).toBe(4);
    expect(run.result.failed).toBe(1);
    expect(run.result.errors).toEqual([boom]);
  });

  test('a throw in the first (synchronous) chunk also settles with the error', async () => {
    const clock = makeClock();
    const run = runChunked(
      [0, 1],
      () => {
        throw new Error('sync boom');
      },
      { chunkSize: 1, schedule: clock.schedule },
    );
    clock.tick();
    await run.promise;
    expect(run.result.done).toBe(0);
    expect(run.result.failed).toBe(2);
    expect(run.result.errors[0]).toBeInstanceOf(Error);
  });

  test('empty input resolves with an all-done zero result', async () => {
    const clock = makeClock();
    const run = runChunked([], () => {}, { schedule: clock.schedule });
    await run.promise;
    expect(run.result).toEqual({ done: 0, failed: 0, errors: [] });
  });

  test('cancel settles and reports the partial tally of what ran', async () => {
    const clock = makeClock();
    const run = runChunked([0, 1, 2, 3], () => {}, { chunkSize: 2, schedule: clock.schedule });
    run.cancel();
    await run.promise;
    expect(run.result.done).toBe(2);
    expect(run.result.failed).toBe(0);
  });
});
