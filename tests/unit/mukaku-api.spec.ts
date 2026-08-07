import { test, expect } from '@playwright/test'
import {
  extractLinkedIdsFromPayload,
  shouldPersistProbe,
  extractListEntries,
  getListApiUrl,
  type ProbeExtraction,
} from '@/entrypoints/content/handlers/mukaku/api'

/**
 * Payload-validity contract for the Mukaku probe API parser.
 *
 * BUG BEING FIXED: the old `payload?.data || payload || {}` fallback read an
 * HTTP-200 error/placeholder envelope (e.g. `{code:..., msg:...}` — no `data`
 * key) as `{}`, producing `{doubanId:null, imdbId:null}`. Callers treated that
 * as "confirmed no association" and CACHED it for 7 days. The contract below
 * distinguishes:
 *  - 'invalid' — unusable response (no valid `data` object). A FAILURE: must
 *    never be cached; caller re-probes on the next scan.
 *  - 'ok' — valid `data` object, INCLUDING the confirmed-no-association case
 *    (no id fields → both ids null). Session-cooldown only, never persisted.
 *
 * Parsing rules (defensive, no new API fields):
 *  - payload is an object AND payload.data is a non-null object → extract ids
 *    from `data` only. `payload` itself is NEVER read as the data source.
 *  - anything else → { status: 'invalid' }.
 */

const ok = (
  doubanId: string | null,
  imdbId: string | null,
): ProbeExtraction => ({ status: 'ok', doubanId, imdbId })

test.describe('extractLinkedIdsFromPayload', () => {
  test('valid data with doub_id only → ok with doubanId, imdbId null', () => {
    expect(extractLinkedIdsFromPayload({ data: { doub_id: 12345 } })).toEqual(
      ok('12345', null),
    )
  })

  test('valid data with IMDB_number only → ok with tt-normalized imdbId, doubanId null', () => {
    expect(
      extractLinkedIdsFromPayload({ data: { IMDB_number: 67890 } }),
    ).toEqual(ok(null, 'tt67890'))
  })

  test('IMDB_number already tt-prefixed is not double-normalized', () => {
    expect(
      extractLinkedIdsFromPayload({ data: { IMDB_number: 'tt67890' } }),
    ).toEqual(ok(null, 'tt67890'))
  })

  test('valid data with both ids → ok with both', () => {
    expect(
      extractLinkedIdsFromPayload({
        data: { doub_id: 'd1', IMDB_number: 'tt999' },
      }),
    ).toEqual(ok('d1', 'tt999'))
  })

  test('valid data with no id fields → ok null-null (confirmed no association)', () => {
    expect(extractLinkedIdsFromPayload({ data: {} })).toEqual(ok(null, null))
    expect(extractLinkedIdsFromPayload({ data: { other_field: 'x' } })).toEqual(
      ok(null, null),
    )
  })

  test('data missing (error envelope {code, msg}) → invalid — the core bug case', () => {
    expect(extractLinkedIdsFromPayload({ code: -1, msg: 'error' })).toEqual({
      status: 'invalid',
    })
  })

  test('payload itself carrying ids but NO data key → invalid (payload must never be the data source)', () => {
    expect(extractLinkedIdsFromPayload({ doub_id: '12345' })).toEqual({
      status: 'invalid',
    })
    expect(extractLinkedIdsFromPayload({ IMDB_number: 'tt123' })).toEqual({
      status: 'invalid',
    })
  })

  test('data null → invalid', () => {
    expect(extractLinkedIdsFromPayload({ data: null })).toEqual({
      status: 'invalid',
    })
  })

  test('data non-object (string / number / array) → invalid', () => {
    expect(extractLinkedIdsFromPayload({ data: 'nope' })).toEqual({
      status: 'invalid',
    })
    expect(extractLinkedIdsFromPayload({ data: 42 })).toEqual({
      status: 'invalid',
    })
    // arrays are objects in JS but not a valid response envelope
    expect(extractLinkedIdsFromPayload({ data: [] })).toEqual({
      status: 'invalid',
    })
  })

  test('payload non-object → invalid', () => {
    expect(extractLinkedIdsFromPayload('raw string')).toEqual({
      status: 'invalid',
    })
    expect(extractLinkedIdsFromPayload(42)).toEqual({ status: 'invalid' })
  })

  test('payload null / undefined → invalid', () => {
    expect(extractLinkedIdsFromPayload(null)).toEqual({ status: 'invalid' })
    expect(extractLinkedIdsFromPayload(undefined)).toEqual({
      status: 'invalid',
    })
  })

  test('doub_id present but null/undefined → null (defensive, not "null" string)', () => {
    expect(extractLinkedIdsFromPayload({ data: { doub_id: null } })).toEqual(
      ok(null, null),
    )
    expect(extractLinkedIdsFromPayload({ data: { IMDB_number: undefined } })).toEqual(
      ok(null, null),
    )
  })

  test('empty-string / whitespace ids → null (must never persist a "tt"/"" mapping)', () => {
    expect(extractLinkedIdsFromPayload({ data: { IMDB_number: '' } })).toEqual(ok(null, null))
    expect(extractLinkedIdsFromPayload({ data: { IMDB_number: '   ' } })).toEqual(ok(null, null))
    expect(extractLinkedIdsFromPayload({ data: { doub_id: '' } })).toEqual(ok(null, null))
    expect(extractLinkedIdsFromPayload({ data: { doub_id: '', IMDB_number: '' } })).toEqual(ok(null, null))
  })

  test('falsy-but-present values are coerced defensively', () => {
    // 0 → "0" (valid digit string); IMDB 0 → "tt0" (inert, never matches a record)
    expect(extractLinkedIdsFromPayload({ data: { doub_id: 0 } })).toEqual(ok('0', null))
    expect(extractLinkedIdsFromPayload({ data: { IMDB_number: 0 } })).toEqual(ok(null, 'tt0'))
  })
})

