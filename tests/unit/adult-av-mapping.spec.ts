import { test, expect } from '@playwright/test';
import { matchesBaseId, normalizeWatchedIds } from '@/provider/adult-av/models';
import { detectPlatform } from '@/provider/adult-av/auto-detect';

/**
 * Adult-AV pure seams — the rules the provider split pulled out of the
 * message-RPC transport (matchesBaseId / normalizeWatchedIds, now used by
 * AdultAvStore) and the pure detection decision behind autoDetectPlatform.
 */

test.describe('matchesBaseId', () => {
  test('suffix variants resolve to the base id', () => {
    expect(matchesBaseId('YAG-1233-UC', 'YAG-1233')).toBe(true);
    expect(matchesBaseId('YAG-1233-CU', 'YAG-1233')).toBe(true);
    expect(matchesBaseId('YAG-1233-U', 'YAG-1233')).toBe(true);
    expect(matchesBaseId('YAG-1233-C', 'YAG-1233')).toBe(true);
  });

  test('exact id match also passes', () => {
    expect(matchesBaseId('YAG-1233', 'YAG-1233')).toBe(true);
    expect(matchesBaseId('YAG-1233-UC', 'YAG-1233-UC')).toBe(true);
  });

  test('base id is uppercased and trimmed like the old inline rule', () => {
    expect(matchesBaseId('YAG-1233-UC', ' yag-1233 ')).toBe(true);
  });

  test('different codes do not match', () => {
    expect(matchesBaseId('ABC-9999', 'YAG-1233')).toBe(false);
  });
});

test.describe('normalizeWatchedIds', () => {
  test('uppercases entries and dedupes case variants', () => {
    const set = normalizeWatchedIds(['yag-1233', 'YAG-1233', 'ABC-1']);
    expect(set).toEqual(new Set(['YAG-1233', 'ABC-1']));
  });

  test('empty list yields an empty set', () => {
    expect(normalizeWatchedIds([]).size).toBe(0);
  });
});

test.describe('detectPlatform (pure decision)', () => {
  test('douban URLs map to domain-specific results', () => {
    expect(detectPlatform('https://movie.douban.com/subject/1/', 'imdb')).toEqual({
      platform: 'douban',
      domain: 'movie',
    });
    expect(detectPlatform('https://music.douban.com/subject/1/', 'imdb')).toEqual({
      platform: 'douban',
      domain: 'music',
    });
    expect(detectPlatform('https://book.douban.com/subject/1/', 'imdb')).toEqual({
      platform: 'douban',
      domain: 'book',
    });
  });

  test('imdb accepts both URLs and bare tt ids', () => {
    expect(detectPlatform('https://www.imdb.com/title/tt0111161/', 'douban')).toEqual({
      platform: 'imdb',
      domain: 'movie',
    });
    expect(detectPlatform('TT0111161', 'douban')).toEqual({ platform: 'imdb', domain: 'movie' });
  });

  test('neodb/tmdb split tv vs movie (neodb also maps album → music)', () => {
    expect(detectPlatform('https://neodb.social/tv/episode/x', 'douban')).toEqual({
      platform: 'neodb',
      domain: 'tv',
    });
    expect(detectPlatform('https://neodb.social/album/x', 'douban')).toEqual({
      platform: 'neodb',
      domain: 'music',
    });
    expect(detectPlatform('https://neodb.social/movie/x', 'douban')).toEqual({
      platform: 'neodb',
      domain: 'movie',
    });
    expect(detectPlatform('https://www.themoviedb.org/tv/1', 'douban')).toEqual({
      platform: 'tmdb',
      domain: 'tv',
    });
    expect(detectPlatform('https://www.themoviedb.org/movie/1', 'douban')).toEqual({
      platform: 'tmdb',
      domain: 'movie',
    });
  });

  test('bilibili and youtube accept URLs and bare video ids', () => {
    expect(detectPlatform('https://www.bilibili.com/video/BV1xx/', 'douban')).toEqual({
      platform: 'bilibili',
      domain: 'video',
    });
    expect(detectPlatform('BV1xx4y1z7pK', 'douban')).toEqual({
      platform: 'bilibili',
      domain: 'video',
    });
    expect(detectPlatform('https://youtu.be/dQw4w9WgXcQ', 'douban')).toEqual({
      platform: 'youtube',
      domain: 'video',
    });
  });

  test('bangumi domains require a /subject/ path', () => {
    expect(detectPlatform('https://bgm.tv/subject/1', 'douban')).toEqual({
      platform: 'bangumi',
      domain: 'tv',
    });
    expect(detectPlatform('https://chii.in/', 'douban')).toBeNull();
  });

  test('jav_id only detects when jav_ids is already the current platform', () => {
    expect(detectPlatform('FC2-PPV-1234567', 'jav_ids')).toEqual({ platform: 'jav_ids' });
    expect(detectPlatform('FC2-PPV-1234567', 'douban')).toBeNull();
  });

  test('plain unknown ids yield no detection', () => {
    expect(detectPlatform('12345', 'douban')).toBeNull();
  });
});
