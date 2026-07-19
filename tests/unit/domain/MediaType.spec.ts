import { test, expect } from '@playwright/test'
import { MediaType } from '@/domain/platform/MediaType'

test.describe('MediaType value object', () => {
  test('creates from valid type string', () => {
    expect(MediaType.fromString('movie')?.id).toBe('movie')
    expect(MediaType.fromString('tv')?.id).toBe('tv')
    expect(MediaType.fromString('music')?.id).toBe('music')
    expect(MediaType.fromString('book')?.id).toBe('book')
    expect(MediaType.fromString('game')?.id).toBe('game')
  })

  test('returns null for unknown type', () => {
    expect(MediaType.fromString('unknown')).toBeNull()
    expect(MediaType.fromString('')).toBeNull()
  })

  test('normalizes to lowercase', () => {
    expect(MediaType.fromString('Movie')?.id).toBe('movie')
    expect(MediaType.fromString('BOOK')?.id).toBe('book')
  })

  test('named constants', () => {
    expect(MediaType.MOVIE.id).toBe('movie')
    expect(MediaType.TV.id).toBe('tv')
    expect(MediaType.MUSIC.id).toBe('music')
    expect(MediaType.BOOK.id).toBe('book')
    expect(MediaType.GAME.id).toBe('game')
  })

  test('isVideo returns true for movie and tv', () => {
    expect(MediaType.MOVIE.isVideo).toBe(true)
    expect(MediaType.TV.isVideo).toBe(true)
    expect(MediaType.MUSIC.isVideo).toBe(false)
    expect(MediaType.BOOK.isVideo).toBe(false)
    expect(MediaType.GAME.isVideo).toBe(false)
  })

  test('isAudio returns true only for music', () => {
    expect(MediaType.MOVIE.isAudio).toBe(false)
    expect(MediaType.MUSIC.isAudio).toBe(true)
    expect(MediaType.BOOK.isAudio).toBe(false)
  })

  test('isReadable returns true only for book', () => {
    expect(MediaType.MOVIE.isReadable).toBe(false)
    expect(MediaType.MUSIC.isReadable).toBe(false)
    expect(MediaType.BOOK.isReadable).toBe(true)
  })

  test('require returns MediaType for valid type', () => {
    expect(MediaType.require('movie').id).toBe('movie')
  })

  test('require throws for invalid type', () => {
    expect(() => MediaType.require('invalid')).toThrow()
  })

  test('equality', () => {
    const a = MediaType.fromString('movie')!
    const b = MediaType.fromString('movie')!
    const c = MediaType.fromString('tv')!
    expect(a.equals(b)).toBe(true)
    expect(a.equals(c)).toBe(false)
  })

  test('label is human-readable', () => {
    expect(MediaType.MOVIE.label).toBe('Movie')
    expect(MediaType.MUSIC.label).toBe('Music')
    expect(MediaType.BOOK.label).toBe('Book')
  })
})