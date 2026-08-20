import { test, expect } from '@playwright/test'
import { JSDOM } from 'jsdom'
import { onCrossPlatformSave } from '@/content/douban/pages/detail/composables/useCrossPlatformSync'
import type { StoreRecord, UrlIdentity } from '@/types'

/**
 * ADR-015 behavior locks for onCrossPlatformSave (bulk-read / write-merge).
 *
 * Locks the message-level contract of the pre-read refactor:
 * - Step 1 reads the douban record exactly once; its linkedIds gate the
 *   parallel Step 2 reads (no linked ids → zero extra DB_GET messages).
 * - The douban key is persisted exactly once per save (write-merge — the
 *   pre-bulk version issued two DB_PUT for the same key when links changed).
 * - The trailing reload dbGet is gone: the returned record already reflects
 *   the persisted state.
 * - NeoDB auto-sync is gated by GET_SETTINGS; disabled here via the mock so
 *   no NEODB_PUSH_RATING traffic is expected.
 *
 * chrome.runtime.sendMessage is stubbed (same pattern as record-cache.spec.ts).
 * The content-script modules reference the bare `document`/`window` globals,
 * so a JSDOM instance is installed on globalThis for the Node-based runner
 * (same pattern as personage-creations-extract.spec.ts, adapted to globals).
 * extractCrossPlatformLinks reads #info from that document: absent by default
 * (pure pass-through of existingLinkedIds), injected in the IMDb case.
 */

// Install JSDOM globals before any module-level DOM access.
// pretendToBeVisual supplies requestAnimationFrame on the JSDOM window; hoist
// it (plus cancelAnimationFrame) onto globalThis because content-script
// modules reference the bare global identifiers.
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

interface SentMessage {
  type: string
  payload?: Record<string, unknown>
}

interface StubOptions {
  existingDouban?: StoreRecord | null
  linkedImdb?: StoreRecord | null
  linkedTmdb?: StoreRecord | null
  autoSyncNeoDB?: boolean
}

function makeIdentity(): UrlIdentity {
  return {
    type: 'movie',
    providerId: '12345',
    url: 'https://movie.douban.com/subject/12345/',
  }
}

function stubRecord(overrides: Partial<StoreRecord> = {}): StoreRecord {
  return {
    url: 'https://movie.douban.com/subject/12345/',
    status: 2,
    rating: 8,
    comment: '',
    updatedAt: '2026-08-20T00:00:00.000Z',
    linkedIds: {},
    ...overrides,
  }
}

