/**
 * Dev-build manifest-version helpers.
 *
 * Extracted from wxt.config.ts so the leading-zero rule can be unit-tested.
 * Chrome's manifest `version` is 1-4 dot-separated integers (each 0-65535),
 * and non-zero integers must NOT start with a leading zero ("032" is invalid).
 * The dev build appends a 4th segment carrying the build time-of-day, so it
 * must be emitted numerically ("905", not "0905") — a zero-padded hour would
 * otherwise produce an invalid version for builds between 00:00 and 09:59.
 */

/**
 * 4th version segment for dev builds: HHMM as an unpadded integer (0-2359).
 * `new Date(2026, 7, 19, 9, 5)` → "905"; `new Date(2026, 7, 19, 0, 0)` → "0".
 */
export function devVersionSegment(now: Date): string {
  return String(now.getHours() * 100 + now.getMinutes())
}