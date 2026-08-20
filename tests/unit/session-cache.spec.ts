/**
 * Unit tests for src/features/cache/session-cache.ts (L1.5 session cache).
 *
 * chrome.storage.session is mocked as an in-memory Map to verify:
 *  - get/set/remove/removeByPrefix/clear round-trips
 *  - SESSION_CACHE_KEYS constants
 *  - graceful degradation when chrome.storage.session is absent
 *  - exception swallowing (soft miss, never throw)
 */
import { test, expect } from '@playwright/test'
import * as sessionCache from '@/features/cache/session-cache'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build an in-memory chrome.storage.session mock backed by a Map. */
function createSessionMock(): {
  storage: { session: Record<string, unknown> }
} {
  const _map = new Map<string, unknown>()
  return {
    storage: {
      session: {
        get: async (key: string | null) => {
          if (key === null) {
            const all: Record<string, unknown> = {}
            for (const [k, v] of _map) all[k] = v
            return all
          }
          return { [key]: _map.get(key) }
        },
        set: async (items: Record<string, unknown>) => {
          for (const [k, v] of Object.entries(items)) _map.set(k, v)
        },
        remove: async (keys: string | string[]) => {
          const ks = Array.isArray(keys) ? keys : [keys]
          for (const k of ks) _map.delete(k)
        },
        clear: async () => _map.clear(),
        getKeys: async () => [..._map.keys()],
      },
    },
  }
}

function setChrome(stub: object): void {
  ;(globalThis as { chrome?: unknown }).chrome = stub
}

function clearChrome(): void {
  ;(globalThis as { chrome?: unknown }).chrome = undefined
}

// ---------------------------------------------------------------------------
// SESSION_CACHE_KEYS
// ---------------------------------------------------------------------------

test.describe('SESSION_CACHE_KEYS', () => {
  test('watched() returns prefixed key', () => {
    expect(sessionCache.SESSION_CACHE_KEYS.watched('douban_records')).toBe('watched:douban_records')
  })

  test('WATCHED_PREFIX is correct', () => {
    expect(sessionCache.SESSION_CACHE_KEYS.WATCHED_PREFIX).toBe('watched:')
  })

  test('SETTINGS_SNAPSHOT is correct', () => {
    expect(sessionCache.SESSION_CACHE_KEYS.SETTINGS_SNAPSHOT).toBe('settings:snapshot')
  })
})

// ---------------------------------------------------------------------------
// get / set
// ---------------------------------------------------------------------------

