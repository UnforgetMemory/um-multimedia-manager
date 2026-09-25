import { test, expect } from '@playwright/test'
import { fetchCatalogByUrl, NeoDBError } from '@/features/neodb/api'

/**
 * NeoDB fetch timeout contract (Wave B1): each attempt aborts after 30s
 * so a hung host cannot pin the service worker. Abort is terminal — no retry.
 */

test('hung NeoDB request rejects with Timeout (no infinite wait)', async () => {
  const realFetch = globalThis.fetch
  globalThis.fetch = (() => {
    return new Promise((_resolve, reject) => {
      // Simulate a never-settling network call; AbortController must reject it.
      const err = new Error('aborted')
      err.name = 'AbortError'
      setTimeout(() => reject(err), 50)
    })
  }) as typeof fetch

  try {
    await expect(fetchCatalogByUrl('https://movie.douban.com/subject/1/', 'tok')).rejects.toMatchObject({
      name: 'NeoDBError',
      status: 0,
    })
  } finally {
    globalThis.fetch = realFetch
  }
})

test('NeoDBError carries Timeout business message on abort', async () => {
  const realFetch = globalThis.fetch
  globalThis.fetch = (async () => {
    const err = new Error('aborted')
    err.name = 'AbortError'
    throw err
  }) as typeof fetch

  try {
    await fetchCatalogByUrl('https://movie.douban.com/subject/1/')
    throw new Error('should have thrown')
  } catch (e) {
    expect(e).toBeInstanceOf(NeoDBError)
    expect((e as NeoDBError).businessMsg).toContain('timed out')
  } finally {
    globalThis.fetch = realFetch
  }
})
