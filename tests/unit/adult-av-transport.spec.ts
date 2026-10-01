import { test, expect } from '@playwright/test';
import { AdultAvStore } from '@/provider/adult-av/transport';
import type { AdultAvId } from '@/types';

/**
 * provider/adult-av/transport.ts — message-RPC client (content scripts never
 * touch IndexedDB). Harness: chrome.runtime stubbed callback-style (baseline
 * Chrome 119); every call goes through safeSendMessage({timeout:8000,
 * retries:1}) so a failed send is exactly ONE sendMessage then null.
 * Contracts pinned:
 * 1. sendMsg null-response → `<TYPE> failed: no response`; success:false with
 *    message → Error(message) (the transport never swallows at this layer);
 * 2. per-method failure POLICY split (deliberate): getAll/add/batchAdd/
 *    findByBaseId REJECT; has() keeps its legacy boolean degrade (false);
 *    batchCheckExists/stats stay await-safe but carry an explicit `ok` flag —
 *    a dead background must never look like "nothing watched" / "0 0 0";
 * 3. has() reads `exists ?? watched ?? false` — a legacy response WITHOUT
 *    `exists` still resolves via watched, but a present `exists: false`
 *    shadows watched (nullish-not-falsy, locked reality);
 * 4. batchCheckExists: [] short-circuits with ZERO messages and ok:true;
 *    watched is upper-cased via normalizeWatchedIds; missing/non-array/
 *    semantic/transport failure → empty Set tagged ok:false + error;
 * 5. stats: a complete numeric answer is ok:true verbatim (real zeros count);
 *    a missing segment or any failure is ok:false (no fabricated zeros);
 * 6. add() defaults rating=0/url='' verbatim on the wire;
 * 7. getAll returns res.items || [] and forwards {source} only when given;
 * 8. findByBaseId filters via the pure models rule (UC/C suffix variants).
 */

interface Step {
  respond?: unknown;
  lastError?: string;
}

const calls: Array<{ type: string; payload: unknown }> = [];
let prevChrome: unknown;

function stubRuntime(script: Step[], opts: { id?: string } = {}): void {
  prevChrome = (globalThis as { chrome?: unknown }).chrome;
  const runtime = {
    id: opts.id ?? 'mmextensionidabcdefgh',
    lastError: null as { message: string } | null,
    sendMessage: (message: { type: string; payload?: unknown }, callback: (r: unknown) => void) => {
      const step = script[Math.min(calls.length, script.length - 1)]!;
      calls.push({ type: message.type, payload: message.payload });
      if (step.lastError !== undefined) {
        runtime.lastError = { message: step.lastError };
        callback(undefined);
        runtime.lastError = null;
        return;
      }
      callback(step.respond);
    },
  };
  Object.defineProperty(globalThis, 'chrome', {
    value: { runtime },
    configurable: true,
    writable: true,
  });
}

test.beforeEach(() => {
  calls.length = 0;
});
test.afterEach(() => {
  Object.defineProperty(globalThis, 'chrome', {
    value: prevChrome,
    configurable: true,
    writable: true,
  });
});

function avId(id: string): AdultAvId {
  return { source: 'javdb', id, url: `https://javdb.test/${id}`, rating: 0, updatedAt: 'x' };
}

test.describe('AdultAvStore — wire contract', () => {
  test('getAll: payload {} without source, {source} with; items forwarded', async () => {
    stubRuntime([{ respond: { success: true, items: [avId('ABC-123')] } }]);
    expect(await AdultAvStore.getAll()).toEqual([avId('ABC-123')]);
    expect(calls[0]).toEqual({ type: 'ADULT_AV_GET_ALL', payload: {} });
    await AdultAvStore.getAll('javdb');
    expect(calls[1]).toEqual({ type: 'ADULT_AV_GET_ALL', payload: { source: 'javdb' } });
  });

  test('getAll: success:true without items degrades to [] (defensive || branch)', async () => {
    stubRuntime([{ respond: { success: true } }]);
    expect(await AdultAvStore.getAll()).toEqual([]);
  });

  test('semantic failure rejects with the handler message', async () => {
    stubRuntime([{ respond: { success: false, error: 'db locked' } }]);
    await expect(AdultAvStore.getAll()).rejects.toThrow('db locked');
  });

  test('semantic failure without message falls back to `<TYPE> failed`', async () => {
    stubRuntime([{ respond: { success: false } }]);
    await expect(AdultAvStore.add('javdb', 'ABC-123')).rejects.toThrow('ADULT_AV_ADD failed');
  });

  test('null response (context invalidated) → `failed: no response`, zero sends', async () => {
    stubRuntime([{ respond: { success: true, items: [] } }], { id: '' });
    await expect(AdultAvStore.getAll()).rejects.toThrow('ADULT_AV_GET_ALL failed: no response');
    expect(calls).toHaveLength(0); // safeSendMessage bails before sendMessage
  });

  test('one send per logical call: lastError is NOT retried (retries=1)', async () => {
    stubRuntime([{ lastError: 'Could not establish connection.' }]);
    await expect(AdultAvStore.batchAdd('javdb', [])).rejects.toThrow(
      'ADULT_AV_BATCH_ADD failed: no response',
    );
    expect(calls).toHaveLength(1);
  });
});

