import { test, expect } from '@playwright/test';
import {
  useRecordRefresh,
  isRecordUpdatedPayload,
  type RecordEvent,
  type RecordRefreshDeps,
} from '@/scenario/douban/shared/composables/use-record-refresh';
import type { StoreRecord } from '@/types';

// ==================== Harness ====================
// The bus and DB accesses go through the injectable `RecordRefreshDeps`
// seams (same precedent as record-cache-core's StoreApi), so this spec never
// touches the module-global event bus or chrome stubs — no cross-file worker
// interference, no registration-order flakiness under full-suite load.

const IDENTITY = { type: 'movie', providerId: '123' };
const UPDATED: StoreRecord = { status: 2, rating: 8 } as StoreRecord;

/** A delete is reported as `null`, so the recorder must accept it. */
type Recorded = Array<StoreRecord | null>;

function createHarness(record: StoreRecord | null) {
  const sent: string[] = [];
  const handlers = new Map<RecordEvent, (data: unknown) => void>();
  const deps: RecordRefreshDeps = {
    subscribe: (event, handler) => {
      handlers.set(event, handler);
      return () => {
        if (handlers.get(event) === handler) handlers.delete(event);
      };
    },
    loadRecord: async (key) => {
      sent.push(key);
      return record;
    },
  };
  return {
    deps,
    sent,
    emit: (data: unknown, event: RecordEvent = 'record:updated') => handlers.get(event)?.(data),
    assertSubscribed: () => expect(handlers.size).toBe(2),
    subscribedEvents: () => [...handlers.keys()].sort(),
  };
}

// ==================== useRecordRefresh ====================

