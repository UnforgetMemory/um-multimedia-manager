import { test, expect } from '@playwright/test'
import { Identity } from '@/domain/identity/Identity'

/**
 * Identity.fromUrl / canonicalizeUrl / buildCanonicalUrl / storeKey
 * characterization lock (D3, 2026-08-07).
 *
 * The 400L URL parser had no dedicated spec while every other domain module
 * (MediaType/Platform/Rating/Status/StoreRecord) is locked — this closes the
 * gap before any refactor may touch it.
 */

test.describe('Identity.fromUrl — platform parsing', () => {
  test('Douban movie', () => {
    const id = Identity.fromUrl('https://movie.douban.com/subject/1292052/')
    expect(id).not.toBeNull()
    expect(id!.platform.id).toBe('douban')
    expect(id!.type.id).toBe('movie')
    expect(id!.providerId).toBe('1292052')
  })

  test('Douban music', () => {
    const id = Identity.fromUrl('https://music.douban.com/subject/26580617/')
    expect(id!.platform.id).toBe('douban')
    expect(id!.type.id).toBe('music')
    expect(id!.providerId).toBe('26580617')
  })

  test('Douban book', () => {
    const id = Identity.fromUrl('https://book.douban.com/subject/25862578/')
    expect(id!.platform.id).toBe('douban')
    expect(id!.type.id).toBe('book')
    expect(id!.providerId).toBe('25862578')
  })

  test('Douban game (www host)', () => {
    const id = Identity.fromUrl('https://www.douban.com/game/26938848/')
    expect(id!.platform.id).toBe('douban')
    expect(id!.type.id).toBe('game')
    expect(id!.providerId).toBe('26938848')
  })

  test('Douban personage → movie', () => {
    const id = Identity.fromUrl('https://www.douban.com/personage/27263590/')
    expect(id!.platform.id).toBe('douban')
    expect(id!.type.id).toBe('movie')
    expect(id!.providerId).toBe('27263590')
  })

  test('IMDb title (normalizes tt id to lowercase)', () => {
    const id = Identity.fromUrl('https://www.imdb.com/title/TT1375666/')
    expect(id!.platform.id).toBe('imdb')
    expect(id!.type.id).toBe('movie')
    expect(id!.providerId).toBe('tt1375666')
  })

  test('NeoDB movie', () => {
    const id = Identity.fromUrl('https://neodb.social/movie/6BK0SUJLFcR0sOCeA1F6aM/')
    expect(id!.platform.id).toBe('neodb')
    expect(id!.type.id).toBe('movie')
    expect(id!.providerId).toBe('6BK0SUJLFcR0sOCeA1F6aM')
  })

  test('NeoDB tv show path → show: prefix', () => {
    const id = Identity.fromUrl('https://neodb.social/tv/6BK0SUJLFcR0sOCeA1F6aM/')
    expect(id!.platform.id).toBe('neodb')
    expect(id!.type.id).toBe('tv')
    expect(id!.providerId).toBe('show:6BK0SUJLFcR0sOCeA1F6aM')
  })

  test('NeoDB tv nested path (show/…) → path: prefix', () => {
    const id = Identity.fromUrl('https://neodb.social/tv/show/6BK0SUJLFcR0sOCeA1F6aM/')
    expect(id!.providerId).toBe('path:show/6BK0SUJLFcR0sOCeA1F6aM')
  })

  test('NeoDB album → music', () => {
    const id = Identity.fromUrl('https://neodb.social/album/xJj5qA0sYEqVKcZKpC3B9a/')
    expect(id!.platform.id).toBe('neodb')
    expect(id!.type.id).toBe('music')
  })

  test('NeoDB book', () => {
    const id = Identity.fromUrl('https://neodb.social/book/AbC123xyz/')
    expect(id!.platform.id).toBe('neodb')
    expect(id!.type.id).toBe('book')
  })

  test('TMDB movie (with slug suffix)', () => {
    const id = Identity.fromUrl('https://www.themoviedb.org/movie/550-fight-club/')
    expect(id!.platform.id).toBe('tmdb')
    expect(id!.type.id).toBe('movie')
    expect(id!.providerId).toBe('550')
  })

  test('TMDB tv (with slug suffix) → show: prefix', () => {
    const id = Identity.fromUrl('https://www.themoviedb.org/tv/1399-game-of-thrones/')
    expect(id!.platform.id).toBe('tmdb')
    expect(id!.type.id).toBe('tv')
    expect(id!.providerId).toBe('show:1399')
  })

  test('Bilibili video', () => {
    const id = Identity.fromUrl('https://www.bilibili.com/video/BV1xx411c7mD/')
    expect(id!.platform.id).toBe('bilibili')
    expect(id!.type.id).toBe('movie')
    expect(id!.providerId).toBe('BV1xx411c7mD')
  })

  // Characterization: canonicalizeUrl strips the query string, which destroys the
  // ?v= video id — fromUrl cannot currently resolve YouTube watch URLs. Round-trip
  // (buildCanonicalUrl → fromUrl) is likewise broken for youtube. Known limitation.
  test('YouTube watch URL → null (query stripped by canonicalizeUrl, known limitation)', () => {
    expect(Identity.fromUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull()
  })

  test('Bangumi subject → tv default', () => {
    const id = Identity.fromUrl('https://bgm.tv/subject/12740')
    expect(id!.platform.id).toBe('bangumi')
    expect(id!.type.id).toBe('tv')
    expect(id!.providerId).toBe('12740')
  })

  test('Unknown host → null', () => {
    expect(Identity.fromUrl('https://example.com/foo/')).toBeNull()
  })

  test('Malformed URL → null (no throw)', () => {
    expect(Identity.fromUrl('not a url at all')).toBeNull()
  })
})

test.describe('Identity.canonicalizeUrl', () => {
  test('strips hash and query, ensures trailing slash', () => {
    expect(Identity.canonicalizeUrl('https://movie.douban.com/subject/1292052/?from=tag#top'))
      .toBe('https://movie.douban.com/subject/1292052/')
  })

  test('collapses duplicate slashes', () => {
    expect(Identity.canonicalizeUrl('https://movie.douban.com//subject//1292052/'))
      .toBe('https://movie.douban.com/subject/1292052/')
  })

  test('empty input → empty string', () => {
    expect(Identity.canonicalizeUrl('')).toBe('')
  })

  test('protocol-less input gets https:// fallback', () => {
    expect(Identity.canonicalizeUrl('movie.douban.com/subject/1292052/'))
      .toBe('https://movie.douban.com/subject/1292052/')
  })
})

test.describe('Identity.buildCanonicalUrl', () => {
  test('douban movie', () => {
    const id = Identity.create('douban', 'movie', '1292052')
    expect(id!.url).toBe('https://movie.douban.com/subject/1292052/')
  })

  test('douban game', () => {
    const id = Identity.create('douban', 'game', '26938848')
    expect(id!.url).toBe('https://www.douban.com/game/26938848/')
  })

  test('imdb', () => {
    const id = Identity.create('imdb', 'movie', 'tt1375666')
    expect(id!.url).toBe('https://www.imdb.com/title/tt1375666/')
  })

  test('neodb tv show round-trips the show: prefix', () => {
    const id = Identity.create('neodb', 'tv', 'show:AbC123')
    expect(id!.url).toBe('https://neodb.social/tv/AbC123/')
  })

  test('bangumi', () => {
    const id = Identity.create('bangumi', 'tv', '12740')
    expect(id!.url).toBe('https://bgm.tv/subject/12740/')
  })
})

test.describe('Identity.storeKey / equality', () => {
  test('storeKey derives type::providerId', () => {
    const id = Identity.fromUrl('https://movie.douban.com/subject/1292052/')
    expect(id!.storeKey).toBe('movie::1292052')
  })

  test('equals matches same platform/type/id regardless of URL shape', () => {
    const a = Identity.fromUrl('https://movie.douban.com/subject/1292052/')
    const b = Identity.fromUrl('https://movie.douban.com/subject/1292052/?ref=nav')
    expect(a!.equals(b!)).toBe(true)
  })

  // Characterization: isLinkedTo = same providerId + different platform.
  // NOTE: production has ZERO callers (dead method candidate — 2026-08-07 D3 audit).
  test('isLinkedTo matches on providerId across platforms', () => {
    const douban = Identity.create('douban', 'movie', 'abc123')!
    const neodb = Identity.create('neodb', 'movie', 'abc123')!
    expect(douban.isLinkedTo(neodb)).toBe(true)
    // Different providerId on the SAME platform → not linked
    const doubanBook = Identity.create('douban', 'book', 'other')!
    expect(douban.isLinkedTo(doubanBook)).toBe(false)
    // Same providerId on the same platform → not linked
    expect(douban.isLinkedTo(douban)).toBe(false)
  })
})
