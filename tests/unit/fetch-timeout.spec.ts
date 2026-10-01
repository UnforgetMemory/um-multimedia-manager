import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';

initFileSandbox();
import { fetchWithTimeout, withTimeout } from '@/libraries/utils/fetch-timeout';

/**
 * Shared timeout helpers (audit 2026-09-25 §P-C): every guarded fetch must
 * reject once its deadline passes — a hung host must never pin a worker.
 */

function hungFetch(): { calls: RequestInit[] } {
  const calls: RequestInit[] = [];
  defineGlobal('fetch', ((_input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(init ?? {});
    return new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        reject(err);
      });
    });
  }) as typeof fetch);
  return { calls };
}

test('fetchWithTimeout attaches a timeout signal that rejects a hung request', async () => {
  const realFetch = globalThis.fetch;
  try {
    const { calls } = hungFetch();
    await expect(
      fetchWithTimeout('https://hang.test/', { credentials: 'include' }, 30),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(calls).toHaveLength(1);
    // `!`：上方 toHaveLength(1) 已守卫（测试代码允许）。
    expect(calls[0]!.signal).toBeInstanceOf(AbortSignal);
    expect(calls[0]!.credentials).toBe('include');
  } finally {
    defineGlobal('fetch', realFetch);
  }
});

test('fetchWithTimeout resolves through when fetch settles before the deadline', async () => {
  const realFetch = globalThis.fetch;
  try {
    defineGlobal('fetch', (async () => new Response('ok')) as typeof fetch);
    const resp = await fetchWithTimeout('https://fast.test/', { credentials: 'include' });
    expect(await resp.text()).toBe('ok');
  } finally {
    defineGlobal('fetch', realFetch);
  }
});

test('fetchWithTimeout keeps a caller-provided signal untouched', async () => {
  const realFetch = globalThis.fetch;
  try {
    const { calls } = hungFetch();
    const controller = new AbortController();
    const p = fetchWithTimeout('https://hang.test/', { signal: controller.signal }, 30);
    controller.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    expect(calls).toHaveLength(1); // 存在性守卫
    expect(calls[0]!.signal).toBe(controller.signal);
  } finally {
    defineGlobal('fetch', realFetch);
  }
});

test('withTimeout rejects with the given message when the promise hangs', async () => {
  await expect(withTimeout(new Promise<never>(() => {}), 20, 'boom')).rejects.toThrow('boom');
});

test('withTimeout passes through a value rejected before the deadline', async () => {
  await expect(
    withTimeout(Promise.reject(new Error('real failure')), 5_000, 'boom'),
  ).rejects.toThrow('real failure');
});