/** Install a chrome.runtime.sendMessage stub; returns the captured messages. */
function installChromeStub(opts: StubOptions = {}): { sent: SentMessage[] } {
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
            response = { success: true, record: opts.existingDouban ?? null }
          } else if (payload.storeName === 'imdb_records') {
            response = { success: true, record: opts.linkedImdb ?? null }
          } else if (payload.storeName === 'tmdb_records') {
            response = { success: true, record: opts.linkedTmdb ?? null }
          } else {
            response = { success: true, record: null }
          }
        } else if (msg.type === 'GET_SETTINGS') {
          response = { success: true, settings: { autoSyncNeoDB: opts.autoSyncNeoDB ?? false } }
        } else if (msg.type === 'NEODB_PUSH_RATING') {
          response = { success: false }
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

function of(sent: SentMessage[], type: string): SentMessage[] {
  return sent.filter(m => m.type === type)
}

/** Remove any leftover #info element between tests. */
function removeInfoBlock(): void {
  document.querySelectorAll('#info').forEach(el => el.remove())
}

test.describe('onCrossPlatformSave — bulk-read / write-merge (ADR-015)', () => {
  test('new record: exactly one DB_GET (douban) + one DB_PUT; no linked reads', async () => {
    const { sent } = installChromeStub({ existingDouban: null })
    try {
      const result = await onCrossPlatformSave({
        identity: makeIdentity(),
        interest: 'collect',
        stars: 4,
        comment: 'hello',
        newStatus: 2,
        newRating: 8,
      })

      // Single douban read; no imdb/tmdb/neodb reads (no linked ids to fetch).
      expect(of(sent, 'DB_GET')).toHaveLength(1)
      expect((of(sent, 'DB_GET')[0].payload as { storeName: string }).storeName).toBe('douban_records')

      // Write-merge: exactly one DB_PUT, targeting the douban key only.
      const puts = of(sent, 'DB_PUT')
      expect(puts).toHaveLength(1)
      expect((puts[0].payload as { storeName: string }).storeName).toBe('douban_records')

      // NeoDB branch disabled by settings → no push traffic.
      expect(of(sent, 'NEODB_PUSH_RATING')).toHaveLength(0)

      // Returned record reflects the persisted state (no trailing reload needed).
      expect(result?.status).toBe(2)
      expect(result?.rating).toBe(8)
      expect(result?.comment).toBe('hello')
    } finally {
      clearChromeStub()
    }
  })

  test('existing record, links unchanged: one read, one write, comment inherits', async () => {
    const existing = stubRecord({ comment: 'old note', linkedIds: {} })
    const { sent } = installChromeStub({ existingDouban: existing })
    try {
      // No #info in the document → extractCrossPlatformLinks passes {} through,
      // which equals existing.linkedIds → linksChanged = false.
      const result = await onCrossPlatformSave({
        identity: makeIdentity(),
        interest: 'do',
        stars: 3,
        comment: '',
        newStatus: 3,
        newRating: 6,
      })

      expect(of(sent, 'DB_GET')).toHaveLength(1)
      const puts = of(sent, 'DB_PUT')
      expect(puts).toHaveLength(1)
      expect((puts[0].payload as { storeName: string }).storeName).toBe('douban_records')
      // Empty incoming comment falls back to the existing record's comment.
      expect(result?.comment).toBe('old note')
      expect(result?.status).toBe(3)
    } finally {
      clearChromeStub()
    }
  })

  test('new IMDb link discovered in #info: parallel linked read + cross-platform write', async () => {
    removeInfoBlock()
    const info = document.createElement('div')
    info.id = 'info'
    info.innerHTML = '<span>IMDb:</span> tt23810070'
    document.body.appendChild(info)

    const existing = stubRecord({ linkedIds: {} })
    const { sent } = installChromeStub({ existingDouban: existing, linkedImdb: null })
    try {
      await onCrossPlatformSave({
        identity: makeIdentity(),
        interest: 'collect',
        stars: 5,
        comment: '',
        newStatus: 2,
        newRating: 10,
      })

      // Step 1 douban read + Step 2 parallel imdb read (tmdb/neodb have no keys).
      const gets = of(sent, 'DB_GET')
      expect(gets).toHaveLength(2)
      const getStores = gets.map(m => (m.payload as { storeName: string }).storeName).sort()
      expect(getStores).toEqual(['douban_records', 'imdb_records'])

      // Douban write-merge (exactly once) + imdb target write.
      const puts = of(sent, 'DB_PUT')
      expect(puts).toHaveLength(2)
      const putStores = puts.map(m => (m.payload as { storeName: string }).storeName).sort()
      expect(putStores).toEqual(['douban_records', 'imdb_records'])

      // The imdb write carries the douban back-link.
      const imdbPut = puts.find(m => (m.payload as { storeName: string }).storeName === 'imdb_records')
      const imdbRecord = (imdbPut?.payload as { record: StoreRecord }).record
      expect(imdbRecord.linkedIds.douban).toBe('movie::12345')
    } finally {
      removeInfoBlock()
      clearChromeStub()
    }
  })

  test('GET_SETTINGS is queried exactly once per save (NeoDB gate)', async () => {
    const { sent } = installChromeStub({ existingDouban: null })
    try {
      await onCrossPlatformSave({
        identity: makeIdentity(),
        interest: 'wish',
        stars: 0,
        comment: '',
        newStatus: 1,
        newRating: 0,
      })
      expect(of(sent, 'GET_SETTINGS')).toHaveLength(1)
    } finally {
      clearChromeStub()
    }
  })
})
