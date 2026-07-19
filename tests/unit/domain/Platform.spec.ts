import { test, expect } from '@playwright/test'
import { Platform } from '@/domain/platform/Platform'

test.describe('Platform value object', () => {
  test('creates Platform from known identifier', () => {
    expect(Platform.fromString('douban')?.id).toBe('douban')
    expect(Platform.fromString('imdb')?.id).toBe('imdb')
    expect(Platform.fromString('neodb')?.id).toBe('neodb')
    expect(Platform.fromString('tmdb')?.id).toBe('tmdb')
  })

  test('normalizes to lowercase', () => {
    expect(Platform.fromString('Douban')?.id).toBe('douban')
    expect(Platform.fromString('IMDB')?.id).toBe('imdb')
  })

  test('returns null for empty string', () => {
    expect(Platform.fromString('')).toBeNull()
    expect(Platform.fromString('  ')).toBeNull()
  })

  test('isKnown returns true for platforms in KNOWN list', () => {
    expect(Platform.fromString('douban')!.isKnown).toBe(true)
    expect(Platform.fromString('bilibili')!.isKnown).toBe(true)
    expect(Platform.fromString('youtube')!.isKnown).toBe(true)
  })

  test('displayName has correct capitalization', () => {
    expect(Platform.fromString('douban')!.displayName).toBe('Douban')
    expect(Platform.fromString('imdb')!.displayName).toBe('IMDb')
    expect(Platform.fromString('tmdb')!.displayName).toBe('TMDB')
    expect(Platform.fromString('neodb')!.displayName).toBe('NeoDB')
    expect(Platform.fromString('bilibili')!.displayName).toBe('Bilibili')
    expect(Platform.fromString('youtube')!.displayName).toBe('Youtube')
  })

  test('storeName follows pattern', () => {
    expect(Platform.fromString('douban')!.storeName).toBe('douban_records')
    expect(Platform.fromString('imdb')!.storeName).toBe('imdb_records')
  })

  test('equality', () => {
    const a = Platform.fromString('douban')!
    const b = Platform.fromString('douban')!
    const c = Platform.fromString('imdb')!
    expect(a.equals(b)).toBe(true)
    expect(a.equals(c)).toBe(false)
  })

  test('require returns Platform for known identifier', () => {
    expect(Platform.require('douban').id).toBe('douban')
  })

  test('require throws for empty string', () => {
    expect(() => Platform.require('')).toThrow()
  })

  test('named constants are frozen singletons', () => {
    expect(Platform.DOUBAN.id).toBe('douban')
    expect(Platform.IMDB.id).toBe('imdb')
    expect(Platform.NEODB.id).toBe('neodb')
    expect(Platform.TMDB.id).toBe('tmdb')
    expect(Platform.BILIBILI.id).toBe('bilibili')
    expect(Platform.YOUTUBE.id).toBe('youtube')
  })
})