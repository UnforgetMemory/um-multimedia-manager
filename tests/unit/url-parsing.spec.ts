import { test, expect } from '@playwright/test';
import { parseRatingInput, ParsedUrl } from '../utils/url-parser';

test.describe('URL Parsing - Douban', () => {
  test('should parse douban movie URL', () => {
    const result = parseRatingInput('https://movie.douban.com/subject/1234567/');
    expect(result).toEqual({
      domain: 'movie',
      provider: 'douban',
      providerId: '1234567',
      url: 'https://movie.douban.com/subject/1234567/',
    });
  });

  test('should parse douban book URL', () => {
    const result = parseRatingInput('https://book.douban.com/subject/9876543/');
    expect(result).toEqual({
      domain: 'movie', // 图书映射为 movie domain
      provider: 'douban',
      providerId: '9876543',
      url: 'https://book.douban.com/subject/9876543/',
    });
  });

  test('should parse douban music URL', () => {
    const result = parseRatingInput('https://music.douban.com/subject/1111111/');
    expect(result).toEqual({
      domain: 'music',
      provider: 'douban',
      providerId: '1111111',
      url: 'https://music.douban.com/subject/1111111/',
    });
  });

  test('should parse numeric ID with douban platform', () => {
    const result = parseRatingInput('1234567', 'douban');
    expect(result).toEqual({
      domain: 'movie',
      provider: 'douban',
      providerId: '1234567',
      url: 'https://movie.douban.com/subject/1234567/',
    });
  });
});

test.describe('URL Parsing - IMDb', () => {
  test('should parse IMDb URL', () => {
    const result = parseRatingInput('https://www.imdb.com/title/tt1234567/');
    expect(result).toEqual({
      domain: 'movie',
      provider: 'imdb',
      providerId: 'tt1234567',
      url: 'https://www.imdb.com/title/tt1234567/',
    });
  });

  test('should parse IMDb ID with tt prefix', () => {
    const result = parseRatingInput('tt1234567');
    expect(result).toEqual({
      domain: 'movie',
      provider: 'imdb',
      providerId: 'tt1234567',
      url: 'https://www.imdb.com/title/tt1234567/',
    });
  });

  test('should normalize IMDb ID to lowercase', () => {
    const result1 = parseRatingInput('TT1234567');
    const result2 = parseRatingInput('tt1234567');
    expect(result1?.providerId).toBe(result2?.providerId);
    expect(result1?.providerId).toBe('tt1234567');
  });

  test('should parse numeric ID as IMDb when platform is imdb', () => {
    const result = parseRatingInput('1234567', 'imdb');
    expect(result).toEqual({
      domain: 'movie',
      provider: 'imdb',
      providerId: '1234567',
      url: 'https://www.imdb.com/title/tt1234567/',
    });
  });
});

test.describe('URL Parsing - NeoDB', () => {
  test('should parse NeoDB movie URL', () => {
    const result = parseRatingInput('https://neodb.social/movie/abc123/');
    expect(result).toEqual({
      domain: 'movie',
      provider: 'neodb',
      providerId: 'abc123',
      url: 'https://neodb.social/movie/abc123/',
    });
  });

  test('should parse NeoDB TV URL', () => {
    const result = parseRatingInput('https://neodb.social/tv/show123/');
    expect(result).toEqual({
      domain: 'tv',
      provider: 'neodb',
      providerId: 'show123',
      url: 'https://neodb.social/tv/show123/',
    });
  });

  test('should parse NeoDB album URL', () => {
    const result = parseRatingInput('https://neodb.social/album/xyz789/');
    expect(result).toEqual({
      domain: 'music',
      provider: 'neodb',
      providerId: 'xyz789',
      url: 'https://neodb.social/album/xyz789/',
    });
  });

  test('should parse numeric ID as NeoDB when platform is neodb', () => {
    const result = parseRatingInput('123456', 'neodb');
    expect(result).toEqual({
      domain: 'movie',
      provider: 'neodb',
      providerId: '123456',
      url: 'https://neodb.social/movie/123456/',
    });
  });
});

test.describe('URL Parsing - TMDB', () => {
  test('should parse TMDB movie URL', () => {
    const result = parseRatingInput('https://www.themoviedb.org/movie/12345/');
    expect(result).toEqual({
      domain: 'movie',
      provider: 'tmdb',
      providerId: '12345',
      url: 'https://www.themoviedb.org/movie/12345/',
    });
  });

  test('should parse TMDB TV URL', () => {
    const result = parseRatingInput('https://www.themoviedb.org/tv/67890/');
    expect(result).toEqual({
      domain: 'tv',
      provider: 'tmdb',
      providerId: '67890',
      url: 'https://www.themoviedb.org/tv/67890/',
    });
  });

  test('should parse TMDB TV season URL (extract base ID)', () => {
    const result = parseRatingInput('https://www.themoviedb.org/tv/67890/season/1');
    expect(result?.providerId).toBe('67890');
    expect(result?.domain).toBe('tv');
  });

  test('should parse numeric ID as TMDB when platform is tmdb', () => {
    const result = parseRatingInput('12345', 'tmdb');
    expect(result).toEqual({
      domain: 'movie',
      provider: 'tmdb',
      providerId: '12345',
      url: 'https://www.themoviedb.org/movie/12345/',
    });
  });
});

test.describe('URL Parsing - Edge Cases', () => {
  test('should return null for empty input', () => {
    expect(parseRatingInput('')).toBeNull();
    expect(parseRatingInput('   ')).toBeNull();
  });

  test('should return null for invalid URL', () => {
    expect(parseRatingInput('https://invalid.com/page')).toBeNull();
  });

  test('should handle URLs without trailing slash', () => {
    const result = parseRatingInput('https://movie.douban.com/subject/1234567');
    expect(result?.providerId).toBe('1234567');
  });

  test('should trim whitespace from input', () => {
    const result = parseRatingInput('  https://movie.douban.com/subject/1234567/  ');
    expect(result?.providerId).toBe('1234567');
  });
});
