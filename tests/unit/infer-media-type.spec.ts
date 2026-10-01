import { test, expect } from '@playwright/test';
import { inferMediaTypeFromUrl } from '@/scenario/douban/shared/url-detector';

test.describe('inferMediaTypeFromUrl', () => {
  test('hostname forms map to their media scope', () => {
    expect(inferMediaTypeFromUrl('https://movie.douban.com/subject/1234567/')).toBe('movie');
    expect(inferMediaTypeFromUrl('https://music.douban.com/subject/1234567/')).toBe('music');
    expect(inferMediaTypeFromUrl('https://book.douban.com/subject/1234567/')).toBe('book');
  });

  test('search path forms map to their media scope', () => {
    expect(
      inferMediaTypeFromUrl('https://search.douban.com/movie/subject_search?search_text=a'),
    ).toBe('movie');
    expect(
      inferMediaTypeFromUrl('https://search.douban.com/music/subject_search?search_text=a'),
    ).toBe('music');
    expect(
      inferMediaTypeFromUrl('https://search.douban.com/book/subject_search?search_text=a'),
    ).toBe('book');
  });

  test('free-text query params cannot flip the scope', () => {
    expect(
      inferMediaTypeFromUrl(
        'https://search.douban.com/movie/subject_search?search_text=music.douban.com',
      ),
    ).toBe('movie');
    expect(
      inferMediaTypeFromUrl('https://movie.douban.com/subject_search?search_text=book.douban.com'),
    ).toBe('movie');
  });

  test('non-douban or unparseable URLs default to movie', () => {
    expect(inferMediaTypeFromUrl('not-a-url')).toBe('movie');
    expect(inferMediaTypeFromUrl('https://www.imdb.com/title/tt123/')).toBe('movie');
  });

  test('host match is exact, not substring', () => {
    expect(inferMediaTypeFromUrl('https://music.douban.com.evil.example/subject/1/')).toBe('movie');
  });
});
