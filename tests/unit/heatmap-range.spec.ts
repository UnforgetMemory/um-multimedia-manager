import { test, expect } from '@playwright/test'
import {
  maxWeeksForDays,
  minGridWidthPx,
  pickRangeDaysForWidth,
  clampTipX,
  CELL_MIN_PX,
  GRID_PAD_PX,
} from '@/utils/heatmap-range'

// Locks smart day-range tiers: largest range that fits without horizontal scroll.

test('maxWeeksForDays includes Sunday back-pad (+6 days)', () => {
  expect(maxWeeksForDays(90)).toBe(14) // ceil(96/7)
  expect(maxWeeksForDays(150)).toBe(23) // ceil(156/7)
  expect(maxWeeksForDays(365)).toBe(53) // ceil(371/7)
})

test('minGridWidthPx matches the grid min-width formula', () => {
  expect(minGridWidthPx(90)).toBe(14 * CELL_MIN_PX + GRID_PAD_PX)
  expect(minGridWidthPx(150)).toBe(23 * CELL_MIN_PX + GRID_PAD_PX)
  expect(minGridWidthPx(365)).toBe(53 * CELL_MIN_PX + GRID_PAD_PX)
})

test('picks 365 when the full year fits', () => {
  expect(pickRangeDaysForWidth(minGridWidthPx(365))).toBe('365')
  expect(pickRangeDaysForWidth(1200)).toBe('365')
})

test('picks 150 for mid widths', () => {
  expect(pickRangeDaysForWidth(minGridWidthPx(150))).toBe('150')
  expect(pickRangeDaysForWidth(minGridWidthPx(365) - 1)).toBe('150')
})

test('picks 90 for narrow containers and non-positive widths', () => {
  expect(pickRangeDaysForWidth(minGridWidthPx(90))).toBe('90')
  expect(pickRangeDaysForWidth(minGridWidthPx(150) - 1)).toBe('90')
  expect(pickRangeDaysForWidth(0)).toBe('90')
  expect(pickRangeDaysForWidth(-10)).toBe('90')
})

test('clampTipX keeps the bubble inside the viewport on edge cells', () => {
  // center stays put when there is room
  expect(clampTipX(200, 120, 400)).toBe(200)
  // left edge: pull right so left side is not clipped
  expect(clampTipX(20, 120, 400)).toBe(68) // half 60 + margin 8
  // right edge: pull left so right side is not clipped
  expect(clampTipX(380, 120, 400)).toBe(332) // 400 - 60 - 8
  // tip wider than viewport → pin to the margin-safe band
  expect(clampTipX(50, 500, 200)).toBe(100)
})
