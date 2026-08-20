import { test, expect } from '@playwright/test'
import { devVersionSegment } from '@/utils/dev-version'

/**
 * Regression for the dev-build leading-zero bug (umreview).
 *
 * Chrome's manifest `version` is 1-4 dot-separated integers (each 0-65535);
 * non-zero integers must NOT start with a leading zero. The 4th dev segment
 * carries HHMM, so it must be emitted numerically — "905", not "0905".
 */
test.describe('devVersionSegment — no leading zero', () => {
  test('09:05 → "905" (zero-padded hour would be invalid)', () => {
    expect(devVersionSegment(new Date(2026, 7, 19, 9, 5))).toBe('905')
  })

  test('midnight → "0" (a bare zero integer is valid)', () => {
    expect(devVersionSegment(new Date(2026, 7, 19, 0, 0))).toBe('0')
  })

  test('00:05 → "5" (no "0005")', () => {
    expect(devVersionSegment(new Date(2026, 7, 19, 0, 5))).toBe('5')
  })

  test('13:05 → "1305"', () => {
    expect(devVersionSegment(new Date(2026, 7, 19, 13, 5))).toBe('1305')
  })

  test('23:59 → "2359" (max)', () => {
    expect(devVersionSegment(new Date(2026, 7, 19, 23, 59))).toBe('2359')
  })
})