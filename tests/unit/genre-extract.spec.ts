import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';

initFileSandbox();
import { JSDOM } from 'jsdom';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractGenrePage } from '@/scenario/douban/pages/genre/genre-extract';

/**
 * genre-extract behavior lock (music.douban.com/artists/genre_page/N overlay).
 *
 * Fixture tests/fixtures/douban/genre.html reproduces the native genre
 * listing shape: .link_list breadcrumb nav (current genre = <span>),
 * .photoin artist blocks and the path-style .paginator. The module reads
 * the global `document`, so each test installs a fresh JSDOM first.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(HERE, '../fixtures/douban/genre.html');
const PAGE_URL = 'https://music.douban.com/artists/genre_page/10/2';

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

test.describe('extractGenrePage — happy path', () => {
  test('genre name from .link_list span, artists grid + nav + pagination', () => {
    mountFixture();
    const data = extractGenrePage();
    expect(data).not.toBeNull();
    const d = data as NonNullable<ReturnType<typeof extractGenrePage>>;

    expect(d.genreName).toBe('摇滚');

    // 5 .photoin rendered → no-alt and no-link blocks skipped
    expect(d.artists.map((a) => a.name)).toEqual(['万能青年旅店', '刺痛伤口乐队', 'fu ya']);
    const first = d.artists[0]!;
    expect(first.href).toBe('https://site.douban.com/wanqinglv');
    expect(first.avatarUrl).toBe('https://img3.doubanio.com/img/artist/s_wanqinglv.jpg');
    expect(first.likes).toBe(13725);
    expect(d.artists[1]!.likes).toBe(2048);
    // likes text without digits → 0
    expect(d.artists[2]!.likes).toBe(0);

    // nav: <a> = other genres, <span> = current (href kept empty)
    expect(d.navLinks).toEqual([
      { name: '流行', href: 'https://music.douban.com/artists/genre_page/1', isCurrent: false },
      { name: '电子', href: 'https://music.douban.com/artists/genre_page/7', isCurrent: false },
      { name: '摇滚', href: '', isCurrent: true },
      { name: '民谣', href: 'https://music.douban.com/artists/genre_page/3', isCurrent: false },
      { name: '爵士', href: 'https://music.douban.com/artists/genre_page/12', isCurrent: false },
    ]);

    // totalPages is link-derived: max last-path-segment number over
    // .paginator a (page 6 link present → 6, not data-total-page)
    expect(d.pagination.currentPage).toBe(2);
    expect(d.pagination.totalPages).toBe(6);
    expect(d.pagination.prevUrl).toBe('https://music.douban.com/artists/genre_page/10/1');
    expect(d.pagination.nextUrl).toBe('https://music.douban.com/artists/genre_page/10/3');
  });
});

test.describe('extractGenrePage — artist edge cases', () => {
  test('photoin without img alt or without artist link is dropped', () => {
    mountFixture();
    const d = extractGenrePage();
    const names = (d?.artists ?? []).map((a) => a.name);
    expect(names).not.toContain('没有链接');
    // the alt-less anchor block never surfaces at all
    expect(names.every((n) => n.length > 0)).toBe(true);
  });

  test('.ll a fallback link selector captures plain anchors', () => {
    mountFixture();
    const d = extractGenrePage();
    const fuya = (d?.artists ?? []).find((a) => a.name === 'fu ya');
    expect(fuya?.href).toBe('https://site.douban.com/fuya');
  });
});

test.describe('extractGenrePage — null guards and fallbacks', () => {
  test('no current-genre span → null (empty genreName guard)', () => {
    const doc = mountFixture();
    doc.querySelector('.link_list span')?.remove();
    expect(extractGenrePage()).toBeNull();
  });

  test('zero artists → null even when nav exists', () => {
    const doc = mountFixture();
    doc.querySelectorAll('.photoin').forEach((el) => el.remove());
    expect(extractGenrePage()).toBeNull();
  });

  test('blank DOM → null', () => {
    mountBlank();
    expect(extractGenrePage()).toBeNull();
  });

  test('edge: missing paginator falls back to page 1/1 with empty prev/next', () => {
    const doc = mountFixture();
    doc.querySelector('.paginator')?.remove();
    const d = extractGenrePage();
    expect(d?.pagination).toEqual({ currentPage: 1, totalPages: 1, prevUrl: '', nextUrl: '' });
  });

  test('edge: first page render has no prev link → prevUrl empty', () => {
    const doc = mountFixture();
    doc.querySelector('.paginator .prev')?.remove();
    const d = extractGenrePage();
    expect(d?.pagination.prevUrl).toBe('');
    expect(d?.pagination.nextUrl).toBe('https://music.douban.com/artists/genre_page/10/3');
  });
});
