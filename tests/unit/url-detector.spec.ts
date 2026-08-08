import { test, expect } from '@playwright/test'
import { detectPageType } from '@/content/douban/shared/url-detector'

/**
 * detectPageType — unified Douban page-type detection (single source of truth).
 * (2026-08-08) Locks the 33-page-type classifier so the early.ts/main.ts entry
 * points keep agreeing on which overlay to mount. Sub-page patterns
 * (photos/trailer/video/celebrities) overlap the /subject/ detail regex, so
 * ORDER MATTERS — a reorder would misclassify those URLs as plain details.
 */

test.describe('detectPageType', () => {
  test.describe('sub-pages win over detail (ordering contract)', () => {
    test('photos page → photos, not detail', () => {
      expect(detectPageType('https://movie.douban.com/subject/1292052/photos')).toEqual({ type: 'photos' })
    })

    test('all_photos variant → photos', () => {
      expect(detectPageType('https://movie.douban.com/subject/1292052/all_photos')).toEqual({ type: 'photos' })
    })

    test('trailer page → trailer', () => {
      expect(detectPageType('https://movie.douban.com/subject/1292052/trailer')).toEqual({ type: 'trailer' })
    })

    test('video page → video', () => {
      expect(detectPageType('https://movie.douban.com/video/111')).toEqual({ type: 'video' })
    })

    test('celebrities page → celebrities', () => {
      expect(detectPageType('https://movie.douban.com/subject/1292052/celebrities')).toEqual({ type: 'celebrities' })
    })
  })

  test.describe('detail pages (mediaType inference)', () => {
    test('movie detail → movie', () => {
      expect(detectPageType('https://movie.douban.com/subject/1292052/')).toEqual({ type: 'detail', mediaType: 'movie' })
    })

    test('music detail → music', () => {
      expect(detectPageType('https://music.douban.com/subject/1001/')).toEqual({ type: 'detail', mediaType: 'music' })
    })

    test('book detail → book', () => {
      expect(detectPageType('https://book.douban.com/subject/1002/')).toEqual({ type: 'detail', mediaType: 'book' })
    })
  })

  test.describe('homepages', () => {
    test('movie homepage', () => {
      expect(detectPageType('https://movie.douban.com/')).toEqual({ type: 'homepage' })
    })

    test('movie homepage with query', () => {
      expect(detectPageType('https://movie.douban.com/?from=nav')).toEqual({ type: 'homepage' })
    })

    test('music homepage', () => {
      expect(detectPageType('https://music.douban.com/')).toEqual({ type: 'music-homepage' })
    })

    test('book homepage', () => {
      expect(detectPageType('https://book.douban.com/')).toEqual({ type: 'book-homepage' })
    })
  })

  test.describe('search pages (mediaType inference)', () => {
    test('movie search', () => {
      expect(detectPageType('https://search.douban.com/movie/subject_search?search_text=test')).toEqual({ type: 'search', mediaType: 'movie' })
    })

    test('music search', () => {
      expect(detectPageType('https://search.douban.com/music/subject_search?search_text=test')).toEqual({ type: 'search', mediaType: 'music' })
    })

    test('book search', () => {
      expect(detectPageType('https://search.douban.com/book/subject_search?search_text=test')).toEqual({ type: 'search', mediaType: 'book' })
    })
  })

  test.describe('profile pages', () => {
    test('user profile (www)', () => {
      expect(detectPageType('https://www.douban.com/people/user1/')).toEqual({ type: 'user-profile' })
    })

    test('movie profile', () => {
      expect(detectPageType('https://movie.douban.com/people/user1/')).toEqual({ type: 'movie-profile' })
    })

    test('music profile', () => {
      expect(detectPageType('https://music.douban.com/people/user1/')).toEqual({ type: 'music-profile' })
    })

    test('book profile', () => {
      expect(detectPageType('https://book.douban.com/people/user1/')).toEqual({ type: 'book-profile' })
    })
  })

  test.describe('user content pages', () => {
    test('user-media collect', () => {
      expect(detectPageType('https://movie.douban.com/people/user1/collect')).toEqual({ type: 'user-media', subType: 'collect' })
    })

    test('user-media wish', () => {
      expect(detectPageType('https://movie.douban.com/people/user1/wish')).toEqual({ type: 'user-media', subType: 'wish' })
    })

    test('user-media doing (fallback)', () => {
      expect(detectPageType('https://movie.douban.com/people/user1/do')).toEqual({ type: 'user-media', subType: 'doing' })
    })

    test('book-collect collect', () => {
      expect(detectPageType('https://book.douban.com/people/user1/collect')).toEqual({ type: 'book-collect', subType: 'collect' })
    })

    test('music-collect wish', () => {
      expect(detectPageType('https://music.douban.com/people/user1/wish')).toEqual({ type: 'music-collect', subType: 'wish' })
    })

    test('music-collect doing', () => {
      expect(detectPageType('https://music.douban.com/people/user1/do')).toEqual({ type: 'music-collect', subType: 'doing' })
    })

    test('user reviews', () => {
      expect(detectPageType('https://movie.douban.com/people/user1/reviews')).toEqual({ type: 'user-reviews' })
    })

    test('book user reviews', () => {
      expect(detectPageType('https://book.douban.com/people/user1/reviews')).toEqual({ type: 'book-reviews' })
    })

    test('user celebrities', () => {
      expect(detectPageType('https://movie.douban.com/people/user1/celebrities')).toEqual({ type: 'user-celebrities' })
    })

    test('book authors', () => {
      expect(detectPageType('https://book.douban.com/people/user1/authors')).toEqual({ type: 'book-authors' })
    })
  })

  test.describe('doulists', () => {
    test('doulist detail', () => {
      expect(detectPageType('https://www.douban.com/doulist/12345/')).toEqual({ type: 'doulist-detail' })
    })

    test('user doulists list', () => {
      expect(detectPageType('https://www.douban.com/people/user1/doulists')).toEqual({ type: 'doulists' })
    })
  })

  test.describe('music-specific pages', () => {
    test('albums', () => {
      expect(detectPageType('https://music.douban.com/albums/123')).toEqual({ type: 'albums' })
    })

    test('genre page', () => {
      expect(detectPageType('https://music.douban.com/artists/genre_page/5')).toEqual({ type: 'genre' })
    })

    test('artists overview', () => {
      expect(detectPageType('https://music.douban.com/artists/')).toEqual({ type: 'artists-overview' })
    })
  })

  test.describe('reviews', () => {
    test('movie review detail', () => {
      expect(detectPageType('https://movie.douban.com/review/12345/')).toEqual({ type: 'review-detail' })
    })

    test('book review detail', () => {
      expect(detectPageType('https://book.douban.com/review/12345/')).toEqual({ type: 'book-review-detail' })
    })
  })

  test.describe('games', () => {
    test('game detail', () => {
      expect(detectPageType('https://www.douban.com/game/12345/')).toEqual({ type: 'game-detail' })
    })

    test('game explore', () => {
      expect(detectPageType('https://www.douban.com/game/explore')).toEqual({ type: 'game-explore' })
    })

    test('game collect (action=wish)', () => {
      expect(detectPageType('https://www.douban.com/people/user1/games?action=wish')).toEqual({ type: 'game-collect', subType: 'wish' })
    })

    test('game collect (action=do)', () => {
      expect(detectPageType('https://www.douban.com/people/user1/games?action=do')).toEqual({ type: 'game-collect', subType: 'do' })
    })

    test('game collect (fallback)', () => {
      expect(detectPageType('https://www.douban.com/people/user1/games')).toEqual({ type: 'game-collect', subType: 'collect' })
    })
  })

  test.describe('misc pages', () => {
    test('personage', () => {
      expect(detectPageType('https://www.douban.com/personage/12345/')).toEqual({ type: 'personage' })
    })

    test('book series', () => {
      expect(detectPageType('https://book.douban.com/series/123')).toEqual({ type: 'series' })
    })
  })

  test.describe('unrecognized URLs', () => {
    test('unrelated host → null', () => {
      expect(detectPageType('https://example.com/')).toBeNull()
    })

    test('douban settings page → null (excluded surface)', () => {
      expect(detectPageType('https://www.douban.com/settings/')).toBeNull()
    })
  })
})
