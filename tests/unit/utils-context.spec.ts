import { test, expect } from '@playwright/test';
import type { ResponseMessageMap } from '@/types';

/**
 * utils/context.ts — extension-context guard + typed safe messaging.
 * Contracts pinned (chrome stubbed per test — baseline Chrome 119 callback API):
 * 1. isContextValid requires BOTH runtime.id and runtime.sendMessage;
 * 2. safeSendMessage happy path forwards the envelope verbatim and resolves the
 *    discriminated response;
 * 3. "Extension context invalidated" is PERMANENT — zero sendMessage calls,
 *    no retry loop, null + fallback();
 * 4. lastError / timeout failures retry with backoff (retries = total attempts,
 *    default 2) and resolve when a later attempt succeeds;
 * 5. exhausted attempts → null + fallback; timeout path uses its own
 *    `Message timeout after Xms` rejection (observable via attempt count).
 * 6. module init under a non-Vite loader: `import.meta.env?.DEV` is undefined,
 *    so the window-gated __UMM_DEBUG__ block never executes (documented guard).
 */

interface Sent {
  message: unknown;
}

interface ChromeStub {
  runtime:
    | { id?: string; sendMessage?: unknown; lastError: { message: string } | null }
    | undefined;
}

let prevChrome: unknown;

function stubChrome(stub: ChromeStub): void {
  prevChrome = (globalThis as { chrome?: unknown }).chrome;
  Object.defineProperty(globalThis, 'chrome', { value: stub, configurable: true, writable: true });
}

test.afterEach(() => {
  Object.defineProperty(globalThis, 'chrome', {
    value: prevChrome,
    configurable: true,
    writable: true,
  });
  prevChrome = undefined;
});

type Mod = typeof import('@/libraries/utils/context');
type SendFn = (message: unknown, callback: (response: unknown) => void) => void;

let mod: Mod | undefined;
async function load(): Promise<Mod> {
  if (!mod) mod = await import('@/libraries/utils/context');
  return mod;
}

/** sendMessage script: one entry per call; last entry repeats. */
function stubSendMessage(
  script: Array<{ respond?: unknown; lastError?: string; silent?: boolean }>,
): {
  calls: Sent[];
} {
  const calls: Sent[] = [];
  const runtime: NonNullable<ChromeStub['runtime']> = {
    id: 'mmextensionidabcdefgh',
    lastError: null,
  };
  runtime.sendMessage = ((message: unknown, callback: (response: unknown) => void) => {
    const step = script[Math.min(calls.length, script.length - 1)]!;
    calls.push({ message });
    if (step.silent) return; // receiver never answers → caller's timer fires
    if (step.lastError !== undefined) {
      runtime.lastError = { message: step.lastError };
      callback(undefined);
      runtime.lastError = null;
      return;
    }
    callback(step.respond);
  }) satisfies SendFn;
  stubChrome({ runtime });
  return { calls };
}

const PING = { type: 'DB_GET_ALL', payload: { storeName: 'douban_records' } } as const;
const OK = { success: true, entries: [] } satisfies ResponseMessageMap['DB_GET_ALL'];

test.describe('utils/context', () => {
  test('isContextValid gates on id AND sendMessage', async () => {
    const { isContextValid } = await load();
    stubChrome({
      runtime: { id: 'abc', sendMessage: () => {}, lastError: null },
    });
    expect(isContextValid()).toBe(true);
    stubChrome({ runtime: { id: '', sendMessage: () => {}, lastError: null } });
    expect(isContextValid()).toBe(false);
    stubChrome({ runtime: { id: 'abc', lastError: null } }); // no sendMessage
    expect(isContextValid()).toBe(false);
    stubChrome({ runtime: undefined });
    expect(isContextValid()).toBe(false);
  });

  test('happy path: envelope forwarded verbatim, typed response resolved', async () => {
    const { safeSendMessage } = await load();
    const { calls } = stubSendMessage([{ respond: OK }]);
    const res = await safeSendMessage(PING);
    expect(res).toEqual(OK);
    expect(calls).toEqual([{ message: PING }]);
  });

  test('context invalidated → permanent: zero sends, no retries, null + fallback', async () => {
    const { safeSendMessage } = await load();
    const { calls } = stubSendMessage([{ respond: OK }]);
    const chrome = (globalThis as unknown as { chrome: ChromeStub }).chrome;
    chrome.runtime!.id = ''; // invalidated after the stub is installed
    let fellBack = false;
    const res = await safeSendMessage(PING, { retries: 3, fallback: () => void (fellBack = true) });
    expect(res).toBeNull();
    expect(calls).toHaveLength(0); // throws before any send
    expect(fellBack).toBe(true);
  });

  test('transient lastError → retried (retries=2 default) → resolves on attempt 2', async () => {
    const { safeSendMessage } = await load();
    const { calls } = stubSendMessage([
      { lastError: 'Could not establish connection.' },
      { respond: OK },
    ]);
    const started = Date.now();
    const res = await safeSendMessage(PING);
    expect(res).toEqual(OK);
    expect(calls).toHaveLength(2);
    // Exponential backoff actually slept ≥1s before attempt 2.
    expect(Date.now() - started).toBeGreaterThanOrEqual(950);
  });

  test('all attempts fail → null after exactly `retries` sends + fallback fires', async () => {
    const { safeSendMessage } = await load();
    const { calls } = stubSendMessage([{ lastError: 'Receiving end does not exist.' }]);
    let fellBack = false;
    const res = await safeSendMessage(PING, {
      retries: 1,
      fallback: () => void (fellBack = true),
    });
    expect(res).toBeNull();
    expect(calls).toHaveLength(1); // retries = TOTAL attempts, not extra ones
    expect(fellBack).toBe(true);
  });

  test('silent callback → own timeout rejects and exhausts attempts (no hang)', async () => {
    const { safeSendMessage } = await load();
    const { calls } = stubSendMessage([{ silent: true }]);
    const started = Date.now();
    const res = await safeSendMessage(PING, { timeout: 30, retries: 2 });
    const elapsed = Date.now() - started;
    expect(res).toBeNull();
    expect(calls).toHaveLength(2); // two timed-out attempts…
    expect(elapsed).toBeGreaterThanOrEqual(1000); // …separated by the 1s backoff
  });

  test('import.meta.env?.DEV guard: no __UMM_DEBUG__ under the node loader', async () => {
    const fakeWindow: Record<string, unknown> = {};
    const hadWindow = 'window' in globalThis;
    Object.defineProperty(globalThis, 'window', { value: fakeWindow, configurable: true });
    try {
      await load(); // module already initialised — the guard must have skipped
      expect(fakeWindow.__UMM_DEBUG__).toBeUndefined();
    } finally {
      if (!hadWindow) delete (globalThis as { window?: unknown }).window;
      else
        Object.defineProperty(globalThis, 'window', {
          value: prevWindowValue(),
          configurable: true,
        });
    }
  });
});

function prevWindowValue(): unknown {
  return (globalThis as { window?: unknown }).window;
}
