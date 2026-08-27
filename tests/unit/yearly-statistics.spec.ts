import { test, expect } from '@playwright/test'
import { computeYearlyStats } from '@/domain/record/statistics'

// Locks computeYearlyStats contract: starts at lastYear, gap years zero-filled, delta vs y-1, clock injected.

const NOW = new Date('2026-08-26T12:00:00Z') // getFullYear() === 2026 → lastYear 2025
const ts = (y: number, m = 6, d = 15) => new Date(Date.UTC(y, m - 1, d)).toISOString()

test('starts at last year and excludes the current year', () => {
  const r = computeYearlyStats([ts(2026, 8, 1), ts(2025, 5, 1), ts(2024, 5, 1)], NOW)
  expect(r.lastYear).toBe(2025)
  expect(r.rows.map(x => x.year)).toEqual([2025, 2024])
  expect(r.rows[0].count).toBe(1) // 2026 record excluded
})

test('gap years are filled with zero and delta compares y−1', () => {
  // data only in 2025 and 2022 → 2024/2023 must exist as 0 rows
  const r = computeYearlyStats([ts(2025), ts(2022)], NOW)
  expect(r.rows.map(x => [x.year, x.count])).toEqual([
    [2025, 1],
    [2024, 0],
    [2023, 0],
    [2022, 1],
  ])
  expect(r.rows[0].delta).toBe(1) // 2025 vs 2024(0)
  expect(r.rows[1].delta).toBe(0) // 2024 vs 2023(0)
  expect(r.rows[3].delta).toBe(1) // 2022 vs 2021(0)
})

test('multiple records in one year accumulate', () => {
  const r = computeYearlyStats([ts(2025), ts(2025), ts(2025), ts(2024)], NOW)
  expect(r.rows[0].count).toBe(3)
  expect(r.rows[0].delta).toBe(2)
  expect(r.maxCount).toBe(3)
})

test('pct is relative to the peak year', () => {
  const r = computeYearlyStats([ts(2025), ts(2025), ts(2025), ts(2025), ts(2024), ts(2024)], NOW)
  expect(r.rows[0].pct).toBe(100)
  expect(r.rows[1].pct).toBe(50)
})

test('no data at or before last year → empty rows', () => {
  const r = computeYearlyStats([ts(2026, 8, 1)], NOW)
  expect(r.rows).toEqual([])
  expect(r.maxCount).toBe(0)
})

test('invalid timestamps are skipped', () => {
  const r = computeYearlyStats(['not-a-date', undefined, ts(2025)], NOW)
  expect(r.rows.map(x => x.count)).toEqual([1])
})
