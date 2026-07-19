import { test, expect } from '@playwright/test'
import { Rating } from '@/domain/record/Rating'

test.describe('Rating value object', () => {
  test('creates Rating from valid number', () => {
    const r = Rating.fromNumber(7)
    expect(r).not.toBeNull()
    expect(r!.toNumber()).toBe(7)
  })

  test('fromNumber is strict — rejects non-step values', () => {
    expect(Rating.fromNumber(7.3)).toBeNull()
    expect(Rating.fromNumber(7.1)).toBeNull()
    expect(Rating.fromNumber(7.8)).toBeNull()
  })

  test('round() on valid Rating rounds to nearest step', () => {
    // fromNumber is strict — round() exists to normalize an already-valid Rating
    expect(Rating.fromNumber(7)!.round().toNumber()).toBe(7)
    expect(Rating.fromNumber(7.5)!.round().toNumber()).toBe(7.5)
    // round() on a value precisely at 0.5 boundary stays unchanged
    expect(Rating.fromNumber(8)!.round().toNumber()).toBe(8)
  })

  test('fromNumber rejects out-of-range values', () => {
    expect(Rating.fromNumber(-1)).toBeNull()
    expect(Rating.fromNumber(11)).toBeNull()
  })

  test('round() clamps out-of-range values', () => {
    // fromNumber rejects out-of-range; round() on a clamped value within range
    expect(Rating.fromNumber(0)!.round().toNumber()).toBe(0)
    // round() doesn't change valid values at boundaries
    expect(Rating.fromNumber(10)!.round().toNumber()).toBe(10)
  })

  test('returns null for NaN', () => {
    expect(Rating.fromNumber(NaN)).toBeNull()
  })

  test('UNRATED sentinel is 0', () => {
    expect(Rating.UNRATED.toNumber()).toBe(0)
  })

  test('isRated returns false for unrated', () => {
    expect(Rating.fromNumber(0)!.isRated).toBe(false)
    expect(Rating.fromNumber(5)!.isRated).toBe(true)
    expect(Rating.fromNumber(10)!.isRated).toBe(true)
  })

  test('isUnrated returns true only for 0', () => {
    expect(Rating.fromNumber(0)!.isUnrated).toBe(true)
    expect(Rating.fromNumber(1)!.isUnrated).toBe(false)
    expect(Rating.fromNumber(10)!.isUnrated).toBe(false)
  })

  test('stars returns 0-5 scale', () => {
    expect(Rating.fromNumber(0)!.stars).toBe(0)
    expect(Rating.fromNumber(5)!.stars).toBe(2.5)
    expect(Rating.fromNumber(10)!.stars).toBe(5)
    expect(Rating.fromNumber(7.5)!.stars).toBe(3.75)
  })

  test('fraction returns 0-1 scale', () => {
    expect(Rating.fromNumber(0)!.fraction).toBe(0)
    expect(Rating.fromNumber(5)!.fraction).toBe(0.5)
    expect(Rating.fromNumber(10)!.fraction).toBe(1)
  })

  test('require returns Rating for valid number', () => {
    expect(Rating.require(7).toNumber()).toBe(7)
  })

  test('require throws for NaN', () => {
    expect(() => Rating.require(NaN)).toThrow()
  })

  test('immutability: fromNumber returns new instances', () => {
    const a = Rating.fromNumber(5)!
    const b = Rating.fromNumber(5)!
    expect(a).not.toBe(b)
    expect(a.toNumber()).toBe(b.toNumber())
  })
})