import { test, expect } from '@playwright/test';
import { watchRecord, type WatchRecordDeps } from '@/libraries/utils/watch-record';
import type { EventType } from '@/libraries/utils/event-bus';

/**
 * watchRecord — the framework-free live-record leg for legacy content scripts
 * (X32 ②). The seam is the bus, never the real singleton: `event-bus` keeps
 * module-level `initialized` + `subscribers`, so whichever spec first calls
 * `initEventBus()` latches the listener to its own chrome stub. Tests therefore
 * inject `deps` and drive the handler directly.
 *
 * Contracts pinned: store filtering, exact-key matching, the bulk forms
 * (`key: '*'` and a keyless payload) that must NOT be filtered out, an
 * unkeyed watch covering the whole store, both event names subscribed, and a
 * disposer that releases both legs exactly once.
 */

type Handler = (data: unknown) => void;

function createBus(): {
  deps: WatchRecordDeps;
  handlers: Map<EventType, Handler[]>;
  emit: (event: EventType, data: unknown) => void;
  count: () => number;
} {
  const handlers = new Map<EventType, Handler[]>();
  let subscribed = 0;
  return {
    handlers,
    deps: {
      subscribe: (event, handler) => {
        const list = handlers.get(event) ?? [];
        list.push(handler);
        handlers.set(event, list);
        subscribed++;
        let released = false;
        return () => {
          if (released) return; // a disposer must be idempotent
          released = true;
          handlers.set(
            event,
            (handlers.get(event) ?? []).filter((h) => h !== handler),
          );
          subscribed--;
        };
      },
    },
    emit: (event, data) => {
      for (const handler of [...(handlers.get(event) ?? [])]) handler(data);
    },
    count: () => subscribed,
  };
}

const STORE = 'imdb_records';
const KEY = 'movie::tt0111161';

test.describe('watchRecord', () => {
  test('the watched key fires; another key of the same store stays silent', () => {
    const bus = createBus();
    const fired: unknown[] = [];
    const release = watchRecord(STORE, KEY, () => fired.push('hit'), bus.deps);
    try {
      bus.emit('record:updated', { storeName: STORE, key: KEY });
      bus.emit('record:updated', { storeName: STORE, key: 'movie::tt0000000' });
      expect(fired).toEqual(['hit']);
    } finally {
      release();
    }
  });

  test('another store stays silent even for the same key text', () => {
    const bus = createBus();
    const fired: unknown[] = [];
    const release = watchRecord(STORE, KEY, () => fired.push('hit'), bus.deps);
    try {
      bus.emit('record:updated', { storeName: 'douban_records', key: KEY });
      bus.emit('record:deleted', { storeName: 'neodb_records', key: KEY });
      expect(fired).toEqual([]);
    } finally {
      release();
    }
  });

  test('both bulk forms (key "*" and a keyless payload) always re-check', () => {
    const bus = createBus();
    const fired: unknown[] = [];
    const release = watchRecord(STORE, KEY, () => fired.push('hit'), bus.deps);
    try {
      bus.emit('record:updated', { storeName: STORE, key: '*' });
      bus.emit('record:updated', { storeName: STORE });
      expect(fired).toEqual(['hit', 'hit']);
    } finally {
      release();
    }
  });

  test('an unkeyed watch reacts to every write of the store', () => {
    const bus = createBus();
    const fired: unknown[] = [];
    const release = watchRecord(STORE, undefined, () => fired.push('hit'), bus.deps);
    try {
      bus.emit('record:updated', { storeName: STORE, key: 'movie::anything' });
      bus.emit('record:deleted', { storeName: STORE, key: 'tv::other' });
      expect(fired).toHaveLength(2);
    } finally {
      release();
    }
  });

  test('deletes reach the same leg as writes, and a foreign event type does not', () => {
    const bus = createBus();
    const fired: unknown[] = [];
    const release = watchRecord(STORE, KEY, () => fired.push('hit'), bus.deps);
    try {
      bus.emit('record:deleted', { storeName: STORE, key: KEY });
      // settings:changed is a different channel; the record watch must not react.
      bus.emit('settings:changed', { storeName: STORE, key: KEY });
      expect(fired).toEqual(['hit']);
    } finally {
      release();
    }
  });

  test('the disposer releases both subscriptions, once and idempotently', () => {
    const bus = createBus();
    const fired: unknown[] = [];
    const release = watchRecord(STORE, KEY, () => fired.push('hit'), bus.deps);
    expect(bus.count()).toBe(2);
    expect([...bus.handlers.keys()].sort()).toEqual(['record:deleted', 'record:updated']);

    release();
    expect(bus.count()).toBe(0);
    release(); // double release must not drive the count negative
    expect(bus.count()).toBe(0);

    // Real consequence, not a vacuous count: after release the same event
    // reaches nothing.
    bus.emit('record:updated', { storeName: STORE, key: KEY });
    bus.emit('record:deleted', { storeName: STORE, key: KEY });
    expect(fired).toEqual([]);
  });

  test('an onChange throw escapes on purpose — the caller owns the catch', () => {
    const bus = createBus();
    const release = watchRecord(
      STORE,
      KEY,
      () => {
        throw new Error('refresh blew up');
      },
      bus.deps,
    );
    try {
      // Swallowing here would hide a broken refresh; create-detail-handler wraps
      // the call in its own catch so a failed refresh cannot escape the bus.
      expect(() => bus.emit('record:updated', { storeName: STORE, key: KEY })).toThrow(
        'refresh blew up',
      );
    } finally {
      release();
    }
  });
});
