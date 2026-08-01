import { Rating } from '@/domain/record/Rating'

/**
 * Douban rating-scale adapters (5-star ↔ 10-scale).
 *
 * Domain convention: StoreRecord.rating is stored on a 0–10 scale
 * (Rating.MAX = 10, 0.5 steps). Douban's page DOM/API exposes user
 * ratings on a 1–5 star scale (0.5 steps). All conversions must go
 * through this module to avoid the mixed-scale bug where the UI shows
 * a 10-scale value while the raw Douban stars are stored as-is.
 */

/**
 * Convert a stored 0–10 rating to Douban's 1–5 star count (UI seed).
 * 0 (unrated) is preserved as 0.
 */
export function rating10ToDoubanStars(rating10: number): number {
  if (!rating10 || rating10 <= 0) return 0
  return rating10 / 2
}

/**
 * Convert a Douban 1–5 star rating to the 0–10 scale (DB write).
 * 0 stars (unrated) is preserved as 0. Delegates to Rating.fromStars
 * so range/step validation lives in the domain layer (single source).
 */
export function doubanStarsToRating10(stars: number): number {
  if (!stars || stars <= 0) return 0
  return Rating.fromStars(stars)?.toNumber() ?? 0
}

/**
 * Auto-save guard: decides whether to write/update the local record
 * after the Douban API confirms a page status.
 *
 * Fixes the case where an already-watched record existed: a rating
 * change on the page must still update the local record (previously
 * gated on "no local record", dropping rating sync for watched items).
 *
 * - No local record → must write.
 * - Local record with a different status → must update.
 * - Local record, same status, but the page shows a new rating → must update.
 * - Everything identical → skip.
 */
export function shouldWriteRecord(opts: {
  hasLocal: boolean
  localStatus: number | undefined
  localRating: number | undefined
  newStatus: number
  newRating10: number
}): boolean {
  if (!opts.hasLocal) return true
  const statusChanged = opts.localStatus !== opts.newStatus
  // A page rating of 0 (unrated) must never overwrite an existing rating;
  // only compare when the page actually provides a new rating.
  const ratingChanged =
    opts.newRating10 > 0 &&
    Math.abs((opts.localRating || 0) - opts.newRating10) > 0.01
  return statusChanged || ratingChanged
}
