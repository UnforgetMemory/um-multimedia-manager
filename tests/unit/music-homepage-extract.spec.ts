import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';
import { JSDOM } from 'jsdom';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractPopularArtists,
  extractNewAlbums,
  extractGenreTags,
} from '@/scenario/douban/pages/music-homepage/music-homepage-extract';

// Installs happen inside tests below; register this file's sandbox hooks at module scope.
initFileSandbox();

/**
 * music-homepage-extract behavior lock (music.douban.com/ overlay).
 *
 * Fixture tests/fixtures/douban/music-homepage.html reproduces the three
 * native sections: .popular-artists (artists / new-artists tabs), the
 * React-rendered [data-react-component="NewAlbums"] carousel and the
 * .tag-block genre table. Global document/window/location are installed
 * per test because the module reads the global DOM.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(HERE, '../fixtures/douban/music-homepage.html');

function mountFixture(url = 'https://music.douban.com/'): Document {
  const html = fs.readFileSync(FIXTURE, 'utf-8');
  const dom = new JSDOM(html, { url, runScripts: 'outside-only' });
  defineGlobal('window', dom.window);
  defineGlobal('document', dom.window.document);
  defineGlobal('location', dom.window.location);
  return dom.window.document;
}

function mountBlank(): void {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://music.douban.com/',
    runScripts: 'outside-only',
  });
  defineGlobal('window', dom.window);
  defineGlobal('document', dom.window.document);
  defineGlobal('location', dom.window.location);
}

test.describe('extractPopularArtists — .popular-artists tabs', () => {
  test('happy path: default artists tab, inline background-image parsed', () => {
    mountFixture();
    const items = extractPopularArtists();
    expect(items.map((i) => i.name)).toEqual(['潮汐少女', '林声', '刚果电声乐团']);

    const first = items[0]!;
    expect(first.genre).toBe('梦幻流行');
    expect(first.href).toBe('https://site.douban.com/echochan/');
    expect(first.photoUrl).toBe('https://img3.doubanio.com/img/mixed/2026/artist_big_echo.jpg');
    expect(first.isNew).toBe(false);

    // single-quoted and double-quoted url() serializations all parse
    expect(items[1]!.photoUrl).toBe('https://img2.doubanio.com/img/mixed/2026/artist_big_lin.jpg');
    expect(items[2]!.photoUrl).toBe(
      'https://img1.doubanio.com/img/mixed/2026/artist_big_kongo.jpg',
    );
    // artist without .genre → empty string
    expect(items[2]!.genre).toBe('');
  });

  test('new-artists tab: same shape, isNew true', () => {
    mountFixture();
    const items = extractPopularArtists('new-artists');
    expect(items.map((i) => i.name)).toEqual(['夜航电台', '玻璃回廊']);
    expect(items.every((i) => i.isNew)).toBe(true);
  });

  test('edge: item missing photo or name dropped (all three fields required)', () => {
    mountFixture();
    const items = extractPopularArtists();
    expect(items.length).toBe(3); // 5 .artist-item rendered → 2 dropped
    expect(items.some((i) => i.name === '无图音乐人')).toBe(false);
    expect(items.some((i) => i.href === 'https://site.douban.com/nameless/')).toBe(false);
  });

  test('edge: tab container absent → empty array', () => {
    const doc = mountFixture();
    doc.querySelector('.popular-artists .new-artists')?.remove();
    expect(extractPopularArtists('new-artists')).toEqual([]);
  });

  test('fallback: blank DOM yields empty array', () => {
    mountBlank();
    expect(extractPopularArtists()).toEqual([]);
  });
});

test.describe('extractNewAlbums — [data-react-component="NewAlbums"]', () => {
  test('happy path: cover/title/artist + allstar rating normalized', () => {
    mountFixture();
    const items = extractNewAlbums();
    expect(items.map((i) => i.subjectId)).toEqual(['37220001', '37220002', '37220003']);

    const first = items[0]!;
    expect(first.title).toBe('午后信号');
    expect(first.artist).toBe('小满乐队'); // last non-.star <p> wins
    expect(first.posterUrl).toBe('https://img1.doubanio.com/spic_upload/p37220001.jpg');
    expect(first.href).toBe('https://music.douban.com/subject/37220001/');
    expect(first.rate).toBe('4.5'); // allstar45 → 4.5
  });

  test('edge: allstar00 and missing star block both yield empty rate', () => {
    mountFixture();
    const items = extractNewAlbums();
    expect(items[1]!.rate).toBe(''); // allstar00 → unrated
    expect(items[2]!.rate).toBe(''); // no .star node at all
    expect(items[1]!.artist).toBe('陈与舟'); // plain-text <p> artist (no anchor)
    expect(items[2]!.artist).toBe('阿禾');
  });

  test('edge: album-item without any /subject/ link skipped', () => {
    mountFixture();
    const items = extractNewAlbums();
    expect(items.length).toBe(3);
    expect(items.some((i) => i.title === '推广条目')).toBe(false);
  });

  test('edge: section present but .album-content missing → empty array', () => {
    const doc = mountFixture();
    doc.querySelector('[data-react-component="NewAlbums"] .album-content')?.remove();
    expect(extractNewAlbums()).toEqual([]);
  });

  test('fallback: blank DOM yields empty array', () => {
    mountBlank();
    expect(extractNewAlbums()).toEqual([]);
  });
});

test.describe('extractGenreTags — .tag-block table', () => {
  test('happy path: th + td anchors, encoded hrefs preserved', () => {
    mountFixture();
    const tags = extractGenreTags();
    expect(tags.map((t) => t.name)).toEqual(['摇滚', '民谣', '电子', '爵士', '古典']);
    expect(tags[0]!.href).toBe('https://music.douban.com/tag/%E6%91%87%E6%BB%9A');
  });

  test('edge: non-anchor cell and empty-text anchor skipped', () => {
    mountFixture();
    const tags = extractGenreTags();
    expect(tags.length).toBe(5);
    expect(tags.every((t) => t.name && t.href)).toBe(true);
  });

  test('fallback: blank DOM yields empty array', () => {
    mountBlank();
    expect(extractGenreTags()).toEqual([]);
  });
});
