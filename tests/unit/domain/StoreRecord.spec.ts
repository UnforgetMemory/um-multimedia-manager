import { test, expect } from '@playwright/test'
import { StoreRecord } from '@/domain/record/StoreRecord'
import { Status } from '@/domain/record/Status'
import { Rating } from '@/domain/record/Rating'

test.describe('StoreRecord aggregate', () => {
  test('fresh creates a record with NONE status and unrated', () => {
    const r = StoreRecord.fresh('https://movie.douban.com/subject/1292052/')
    expect(r.url).toBe('https://movie.douban.com/subject/1292052/')
    expect(r.status.toNumber()).toBe(0)
    expect(r.rating.isUnrated).toBe(true)
    expect(r.comment).toBeUndefined()
    expect(r.linkedIds).toEqual({})
  })

  test('fresh with linkedIds', () => {
    const r = StoreRecord.fresh('https://imdb.com/title/tt1375666/', { douban: 'movie::1292052' })
    expect(r.linkedIds).toEqual({ douban: 'movie::1292052' })
  })

  test('markAsWatched sets status to DONE', () => {
    const r = StoreRecord.fresh('https://example.com/')
    const watched = r.markAsWatched()
    expect(watched.status.isDone).toBe(true)
    expect(r.status.isNone).toBe(true) // original unchanged
  })

  test('markAsWishlisted sets status to WISHLIST', () => {
    const r = StoreRecord.fresh('https://example.com/')
    const wishlisted = r.markAsWishlisted()
    expect(wishlisted.status.isWishlist).toBe(true)
  })

  test('clearStatus resets to NONE', () => {
    const r = StoreRecord.fresh('https://example.com/').markAsWatched()
    const cleared = r.clearStatus()
    expect(cleared.status.isNone).toBe(true)
  })

  test('immutability: markAsWatched creates new instance', () => {
    const original = StoreRecord.fresh('https://example.com/')
    const watched = original.markAsWatched()
    expect(original).not.toBe(watched)
    expect(original.status.toNumber()).toBe(0)
    expect(watched.status.toNumber()).toBe(2)
  })

  test('toSnapshot produces serializable plain object', () => {
    const r = StoreRecord.fresh('https://example.com/', { imdb: 'movie::tt1375666' })
    const snapshot = r.toSnapshot()
    expect(snapshot.url).toBe('https://example.com/')
    expect(snapshot.status).toBe(0)
    expect(snapshot.rating).toBe(0)
    expect(snapshot.linkedIds).toEqual({ imdb: 'movie::tt1375666' })
    // No class-specific methods
    expect(typeof (snapshot as any).markAsWatched).toBe('undefined')
  })

  test('fromSnapshot reconstructs domain object', () => {
    const snapshot = {
      url: 'https://movie.douban.com/subject/1292052/',
      status: 2,
      rating: 7,
      comment: 'Great movie',
      updatedAt: '2026-07-19T00:00:00.000Z',
      linkedIds: { imdb: 'movie::tt1375666' },
      recordVersion: 3,
    }
    const r = StoreRecord.fromSnapshot(snapshot as any)
    expect(r.url).toBe(snapshot.url)
    expect(r.status.toNumber()).toBe(2)
    expect(r.rating.toNumber()).toBe(7)
    expect(r.comment).toBe('Great movie')
    expect(r.linkedIds).toEqual({ imdb: 'movie::tt1375666' })
    expect(r.recordVersion).toBe(3)
  })

  test('fromSnapshot handles missing optional fields', () => {
    const snapshot = {
      url: 'https://example.com/',
      status: 0,
      rating: 0,
      updatedAt: '2026-07-19T00:00:00.000Z',
      linkedIds: {},
    }
    const r = StoreRecord.fromSnapshot(snapshot as any)
    expect(r.comment).toBeUndefined()
    expect(r.schemaVersion).toBeUndefined()
    expect(r.recordVersion).toBeUndefined()
  })

  test('isWatched returns true only for status DONE', () => {
    const none = StoreRecord.fresh('https://example.com/')
    expect(none.isWatched).toBe(false)
    expect(none.markAsWatched().isWatched).toBe(true)
    expect(none.markAsWishlisted().isWatched).toBe(false)
  })

  test('isRated delegates to Rating', () => {
    const r = StoreRecord.fresh('https://example.com/')
    expect(r.isRated).toBe(false)
  })
})