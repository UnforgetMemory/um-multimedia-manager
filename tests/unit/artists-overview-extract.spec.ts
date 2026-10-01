import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';

initFileSandbox();
import { JSDOM } from 'jsdom';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractArtistsOverview } from '@/scenario/douban/pages/artists-overview/artists-overview-extract';

/**
 * artists-overview-extract behavior lock (music.douban.com/artists overlay).
 *
 * Fixture tests/fixtures/douban/artists-overview.html reproduces the native
 * overview sections: #guess-artists carousel, #artists-events .list-v,
 * #artists-video .list and .genre-nav .bd. The module reads the global
 * `document`, so each test installs a fresh JSDOM first.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(HERE, '../fixtures/douban/artists-overview.html');
const PAGE_URL = 'https://music.douban.com/artists';

function mountFixture(url = PAGE_URL): Document {
  const html = fs.readFileSync(FIXTURE, 'utf-8');
  const dom = new JSDOM(html, { url, runScripts: 'outside-only' });
  defineGlobal('window', dom.window);
  defineGlobal('document', dom.window.document);
  defineGlobal('location', dom.window.location);
  return dom.window.document;
}

function mountBlank(): void {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: PAGE_URL,
    runScripts: 'outside-only',
  });
  defineGlobal('window', dom.window);
  defineGlobal('document', dom.window.document);
  defineGlobal('location', dom.window.location);
}

test.describe('extractArtistsOverview — recommended artists', () => {
  test('happy path: name/href/avatar from .slide-page .list li', () => {
    mountFixture();
    const d = extractArtistsOverview();
    expect(d?.recommendedArtists.map((a) => a.name)).toEqual(['万能青年旅店', '声音玩具']);
    const first = d?.recommendedArtists[0];
    expect(first?.href).toBe('https://site.douban.com/wanqing/');
    expect(first?.avatarUrl).toBe('https://img3.doubanio.com/img/artist/s_wanqing.jpg');
  });

  test('edge: duplicate href deduplicated; li without name dropped', () => {
    mountFixture();
    const d = extractArtistsOverview();
    expect(d?.recommendedArtists.length).toBe(2);
    expect(d?.recommendedArtists.some((a) => a.href === 'https://site.douban.com/nameless/')).toBe(
      false,
    );
  });
});

test.describe('extractArtistsOverview — events', () => {
  test('happy path: multiline .desc → first line title, full text description', () => {
    mountFixture();
    const d = extractArtistsOverview();
    expect(d?.events.length).toBe(2);

    const first = d?.events[0];
    expect(first?.title).toBe('2026 夏波音乐节阵容公布');
    expect(first?.href).toBe('https://www.douban.com/event/36660001/');
    expect(first?.imageUrl).toBe('https://img1.doubanio.com/cuphead/event/p36660001-cover.jpg');
    expect(first?.description.includes('地点：天津滨海公园')).toBe(true);

    // single-line desc → title === description
    expect(d?.events[1]?.title).toBe('新专辑试听会 · 潮汐少女');
    expect(d?.events[1]?.description).toBe('新专辑试听会 · 潮汐少女');
  });

  test('edge: event li without .pic link skipped', () => {
    mountFixture();
    const d = extractArtistsOverview();
    expect(d?.events.some((e) => e.description === '没有图片的活动')).toBe(false);
  });
});

test.describe('extractArtistsOverview — videos', () => {
  test('happy path: artist-name span + title anchor inside div.title', () => {
    mountFixture();
    const d = extractArtistsOverview();
    expect(d?.videos.length).toBe(2);

    const first = d?.videos[0];
    expect(first?.artistName).toBe('草东没有派对');
    expect(first?.title).toBe('大风吹 MV');
    expect(first?.href).toBe('https://music.douban.com/video/20001/');
    expect(first?.imageUrl).toBe(
      'https://img3.doubanio.com/view/movie_poster_cover/apspath/p20001.jpg',
    );

    // video without artist-name span → empty artistName
    expect(d?.videos[1]?.artistName).toBe('');
    expect(d?.videos[1]?.title).toBe('无艺人名的现场');
  });

  test('edge: video li without .pic link skipped', () => {
    mountFixture();
    const d = extractArtistsOverview();
    expect(d?.videos.some((v) => v.title === '没有链接')).toBe(false);
  });
});

test.describe('extractArtistsOverview — genre nav + fallbacks', () => {
  test('happy path: .genre-nav .bd anchors with name/href pairs', () => {
    mountFixture();
    const d = extractArtistsOverview();
    expect(d?.genreNav).toEqual([
      { name: '流行', href: 'https://music.douban.com/artists/genre_page/1' },
      { name: '摇滚', href: 'https://music.douban.com/artists/genre_page/10' },
      { name: '电子', href: 'https://music.douban.com/artists/genre_page/7' },
    ]);
  });

  test('edge: blank-text nav anchor skipped', () => {
    mountFixture();
    const d = extractArtistsOverview();
    expect(d?.genreNav.length).toBe(3);
  });

  test('documented shape: empty DOM returns all-empty sections (never null)', () => {
    mountBlank();
    expect(extractArtistsOverview()).toEqual({
      recommendedArtists: [],
      events: [],
      videos: [],
      genreNav: [],
    });
  });

  test('edge: sections removed individually → only that section empties', () => {
    const doc = mountFixture();
    doc.querySelector('#guess-artists')?.remove();
    doc.querySelector('.genre-nav')?.remove();
    const d = extractArtistsOverview();
    expect(d?.recommendedArtists).toEqual([]);
    expect(d?.genreNav).toEqual([]);
    expect(d?.events.length).toBe(2);
    expect(d?.videos.length).toBe(2);
  });
});
