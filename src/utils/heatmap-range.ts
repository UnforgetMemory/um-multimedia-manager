/**
 * Heatmap day-range selection by available container width.
 * Mirrors HeatmapCalendar grid sizing: cell floor 16px + label column 40px.
 */

/** Numeric day-window sizes offered by the heatmap range control. */
export type HeatmapRangeDays = 90 | 150 | 365
/** SegmentedControl option id (string form of HeatmapRangeDays). */
export type HeatmapRangeId = '90' | '150' | '365'

/** Minimum cell edge before the grid scrolls horizontally (px). */
export const CELL_MIN_PX = 16
/** Label column + side padding (8×2) + slack baked into grid min-width (px). */
export const GRID_PAD_PX = 40

/**
 * Max week columns a range can occupy.
 * Calendar construction back-pads to Sunday (up to +6 days) before the window.
 */
export function maxWeeksForDays(days: number): number {
  return Math.ceil((days + 6) / 7)
}

/** Smallest container width (px) that fits `days` without horizontal scroll. */
export function minGridWidthPx(days: HeatmapRangeDays): number {
  return maxWeeksForDays(days) * CELL_MIN_PX + GRID_PAD_PX
}

/** Largest tier that fits `width` without scroll; defaults to 90 when none fit. */
export function pickRangeDaysForWidth(width: number): HeatmapRangeId {
  const tiers: readonly HeatmapRangeDays[] = [365, 150, 90]
  for (const days of tiers) {
    if (width >= minGridWidthPx(days)) return String(days) as HeatmapRangeId
  }
  return '90'
}

/**
 * Clamp a centered tooltip anchor so the bubble stays inside the viewport.
 * Small screens otherwise clip date/count on the first and last week columns.
 */
export function clampTipX(centerX: number, tipWidth: number, viewportWidth: number, margin = 8): number {
  const half = Math.min(tipWidth, viewportWidth - margin * 2) / 2
  const min = half + margin
  const max = viewportWidth - half - margin
  return Math.max(min, Math.min(max, centerX))
}
