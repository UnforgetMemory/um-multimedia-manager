import { test, expect } from '@playwright/test'
import { JSDOM } from 'jsdom'
import { syncNeoDBOnLoad } from '@/content/douban/pages/detail/composables/useCrossPlatformSync'
import type { StoreRecord, UrlIdentity } from '@/types'

/**
 * Regression for the syncNeoDBOnLoad local-record URL bug (umreview).
 *
 * Step 1 of syncNeoDBOnLoad creates a missing local `neodb_records` entry.
 * Before the fix it used a hand-written URL that ignored music→album mapping
 * and show:/season:/episode: TV prefixes. It now delegates to
 * UrlResolverBuilder.buildNeoDBUrl (same source of truth as syncToNeoDB).
 *
 * chrome.runtime.sendMessage is stubbed (same pattern as
 * cross-platform-save-bulk.spec.ts). extractCrossPlatformLinks reads #info
 * from the JSDOM document; with no #info present it passes existingLinkedIds
 * through unchanged.
 */

// Install JSDOM globals before module-level DOM access.
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'https://movie.douban.com/subject/12345/',
  pretendToBeVisual: true,
})
;(globalThis as { document?: unknown }).document = dom.window.document
;(globalThis as { window?: unknown }).window = dom.window
if (typeof (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame === 'undefined') {
  ;(globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame =
    dom.window.requestAnimationFrame.bind(dom.window)
  ;(globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame =
    dom.window.cancelAnimationFrame.bind(dom.window)
}

// JSDOM does not implement HTMLElement.innerText; polyfill it as textContent so
// scanDoubanPageStatus (neodb-push.ts:32) can run in the unit-test environment.
Object.defineProperty(dom.window.HTMLElement.prototype, 'innerText', {
  get() { return this.textContent ?? '' },
  set(value: string) { this.textContent = value },
  configurable: true,
})

interface SentMessage {
  type: string
  payload?: Record<string, unknown>
}

interface StubOptions {
  existingDouban: StoreRecord
  existingNeoDB: StoreRecord | null
  autoSyncNeoDB?: boolean
  pushResult?: { success: boolean; catalogUuid?: string }
}

function makeIdentity(type: string): UrlIdentity {
  return { type, providerId: '123', url: `https://${type}.douban.com/subject/123/` }
}

function stubDouban(linkedIds: Record<string, string>): StoreRecord {
  return {
    url: 'https://movie.douban.com/subject/12345/',
    status: 2,
    rating: 8,
    comment: '',
    updatedAt: '2026-08-20T00:00:00.000Z',
    linkedIds,
  }
}

function installChromeStub(opts: StubOptions): { sent: SentMessage[] } {
  const sent: SentMessage[] = []
  const chromeStub = {
    runtime: {
      id: 'test-extension',
      lastError: undefined,
      sendMessage: (msg: SentMessage, cb?: (res: unknown) => void) => {
        sent.push(msg)
        let response: unknown = { success: true }
        if (msg.type === 'DB_GET') {
          const payload = msg.payload as { storeName: string }
          if (payload.storeName === 'douban_records') {
            response = { success: true, record: opts.existingDouban }
          } else if (payload.storeName === 'neodb_records') {
            response = { success: true, record: opts.existingNeoDB ?? null }
          } else {
            response = { success: true, record: null }
          }
        } else if (msg.type === 'GET_SETTINGS') {
          // autoSyncNeoDB=false (default) gates Step 2 (API push) so the
          // existing tests isolate Step 1; the button-refresh test opts in.
          response = { success: true, settings: { autoSyncNeoDB: opts.autoSyncNeoDB ?? false, neodbToken: 'tok' } }
        } else if (msg.type === 'NEODB_PUSH_RATING') {
          response = opts.pushResult ?? { success: false }
        }
        cb?.(response)
      },
      onMessage: { addListener: () => {} },
    },
  }
  ;(globalThis as { chrome?: unknown }).chrome = chromeStub
  return { sent }
}

function clearChromeStub(): void {
  ;(globalThis as { chrome?: unknown }).chrome = undefined
}

function neodbPut(sent: SentMessage[]): StoreRecord {
  const put = sent
    .filter(m => m.type === 'DB_PUT')
    .find(m => (m.payload as { storeName: string }).storeName === 'neodb_records')
  expect(put).toBeDefined()
  return (put!.payload as { record: StoreRecord }).record
}

test.describe('syncNeoDBOnLoad — local neodb_records URL construction', () => {
  test('music type → album URL (not /music/)', async () => {
    const { sent } = installChromeStub({
      existingDouban: stubDouban({ neodb: 'music::uuid123' }),
      existingNeoDB: null,
    })
    try {
      await syncNeoDBOnLoad(makeIdentity('music'), { status: 2, rating: 8 })
      expect(neodbPut(sent).url).toBe('https://neodb.social/album/uuid123/')
    } finally {
      clearChromeStub()
    }
  })

  test('tv type with show: prefix → /tv/{id}/', async () => {
    const { sent } = installChromeStub({
      existingDouban: stubDouban({ neodb: 'tv::show:456' }),
      existingNeoDB: null,
    })
    try {
      await syncNeoDBOnLoad(makeIdentity('tv'), { status: 2, rating: 8 })
      expect(neodbPut(sent).url).toBe('https://neodb.social/tv/456/')
    } finally {
      clearChromeStub()
    }
  })

  test('movie type → /movie/{uuid}/', async () => {
    const { sent } = installChromeStub({
      existingDouban: stubDouban({ neodb: 'movie::uuid789' }),
      existingNeoDB: null,
    })
    try {
      await syncNeoDBOnLoad(makeIdentity('movie'), { status: 2, rating: 8 })
      expect(neodbPut(sent).url).toBe('https://neodb.social/movie/uuid789/')
    } finally {
      clearChromeStub()
    }
  })

  test('existing local record is updated immutably (no in-place mutation)', async () => {
    const existingNeoDB = stubDouban({ douban: 'movie::123' })
    const { sent } = installChromeStub({
      existingDouban: stubDouban({ neodb: 'movie::uuid789', imdb: 'movie::tt1' }),
      existingNeoDB,
    })
    try {
      await syncNeoDBOnLoad(makeIdentity('movie'), { status: 2, rating: 8 })
      const record = neodbPut(sent)
      expect(record.linkedIds.douban).toBe('movie::123')
      // The pre-read snapshot must not have been mutated in place.
      expect(existingNeoDB.linkedIds.douban).toBe('movie::123')
      expect(record).not.toBe(existingNeoDB)
    } finally {
      clearChromeStub()
    }
  })
})

test.describe('syncNeoDBOnLoad — first-time auto-sync button refresh', () => {
  test('successful push renders the "Open in NeoDB" button', async () => {
    // Minimal Douban DOM so injectNeoDBPushButtons has a mount point.
    document.body.innerHTML = '<div id="interest_sect_level"></div>'
    installChromeStub({
      existingDouban: stubDouban({}), // no NeoDB link yet
      existingNeoDB: null,
      autoSyncNeoDB: true,
      pushResult: { success: true, catalogUuid: 'uuid123' },
    })
    try {
      await syncNeoDBOnLoad(makeIdentity('movie'), { status: 2, rating: 8 })
      const openBtn = document.getElementById('umm-neodb-open')
      expect(openBtn).not.toBeNull()
      expect(openBtn?.getAttribute('href')).toBe('https://neodb.social/movie/uuid123/')
    } finally {
      clearChromeStub()
      document.body.innerHTML = ''
    }
  })
})