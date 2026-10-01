import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';
import { fetchCatalogByUrl, NeoDBError } from '@/provider/neodb/api';

// Installs happen inside tests below; register this file's sandbox hooks at module scope.
initFileSandbox();

/**
 * NeoDB fetch timeout contract (Wave B1): each attempt aborts after 30s
 * so a hung host cannot pin the service worker. Abort is terminal — no retry.
 */

test('hung NeoDB request rejects with Timeout (no infinite wait)', async () => {
  defineGlobal('fetch', (() => {
    return new Promise((_resolve, reject) => {
      // Simulate a never-settling network call; AbortController must reject it.
      const err = new Error('aborted');
      err.name = 'AbortError';
      setTimeout(() => reject(err), 50);
    });
  }) as typeof fetch);

  await expect(
    fetchCatalogByUrl('https://movie.douban.com/subject/1/', 'tok'),
  ).rejects.toMatchObject({
    name: 'NeoDBError',
    status: 0,
  });
});

test('NeoDBError carries Timeout business message on abort', async () => {
  defineGlobal('fetch', (async () => {
    const err = new Error('aborted');
    err.name = 'AbortError';
    throw err;
  }) as typeof fetch);

  // The sandbox helper restores fetch in afterAll, so no per-test finally here.
  try {
    await fetchCatalogByUrl('https://movie.douban.com/subject/1/');
    throw new Error('should have thrown');
  } catch (e) {
    expect(e).toBeInstanceOf(NeoDBError);
    expect((e as NeoDBError).businessMsg).toContain('timed out');
  }
});