test.describe('useRecordRefresh', () => {
  test('write and delete events are both subscribed', () => {
    const h = createHarness(UPDATED);
    const unsubscribe = useRecordRefresh(
      () => IDENTITY,
      () => {},
      h.deps,
    );
    try {
      expect(h.subscribedEvents()).toEqual(['record:deleted', 'record:updated']);
    } finally {
      unsubscribe();
      expect(h.subscribedEvents()).toEqual([]);
    }
  });

  test('matching key reloads and calls onRecord with the fresh record', async () => {
    const h = createHarness(UPDATED);
    const calls: Recorded = [];
    const unsubscribe = useRecordRefresh(
      () => IDENTITY,
      (r) => calls.push(r),
      h.deps,
    );
    try {
      h.assertSubscribed();
      h.emit({ storeName: 'douban_records', key: 'movie::123' });
      await expect.poll(() => calls.length).toBe(1);
      expect(calls[0]).toEqual(UPDATED);
      expect(h.sent).toEqual(['movie::123']);
    } finally {
      unsubscribe();
    }
  });

  test('non-douban storeName is ignored', async () => {
    const h = createHarness(UPDATED);
    const calls: Recorded = [];
    const unsubscribe = useRecordRefresh(
      () => IDENTITY,
      (r) => calls.push(r),
      h.deps,
    );
    try {
      h.emit({ storeName: 'imdb_records', key: 'movie::123' });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(calls).toEqual([]);
      expect(h.sent).toEqual([]);
    } finally {
      unsubscribe();
    }
  });

  test('payload without storeName is ignored', async () => {
    const h = createHarness(UPDATED);
    const calls: Recorded = [];
    const unsubscribe = useRecordRefresh(
      () => IDENTITY,
      (r) => calls.push(r),
      h.deps,
    );
    try {
      h.emit({ key: 'movie::123' });
      h.emit('not-an-object');
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(calls).toEqual([]);
    } finally {
      unsubscribe();
    }
  });

  test('different key is ignored', async () => {
    const h = createHarness(UPDATED);
    const calls: Recorded = [];
    const unsubscribe = useRecordRefresh(
      () => IDENTITY,
      (r) => calls.push(r),
      h.deps,
    );
    try {
      h.emit({ storeName: 'douban_records', key: 'movie::999' });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(calls).toEqual([]);
      expect(h.sent).toEqual([]);
    } finally {
      unsubscribe();
    }
  });

  test('missing key or "*" reloads unconditionally', async () => {
    const h = createHarness(UPDATED);
    const calls: Recorded = [];
    const unsubscribe = useRecordRefresh(
      () => IDENTITY,
      (r) => calls.push(r),
      h.deps,
    );
    try {
      h.emit({ storeName: 'douban_records' });
      h.emit({ storeName: 'douban_records', key: '*' });
      await expect.poll(() => calls.length).toBe(2);
      expect(h.sent).toEqual(['movie::123', 'movie::123']);
    } finally {
      unsubscribe();
    }
  });

  test('null identity ignores every event', async () => {
    const h = createHarness(UPDATED);
    const calls: Recorded = [];
    const unsubscribe = useRecordRefresh(
      () => null,
      (r) => calls.push(r),
      h.deps,
    );
    try {
      h.emit({ storeName: 'douban_records', key: 'movie::123' });
      h.emit({ storeName: 'douban_records' });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(calls).toEqual([]);
      expect(h.sent).toEqual([]);
    } finally {
      unsubscribe();
    }
  });

  test('a write whose record cannot be read back leaves the badge untouched', async () => {
    const h = createHarness(null);
    const calls: Recorded = [];
    const unsubscribe = useRecordRefresh(
      () => IDENTITY,
      (r) => calls.push(r),
      h.deps,
    );
    try {
      h.emit({ storeName: 'douban_records', key: 'movie::123' });
      await expect.poll(() => h.sent.length).toBe(1);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(calls).toEqual([]);
    } finally {
      unsubscribe();
    }
  });

  test('delete of the own key clears the badge with null', async () => {
    const h = createHarness(null);
    const calls: Recorded = [];
    const unsubscribe = useRecordRefresh(
      () => IDENTITY,
      (r) => calls.push(r),
      h.deps,
    );
    try {
      h.emit({ storeName: 'douban_records', key: 'movie::123' }, 'record:deleted');
      await expect.poll(() => calls.length).toBe(1);
      expect(calls[0]).toBeNull();
      expect(h.sent).toEqual(['movie::123']);
    } finally {
      unsubscribe();
    }
  });

  test('delete of another key is ignored, keyless delete clears', async () => {
    const h = createHarness(null);
    const calls: Recorded = [];
    const unsubscribe = useRecordRefresh(
      () => IDENTITY,
      (r) => calls.push(r),
      h.deps,
    );
    try {
      h.emit({ storeName: 'douban_records', key: 'movie::999' }, 'record:deleted');
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(calls).toEqual([]);
      h.emit({ storeName: 'douban_records' }, 'record:deleted');
      await expect.poll(() => calls.length).toBe(1);
      expect(calls[0]).toBeNull();
    } finally {
      unsubscribe();
    }
  });

  test('delete racing a re-write applies the surviving record, not null', async () => {
    const h = createHarness(UPDATED);
    const calls: Recorded = [];
    const unsubscribe = useRecordRefresh(
      () => IDENTITY,
      (r) => calls.push(r),
      h.deps,
    );
    try {
      h.emit({ storeName: 'douban_records', key: 'movie::123' }, 'record:deleted');
      await expect.poll(() => calls.length).toBe(1);
      expect(calls[0]).toEqual(UPDATED);
    } finally {
      unsubscribe();
    }
  });

  test('unsubscribe releases both handlers', async () => {
    const h = createHarness(UPDATED);
    const calls: Recorded = [];
    const unsubscribe = useRecordRefresh(
      () => IDENTITY,
      (r) => calls.push(r),
      h.deps,
    );
    unsubscribe();
    h.emit({ storeName: 'douban_records', key: 'movie::123' });
    h.emit({ storeName: 'douban_records', key: 'movie::123' }, 'record:deleted');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toEqual([]);
    expect(h.sent).toEqual([]);
  });

  test('loadRecord rejection warns and never calls onRecord', async () => {
    const warnings: unknown[][] = [];
    const prevWarn = console.warn;
    console.warn = (...args: unknown[]) => warnings.push(args);
    const handlers = new Map<RecordEvent, (data: unknown) => void>();
    const deps: RecordRefreshDeps = {
      subscribe: (event, handler) => {
        handlers.set(event, handler);
        return () => {
          handlers.delete(event);
        };
      },
      loadRecord: async () => {
        throw new Error('db down');
      },
    };
    const calls: Recorded = [];
    const unsubscribe = useRecordRefresh(
      () => IDENTITY,
      (r) => calls.push(r),
      deps,
    );
    try {
      handlers.get('record:updated')?.({ storeName: 'douban_records', key: 'movie::123' });
      handlers.get('record:deleted')?.({ storeName: 'douban_records', key: 'movie::123' });
      await expect.poll(() => warnings.length).toBe(2);
      expect(String(warnings[0]?.[0])).toContain('useRecordRefresh reload failed');
      expect(calls).toEqual([]);
    } finally {
      unsubscribe();
      console.warn = prevWarn;
    }
  });
});

// ==================== isRecordUpdatedPayload (shared narrowing) ====================

test.describe('isRecordUpdatedPayload', () => {
  test('accepts string storeName, rejects everything else', () => {
    expect(isRecordUpdatedPayload({ storeName: 'douban_records' })).toBe(true);
    expect(isRecordUpdatedPayload({ storeName: 'x', key: 'k' })).toBe(true);
    expect(isRecordUpdatedPayload({})).toBe(false);
    expect(isRecordUpdatedPayload({ storeName: 42 })).toBe(false);
    expect(isRecordUpdatedPayload(null)).toBe(false);
    expect(isRecordUpdatedPayload('str')).toBe(false);
  });
});
