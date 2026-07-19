import { test, expect } from '@playwright/test'
import { Status } from '@/domain/record/Status'

test.describe('Status value object', () => {
  test('creates Status from valid code', () => {
    expect(Status.fromCode(0)?.toNumber()).toBe(0)
    expect(Status.fromCode(1)?.toNumber()).toBe(1)
    expect(Status.fromCode(2)?.toNumber()).toBe(2)
    expect(Status.fromCode(3)?.toNumber()).toBe(3)
  })

  test('returns null for invalid code', () => {
    expect(Status.fromCode(-1)).toBeNull()
    expect(Status.fromCode(4)).toBeNull()
    expect(Status.fromCode(999)).toBeNull()
  })

  test('creates Status from valid string', () => {
    expect(Status.fromString('none')?.toNumber()).toBe(0)
    expect(Status.fromString('wishlist')?.toNumber()).toBe(1)
    expect(Status.fromString('done')?.toNumber()).toBe(2)
    expect(Status.fromString('doing')?.toNumber()).toBe(3)
  })

  test('handles legacy string aliases', () => {
    expect(Status.fromString('wish')?.toNumber()).toBe(1)
    expect(Status.fromString('wishlist')?.toNumber()).toBe(1)
    expect(Status.fromString('done')?.toNumber()).toBe(2)
    expect(Status.fromString('doing')?.toNumber()).toBe(3)
    expect(Status.fromString('none')?.toNumber()).toBe(0)
  })

  test('returns null for invalid string', () => {
    expect(Status.fromString('')).toBeNull()
    expect(Status.fromString('invalid')).toBeNull()
  })

  test('isDone returns true only for code 2', () => {
    expect(Status.fromCode(0)!.isDone).toBe(false)
    expect(Status.fromCode(1)!.isDone).toBe(false)
    expect(Status.fromCode(2)!.isDone).toBe(true)
    expect(Status.fromCode(3)!.isDone).toBe(false)
  })

  test('isWishlist returns true only for code 1', () => {
    expect(Status.fromCode(0)!.isWishlist).toBe(false)
    expect(Status.fromCode(1)!.isWishlist).toBe(true)
    expect(Status.fromCode(2)!.isWishlist).toBe(false)
    expect(Status.fromCode(3)!.isWishlist).toBe(false)
  })

  test('isActive returns true for done, wishlist, or doing', () => {
    expect(Status.fromCode(0)!.isActive).toBe(false)
    expect(Status.fromCode(1)!.isActive).toBe(true)
    expect(Status.fromCode(2)!.isActive).toBe(true)
    expect(Status.fromCode(3)!.isActive).toBe(true)
  })

  test('require returns Status for valid code', () => {
    expect(Status.require(0).toNumber()).toBe(0)
    expect(Status.require(2).toNumber()).toBe(2)
  })

  test('require throws for invalid code', () => {
    expect(() => Status.require(99)).toThrow()
  })

  test('toggleProgress cycles: none→done→wishlist→done→wishlist', () => {
    // Intentional: none toggles to done (skip wishlist for quick-action UX)
    expect(Status.fromCode(0)!.toggleProgress().toNumber()).toBe(2) // none → done
    expect(Status.fromCode(2)!.toggleProgress().toNumber()).toBe(1) // done → wishlist
    expect(Status.fromCode(1)!.toggleProgress().toNumber()).toBe(2) // wishlist → done
    expect(Status.fromCode(3)!.toggleProgress().toNumber()).toBe(3) // doing → doing (no-op)
  })

  test('immutability: toggleProgress returns new instance', () => {
    const original = Status.fromCode(0)!
    const toggled = original.toggleProgress()
    expect(original.toNumber()).toBe(0)
    expect(toggled.toNumber()).toBe(2)
    expect(original).not.toBe(toggled)
  })
})