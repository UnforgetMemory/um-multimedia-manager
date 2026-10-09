import { test, expect } from '@playwright/test';
import { createDebouncedScheduler, type TimerAdapter } from '@/libraries/utils/debounced-scheduler';

/**
 * Trailing-edge debounce scheduler (libraries/utils — single source used by PT
 * dimmer, mukaku refresh, and Douban's record cache). Behaviour is also pinned
 * through the re-export in pt/dimmer/refresh; this file exists so the primitive
 * itself has a direct contract (orphan:check / future consumers).
 */

function fakeClock() {
  let now = 0;
  let nextId = 1;
  const timers = new Map<number, { at: number; cb: () => void }>();
  const adapter: TimerAdapter = {
    setTimeout(cb, ms) {
      const id = nextId++;
      timers.set(id, { at: now + ms, cb });
      return id;
    },
    clearTimeout(handle) {
      timers.delete(handle);
    },
  };
  const advance = (ms: number) => {
    now += ms;
    for (const [id, t] of [...timers]) {
      if (t.at <= now) {
        timers.delete(id);
        t.cb();
      }
    }
  };
  return { adapter, advance, pending: () => timers.size };
}

test.describe('createDebouncedScheduler', () => {
  test('窗口内多次 schedule 只跑最后一次', () => {
    const clock = fakeClock();
    const s = createDebouncedScheduler(300, clock.adapter);
    const calls: string[] = [];
    s.schedule(() => calls.push('a'));
    s.schedule(() => calls.push('b'));
    s.schedule(() => calls.push('c'));
    expect(calls).toEqual([]);
    clock.advance(300);
    expect(calls).toEqual(['c']);
  });

  test('cancel 丢掉已排队回调', () => {
    const clock = fakeClock();
    const s = createDebouncedScheduler(300, clock.adapter);
    let ran = false;
    s.schedule(() => {
      ran = true;
    });
    s.cancel();
    clock.advance(300);
    expect(ran).toBe(false);
    expect(clock.pending()).toBe(0);
  });

  test('静默满窗口后再次 schedule 是新一波', () => {
    const clock = fakeClock();
    const s = createDebouncedScheduler(100, clock.adapter);
    const calls: number[] = [];
    s.schedule(() => calls.push(1));
    clock.advance(100);
    s.schedule(() => calls.push(2));
    clock.advance(100);
    expect(calls).toEqual([1, 2]);
  });
});
