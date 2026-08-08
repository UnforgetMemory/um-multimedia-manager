import { test, expect } from '@playwright/test'
import { statusLabelKey } from '@/entrypoints/content/utils/status-label-key'

/**
 * statusLabelKey — status label key selector for legacy content scripts
 * (2026-08-08). Mirrors the bangumi-list-extract.spec style: one pure function,
 * per-case tests, zero DOM.
 *
 * Locked so the shared implementation (extracted from createStatusChip's k()
 * and bangumiListMarkerSpec's labelKey()) keeps the media-type → key-suffix
 * mapping stable: music→_music, book→_book, game→_game, everything else→base.
 */

test.describe('statusLabelKey', () => {
  test('music → suffixed _music key', () => {
    expect(statusLabelKey('music', 'done', 'status.done')).toBe('status.done_music')
  })

  test('book → suffixed _book key', () => {
    expect(statusLabelKey('book', 'done', 'status.done')).toBe('status.done_book')
  })

  test('game → suffixed _game key', () => {
    expect(statusLabelKey('game', 'done', 'status.done')).toBe('status.done_game')
  })

  test('movie → base key unchanged', () => {
    expect(statusLabelKey('movie', 'done', 'status.done')).toBe('status.done')
  })

  test('tv → base key unchanged', () => {
    expect(statusLabelKey('tv', 'wish', 'status.wish')).toBe('status.wish')
  })

  test('anime → base key unchanged', () => {
    expect(statusLabelKey('anime', 'doing', 'status.doing')).toBe('status.doing')
  })

  test('unknown media type → base key unchanged', () => {
    expect(statusLabelKey('unknown', 'none', 'status.none')).toBe('status.none')
  })

  test('empty media type → base key unchanged', () => {
    expect(statusLabelKey('', 'none', 'status.none')).toBe('status.none')
  })

  test('suffix is passed through (e.g. doing → status.doing_music)', () => {
    expect(statusLabelKey('music', 'doing', 'status.doing')).toBe('status.doing_music')
  })

  test('base is passed through verbatim for non-special types', () => {
    expect(statusLabelKey('movie', 'done', 'status.done')).toBe('status.done')
  })
})