test.describe('shouldPersistProbe', () => {
  test('invalid → false (failure must never be persisted)', () => {
    expect(shouldPersistProbe({ status: 'invalid' })).toBe(false)
  })

  test('ok with both ids null → false (confirmed no association, no mapping to persist)', () => {
    expect(shouldPersistProbe(ok(null, null))).toBe(false)
  })

  test('ok with doubanId → true', () => {
    expect(shouldPersistProbe(ok('123', null))).toBe(true)
  })

  test('ok with imdbId → true', () => {
    expect(shouldPersistProbe(ok(null, 'tt123'))).toBe(true)
  })

  test('ok with both ids → true', () => {
    expect(shouldPersistProbe(ok('123', 'tt123'))).toBe(true)
  })
})

test.describe('extractListEntries — getVideoList payload (search/home list API)', () => {
  // Real response shape (verified 2026-08-07):
  // { requestId, path, success, message, code, data: { data: [ {id, idcode, doub_id, IMDB_number, image, ...} ] } }

  const item = (over: Record<string, unknown> = {}) => ({
    id: 88554,
    idcode: '36508122',
    doub_id: '36508122',
    IMDB_number: 'tt28608179',
    image: 'https://img.bbegge.com/i/2025/08/09/689719b68482c.png',
    title: '瑞克和莫蒂 第八季',
    ...over,
  })

  test('valid list → entries with image/doubanId/imdbId', () => {
    const payload = { data: { data: [item(), item({ id: 92933, doub_id: '36508123', image: 'b.png', IMDB_number: null })] } }
    const entries = extractListEntries(payload)
    expect(entries).toHaveLength(2)
    expect(entries[0]).toEqual({
      image: 'https://img.bbegge.com/i/2025/08/09/689719b68482c.png',
      doubanId: '36508122',
      imdbId: 'tt28608179',
    })
    expect(entries[1]).toEqual({ image: 'b.png', doubanId: '36508123', imdbId: null })
  })

  test('imdb bare number normalized to tt prefix', () => {
    const payload = { data: { data: [item({ IMDB_number: '28608179' })] } }
    expect(extractListEntries(payload)[0].imdbId).toBe('tt28608179')
  })

  test('entry without doub_id skipped (no mapping possible)', () => {
    const payload = { data: { data: [item(), item({ doub_id: null })] } }
    expect(extractListEntries(payload)).toHaveLength(1)
  })

  test('entry without image skipped (cannot match cards)', () => {
    const payload = { data: { data: [item(), item({ image: '' })] } }
    expect(extractListEntries(payload)).toHaveLength(1)
  })

  test('data.data missing / non-array → []', () => {
    expect(extractListEntries({ success: false, message: 'error' })).toEqual([])
    expect(extractListEntries({ data: null })).toEqual([])
    expect(extractListEntries({ data: { data: 'nope' } })).toEqual([])
    expect(extractListEntries(null)).toEqual([])
    expect(extractListEntries('x')).toEqual([])
  })

  test('empty-string doub_id skipped (never a matchable key)', () => {
    const payload = {
      data: {
        data: [item(), item({ doub_id: '', image: 'x.png' }), item({ doub_id: '   ', image: 'y.png' })],
      },
    }
    expect(extractListEntries(payload)).toHaveLength(1)
  })

  test('huge list is capped (hostile payloads cannot bloat memory/IDB)', () => {
    const big = {
      data: {
        data: Array.from({ length: 5000 }, (_, i) => item({ id: i, doub_id: String(36508122 + i), image: `img-${i}.png` })),
      },
    }
    expect(extractListEntries(big).length).toBeLessThanOrEqual(2000)
  })
})

test.describe('getListApiUrl', () => {
  test('builds URL with sb/page/app_id/identity', () => {
    const url = getListApiUrl('瑞克和莫蒂', '2')
    expect(url).toContain('/prod/api/v1/getVideoList')
    const u = new URL(url)
    expect(u.searchParams.get('sb')).toBe('瑞克和莫蒂')
    expect(u.searchParams.get('page')).toBe('2')
    expect(u.searchParams.get('app_id')).toBeTruthy()
    expect(u.searchParams.get('identity')).toBeTruthy()
  })
})
