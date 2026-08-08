import { test, expect } from '@playwright/test'
import { normalizeAvId, extractBaseId } from '@/features/adult-av/models'

/**
 * adult-av key normalization (2026-08-08).
 *
 * normalizeAvId / extractBaseId are the canonical AV-ID normalizers shared by
 * javdb.ts, sehuatang.ts and the background adult-av handler. Previously only
 * one indirect assertion existed (in adult-av-batch.spec.ts) despite three
 * consumers — locked here directly so cross-site dedup keys stay stable.
 */

test.describe('normalizeAvId', () => {
  test('uppercases input', () => {
    expect(normalizeAvId('abc-123')).toBe('ABC-123')
  })

  test('trims surrounding whitespace', () => {
    expect(normalizeAvId('  ABC-123  ')).toBe('ABC-123')
  })

  test('collapses internal spaces into dashes', () => {
    expect(normalizeAvId('ABC 123')).toBe('ABC-123')
  })

  test('handles mixed-case with spaces', () => {
    expect(normalizeAvId('yag 1233')).toBe('YAG-1233')
  })

  test('preserves existing dashes', () => {
    expect(normalizeAvId('abc-def-123')).toBe('ABC-DEF-123')
  })

  test('empty-ish input is tolerated (no throw)', () => {
    expect(normalizeAvId('')).toBe('')
  })
})

test.describe('extractBaseId', () => {
  test('no suffix → unchanged', () => {
    expect(extractBaseId('YAG-1233')).toBe('YAG-1233')
  })

  test('-C (Chinese subtitle) suffix stripped', () => {
    expect(extractBaseId('YAG-1233-C')).toBe('YAG-1233')
  })

  test('-U (uncensored) suffix stripped', () => {
    expect(extractBaseId('YAG-1233-U')).toBe('YAG-1233')
  })

  test('-UC (uncensored + Chinese) suffix stripped', () => {
    expect(extractBaseId('YAG-1233-UC')).toBe('YAG-1233')
  })

  test('-CU variant suffix stripped', () => {
    expect(extractBaseId('YAG-1233-CU')).toBe('YAG-1233')
  })

  test('lowercase suffix stripped (case-insensitive)', () => {
    expect(extractBaseId('YAG-1233-uc')).toBe('YAG-1233')
  })

  test('suffix only stripped when terminal (mid-ID dash untouched)', () => {
    expect(extractBaseId('ABC-DEF-1')).toBe('ABC-DEF-1')
  })

  test('digit-suffix not stripped (-1 is a version, not -U/-C)', () => {
    expect(extractBaseId('ABC-123-1')).toBe('ABC-123-1')
  })
})