test.describe('AdultAvStore — per-method policies', () => {
  test('has(): `exists ?? watched` is NULLISH-not-falsy — a false exists shadows watched', async () => {
    stubRuntime([
      { respond: { success: true, exists: true, watched: false } },
      { respond: { success: true, exists: false, watched: true } },
      { respond: { success: true, exists: false, watched: false } },
      { respond: { success: true, watched: true } }, // legacy shape: exists absent
      { respond: { success: true } }, // neither field
    ]);
    expect(await AdultAvStore.has('ABC-1')).toBe(true);
    // `??` only falls through on null/undefined: a PRESENT exists:false wins.
    expect(await AdultAvStore.has('ABC-2')).toBe(false);
    expect(await AdultAvStore.has('ABC-3')).toBe(false);
    expect(await AdultAvStore.has('ABC-4')).toBe(true);
    expect(await AdultAvStore.has('ABC-5')).toBe(false);
  });

  test('has(): ANY transport/semantic failure degrades to false', async () => {
    stubRuntime([
      { respond: { success: false, error: 'boom' } },
      { lastError: 'Receiving end does not exist.' },
    ]);
    expect(await AdultAvStore.has('ABC-1')).toBe(false);
    expect(await AdultAvStore.has('ABC-2')).toBe(false);
  });

  test('batchCheckExists: [] never touches the wire, answered ok:true', async () => {
    stubRuntime([{ respond: { success: true, watched: [] } }]);
    const set = await AdultAvStore.batchCheckExists([]);
    expect(Array.from(set)).toEqual([]);
    expect(set.ok).toBe(true);
    expect(calls).toHaveLength(0);
  });

  test('batchCheckExists: upper-cases watched; missing/non-array/error → ∅ + ok:false', async () => {
    stubRuntime([
      { respond: { success: true, watched: ['abc-1', 'TID-9'] } },
      { respond: { success: true } },
      { respond: { success: true, watched: 'oops' } },
      { respond: { success: false, error: 'nope' } },
    ]);
    const hits = await AdultAvStore.batchCheckExists(['abc-1']);
    expect(Array.from(hits)).toEqual(['ABC-1', 'TID-9']);
    expect(hits.ok).toBe(true);
    for (let i = 0; i < 3; i += 1) {
      const failed = await AdultAvStore.batchCheckExists(['x']);
      // Empty but NOT authoritative: callers must be able to retry.
      expect(Array.from(failed)).toEqual([]);
      expect(failed.ok).toBe(false);
      expect(typeof failed.error).toBe('string');
    }
    expect(calls[0]!.payload).toEqual({ ids: ['abc-1'] });
  });

  test('stats: complete answer verbatim; partial/failed carries ok:false', async () => {
    stubRuntime([
      { respond: { success: true, jp: 3, us: 1, tid: 2 } },
      { respond: { success: true, jp: 5 } },
      { respond: { success: false, error: 'db' } },
    ]);
    expect(await AdultAvStore.stats()).toEqual({ ok: true, jp: 3, us: 1, tid: 2 });
    // A missing segment is not a count of zero — no fabrication.
    const partial = await AdultAvStore.stats();
    expect(partial.ok).toBe(false);
    expect(partial).toEqual({
      ok: false,
      jp: 0,
      us: 0,
      tid: 0,
      error: 'ADULT_AV_STATS failed: success response without complete counts',
    });
    const failed = await AdultAvStore.stats();
    expect(failed.ok).toBe(false);
    expect(failed.error).toContain('db');
    expect(calls[1]!.payload).toEqual({});
  });

  test('stats: real zeros are a verdict, a silent background is not', async () => {
    stubRuntime([
      { respond: { success: true, jp: 0, us: 0, tid: 0 } },
      { lastError: 'Receiving end does not exist.' },
    ]);
    expect(await AdultAvStore.stats()).toEqual({ ok: true, jp: 0, us: 0, tid: 0 });
    const unread = await AdultAvStore.stats();
    expect(unread.ok).toBe(false);
    expect(unread.error).toContain('no response');
  });

  test('add(): payload carries rating=0/url="" defaults verbatim', async () => {
    stubRuntime([{ respond: { success: true } }]);
    await AdultAvStore.add('sehuatang', 'TID-1');
    expect(calls[0]).toEqual({
      type: 'ADULT_AV_ADD',
      payload: { source: 'sehuatang', id: 'TID-1', rating: 0, url: '' },
    });
    await AdultAvStore.add('javdb', 'ABC-1', 8, 'https://u');
    expect(calls[1]!.payload).toEqual({
      source: 'javdb',
      id: 'ABC-1',
      rating: 8,
      url: 'https://u',
    });
  });

  test('add()/batchAdd() REJECT on failure (no swallow — writers must surface)', async () => {
    stubRuntime([{ respond: { success: false, error: 'quota' } }]);
    await expect(AdultAvStore.add('javdb', 'X-1')).rejects.toThrow('quota');
    await expect(AdultAvStore.batchAdd('javdb', [{ id: 'X-1' }])).rejects.toThrow('quota');
  });

  test('batchAdd: addedCount forwarded; missing/0 → 0', async () => {
    stubRuntime([{ respond: { success: true, addedCount: 2 } }, { respond: { success: true } }]);
    expect(await AdultAvStore.batchAdd('javdb', [])).toBe(2);
    expect(await AdultAvStore.batchAdd('javdb', [])).toBe(0);
  });

  test('findByBaseId: suffix-variant filtering over the full store', async () => {
    stubRuntime([
      {
        respond: {
          success: true,
          items: [avId('YAG-123-UC'), avId('YAG-123'), avId('YAG-999')],
        },
      },
    ]);
    const hits = await AdultAvStore.findByBaseId('yag-123'); // case-insensitive query
    expect(hits.map((h) => h.id)).toEqual(['YAG-123-UC', 'YAG-123']);
    expect(calls[0]!.type).toBe('ADULT_AV_GET_ALL');
  });

  test('findByBaseId propagates getAll rejection (stats-like degrade NOT applied)', async () => {
    stubRuntime([{ respond: { success: false, error: 'db gone' } }]);
    await expect(AdultAvStore.findByBaseId('ABC-1')).rejects.toThrow('db gone');
  });
});
