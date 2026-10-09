import { test, expect } from '@playwright/test';
import { AdultAvStore } from '@/provider/adult-av/transport';
import { initFileSandbox, defineGlobal } from './helpers/global-sandbox';

/**
 * Failure-distinguishable reads on the adult-av transport.
 *
 * Defect class pinned here: a one-shot message-RPC read whose failure was
 * swallowed into an EMPTY SET / ALL-ZEROS result. Callers then cannot tell
 * "the background answered: nothing watched" from "the background never
 * answered", and a mount-time cache paints the fabrication for the whole page.
 * Contract: both reads stay await-safe (they never reject — fire-and-forget
 * content-script callers must not gain unhandled rejections) and carry an
 * explicit `ok` flag + `error` reason.
 *
 * Harness: callback-style chrome.runtime stub (Chrome 119 baseline). The
 * transport calls safeSendMessage({timeout:8000, retries:1}) → one send per
 * logical call; `lastError` is the "receiving end does not exist" shape and
 * `{success:false}` the "handler answered no" shape.
 */

initFileSandbox();

interface Step {
  respond?: unknown;
  lastError?: string;
}

const calls: Array<{ type: string; payload: unknown }> = [];

function stubRuntime(script: Step[]): void {
  const runtime = {
    id: 'mmextensionidabcdefgh',
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
  defineGlobal('chrome', { runtime });
}

test.beforeEach(() => {
  calls.length = 0;
});

test.describe('AdultAvStore — failed read is not an answer', () => {
  test('batchCheckExists: transport failure → ok:false + reason (empty set is NOT a verdict)', async () => {
    stubRuntime([{ lastError: 'Receiving end does not exist.' }]);
    const res = await AdultAvStore.batchCheckExists(['abc-1']);
    expect(res.ok).toBe(false);
    expect(typeof res.error).toBe('string');
    expect((res.error ?? '').length).toBeGreaterThan(0);
    expect(res.size).toBe(0);
  });

  test('batchCheckExists: handler rejection → ok:false carrying the handler message', async () => {
    stubRuntime([{ respond: { success: false, error: 'db locked' } }]);
    const res = await AdultAvStore.batchCheckExists(['abc-1']);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('db locked');
  });

  test('batchCheckExists: success without a usable watched array → ok:false, not an empty verdict', async () => {
    stubRuntime([{ respond: { success: true } }, { respond: { success: true, watched: 'oops' } }]);
    const missing = await AdultAvStore.batchCheckExists(['x']);
    expect(missing.ok).toBe(false);
    const malformed = await AdultAvStore.batchCheckExists(['x']);
    expect(malformed.ok).toBe(false);
  });

  test('batchCheckExists: an answered read is authoritative — including a real empty set', async () => {
    stubRuntime([
      { respond: { success: true, watched: [] } },
      { respond: { success: true, watched: ['abc-1'] } },
    ]);
    const none = await AdultAvStore.batchCheckExists(['x']);
    expect(none.ok).toBe(true);
    expect(none.error).toBeUndefined();
    expect(none.size).toBe(0);
    const hits = await AdultAvStore.batchCheckExists(['x']);
    expect(hits.ok).toBe(true);
    expect(Array.from(hits)).toEqual(['ABC-1']);
  });

  test('batchCheckExists: the result is still a Set for dim-only callers', async () => {
    stubRuntime([{ respond: { success: true, watched: ['abc-1'] } }]);
    const res = await AdultAvStore.batchCheckExists(['abc-1']);
    expect(res instanceof Set).toBe(true);
    expect(res.has('ABC-1')).toBe(true);
    expect(res.has('NOPE')).toBe(false);
    expect(calls[0]!.type).toBe('ADULT_AV_CHECK_BATCH');
  });

  test('stats: zeros must never be reported as a real count', async () => {
    stubRuntime([
      { lastError: 'Receiving end does not exist.' },
      { respond: { success: false, error: 'db locked' } },
      { respond: { success: true, jp: 5 } },
    ]);
    const dead = await AdultAvStore.stats();
    expect(dead.ok).toBe(false);
    expect(dead.error).toContain('no response');
    const rejected = await AdultAvStore.stats();
    expect(rejected.ok).toBe(false);
    expect(rejected.error).toContain('db locked');
    // Partial answer: the missing segments cannot be reported as 0 watched.
    const partial = await AdultAvStore.stats();
    expect(partial.ok).toBe(false);
  });

  test('stats: a complete answer is authoritative', async () => {
    stubRuntime([
      { respond: { success: true, jp: 3, us: 1, tid: 2 } },
      { respond: { success: true, jp: 0, us: 0, tid: 0 } },
    ]);
    const full = await AdultAvStore.stats();
    expect(full).toEqual({ ok: true, jp: 3, us: 1, tid: 2 });
    // A genuine "nothing watched anywhere" is still ok:true — that is a verdict.
    const empty = await AdultAvStore.stats();
    expect(empty).toEqual({ ok: true, jp: 0, us: 0, tid: 0 });
  });
});