test.describe('get / set', () => {
  test.beforeEach(() => { setChrome(createSessionMock()) })
  test.afterEach(clearChrome)

  test('round-trip: set then get returns the same value', async () => {
    await sessionCache.set('test:key', { hello: 'world' })
    const val = await sessionCache.get<{ hello: string }>('test:key')
    expect(val).toEqual({ hello: 'world' })
  })

  test('get miss returns undefined for an unwritten key', async () => {
    const val = await sessionCache.get('never:written')
    expect(val).toBeUndefined()
  })

  test('remove: set then remove, subsequent get returns undefined', async () => {
    await sessionCache.set('remove:me', 42)
    await sessionCache.remove('remove:me')
    const val = await sessionCache.get('remove:me')
    expect(val).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// removeByPrefix
// ---------------------------------------------------------------------------

test.describe('removeByPrefix', () => {
  test.beforeEach(() => { setChrome(createSessionMock()) })
  test.afterEach(clearChrome)

  test('removes only keys matching the prefix, keeps others', async () => {
    await sessionCache.set('watched:a', 'a')
    await sessionCache.set('watched:b', 'b')
    await sessionCache.set('settings:snapshot', { theme: 'dark' })

    await sessionCache.removeByPrefix('watched:')

    expect(await sessionCache.get('watched:a')).toBeUndefined()
    expect(await sessionCache.get('watched:b')).toBeUndefined()
    expect(await sessionCache.get('settings:snapshot')).toEqual({ theme: 'dark' })
  })
})

// ---------------------------------------------------------------------------
// clear
// ---------------------------------------------------------------------------

test.describe('clear', () => {
  test.beforeEach(() => { setChrome(createSessionMock()) })
  test.afterEach(clearChrome)

  test('clears all keys from the session area', async () => {
    await sessionCache.set('watched:a', 'a')
    await sessionCache.set('watched:b', 'b')
    await sessionCache.set('settings:snapshot', 'x')

    await sessionCache.clear()

    expect(await sessionCache.get('watched:a')).toBeUndefined()
    expect(await sessionCache.get('watched:b')).toBeUndefined()
    expect(await sessionCache.get('settings:snapshot')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Degradation: chrome.storage.session absent
// ---------------------------------------------------------------------------

test.describe('degradation — no chrome.storage.session', () => {
  test.beforeEach(() => {
    // Only local storage is available — session is absent.
    setChrome({ storage: { local: {} } })
  })
  test.afterEach(clearChrome)

  test('get returns undefined', async () => {
    expect(await sessionCache.get('any:key')).toBeUndefined()
  })

  test('set is a no-op and does not throw', async () => {
    await expect(sessionCache.set('any:key', 'val')).resolves.toBeUndefined()
  })

  test('remove is a no-op and does not throw', async () => {
    await expect(sessionCache.remove('any:key')).resolves.toBeUndefined()
  })

  test('removeByPrefix is a no-op and does not throw', async () => {
    await expect(sessionCache.removeByPrefix('watched:')).resolves.toBeUndefined()
  })

  test('clear is a no-op and does not throw', async () => {
    await expect(sessionCache.clear()).resolves.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Exception swallowing (soft miss semantics)
// ---------------------------------------------------------------------------

test.describe('exception swallowing', () => {
  test.afterEach(clearChrome)

  test('get swallows exceptions and returns undefined', async () => {
    setChrome({
      storage: {
        session: {
          get: async () => { throw new Error('session unavailable') },
          set: async () => {},
          remove: async () => {},
          clear: async () => {},
        },
      },
    })
    const val = await sessionCache.get('any:key')
    expect(val).toBeUndefined()
  })

  test('set swallows exceptions', async () => {
    setChrome({
      storage: {
        session: {
          get: async () => ({}),
          set: async () => { throw new Error('write failed') },
          remove: async () => {},
          clear: async () => {},
        },
      },
    })
    await expect(sessionCache.set('any:key', 'val')).resolves.toBeUndefined()
  })

  test('remove swallows exceptions', async () => {
    setChrome({
      storage: {
        session: {
          get: async () => ({}),
          set: async () => {},
          remove: async () => { throw new Error('remove failed') },
          clear: async () => {},
        },
      },
    })
    await expect(sessionCache.remove('any:key')).resolves.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// removeByPrefix fallback path (no getKeys)
// ---------------------------------------------------------------------------

test.describe('removeByPrefix — fallback path (no getKeys)', () => {
  test.afterEach(clearChrome)

  test('falls back to get(null) full scan when getKeys is absent', async () => {
    const _map = new Map<string, unknown>()
    _map.set('watched:a', 'a')
    _map.set('watched:b', 'b')
    _map.set('settings:snapshot', { theme: 'dark' })

    setChrome({
      storage: {
        session: {
          get: async (key: string | null) => {
            if (key === null) {
              const all: Record<string, unknown> = {}
              for (const [k, v] of _map) all[k] = v
              return all
            }
            return { [key]: _map.get(key) }
          },
          set: async (items: Record<string, unknown>) => {
            for (const [k, v] of Object.entries(items)) _map.set(k, v)
          },
          remove: async (keys: string | string[]) => {
            const ks = Array.isArray(keys) ? keys : [keys]
            for (const k of ks) _map.delete(k)
          },
          clear: async () => _map.clear(),
          // Intentionally no getKeys — exercises the fallback path.
        },
      },
    })

    await sessionCache.removeByPrefix('watched:')

    expect(_map.has('watched:a')).toBe(false)
    expect(_map.has('watched:b')).toBe(false)
    expect(_map.get('settings:snapshot')).toEqual({ theme: 'dark' })
  })
})