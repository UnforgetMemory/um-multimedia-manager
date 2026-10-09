import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';

initFileSandbox();
import { JSDOM } from 'jsdom';
import { isSafeDoubanUrl, usePaginator } from '@/scenario/douban/shared/composables/use-paginator';

/**
 * usePaginator — the shared pagination brain behind doulists / music-collect /
 * book-collect / game-collect / book-authors / user-media / user-celebrities.
 *
 * Worth pinning for two reasons:
 *  - it DERIVES page numbers from host paginator labels, and a mis-parse turns
 *    into either a dead paginator or a navigation to the wrong page;
 *  - `onPageChange` only assigns `location.href` after `isSafeDoubanUrl`, so that
 *    predicate is a live trust boundary: a host page that gains a crafted
 *    "page" link must not be able to send the overlay off-origin.
 */

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://movie.douban.com/people/x/doulists?type=movie',
  pretendToBeVisual: true,
});

const HOME = 'https://movie.douban.com/people/x/doulists?type=movie';

/**
 * jsdom's own `window.location` is non-configurable and swallows cross-document
 * navigation ("Not implemented: navigation to another Document"), so a real
 * write is unobservable. The composable touches exactly one thing —
 * `window.location.href` — so the global `window` is replaced by a plain object
 * carrying a mutable `location`. The assertion still checks what it should: the
 * URL the module decided to navigate to, and whether it navigated at all.
 */
const locationStub = { href: HOME } as unknown as Location;
const fakeWindow = { location: locationStub } as unknown as Window & typeof globalThis;

defineGlobal('window', fakeWindow);
defineGlobal('document', dom.window.document);
defineGlobal('navigator', dom.window.navigator);
defineGlobal('location', locationStub);

type PageLink = { label: string; url?: string; current?: boolean };

function paginator(links: PageLink[], prevUrl?: string, nextUrl?: string) {
  return usePaginator(
    () => links,
    () => prevUrl,
    () => nextUrl,
  );
}

test.describe('isSafeDoubanUrl', () => {
  test('same-origin Douban hosts are accepted', () => {
    expect(isSafeDoubanUrl('https://movie.douban.com/people/x/doulists?page=2')).toBe(true);
    expect(isSafeDoubanUrl('http://www.douban.com/feed/podcast/1?page=2')).toBe(true);
    expect(isSafeDoubanUrl('https://douban.com/x/')).toBe(true);
  });

  test('other origins, schemes and look-alike suffixes are refused', () => {
    expect(isSafeDoubanUrl('https://evil.test/douban.com/')).toBe(false);
    expect(isSafeDoubanUrl('https://douban.com.evil.test/x/')).toBe(false);
    expect(isSafeDoubanUrl('javascript:alert(1)//douban.com/')).toBe(false);
    expect(isSafeDoubanUrl('//douban.com/x')).toBe(false);
    expect(isSafeDoubanUrl('data:text/html,douban.com/')).toBe(false);
  });
});

test.describe('页码派生', () => {
  test('无分页链接时回落为 1/1（分页器据此自动隐藏）', () => {
    const { currentPage, totalPages } = paginator([]);
    expect(currentPage.value).toBe(1);
    expect(totalPages.value).toBe(1);
  });

  test('当前页取带 current 的标签，总页取最后一个标签；非数字标签回落 1', () => {
    const links: PageLink[] = [
      { label: '1', url: 'https://movie.douban.com/a?page=1' },
      { label: '2', url: 'https://movie.douban.com/a?page=2', current: true },
      { label: '3', url: 'https://movie.douban.com/a?page=3' },
    ];
    const numeric = paginator(links);
    expect(numeric.currentPage.value).toBe(2);
    expect(numeric.totalPages.value).toBe(3);

    const junk = paginator([
      { label: '下一页', url: 'https://movie.douban.com/a?page=2', current: true },
    ]);
    expect(junk.currentPage.value).toBe(1);
    expect(junk.totalPages.value).toBe(1);
  });
});

test.describe('onPageChange 的导航与信任边界', () => {
  function resetLocation(): void {
    locationStub.href = HOME;
  }

  test('命中的分页链接是 Douban 同源时才跳转', () => {
    resetLocation();
    const links: PageLink[] = [
      { label: '1', url: 'https://movie.douban.com/a?page=1', current: true },
      { label: '2', url: 'https://movie.douban.com/a?page=2' },
    ];
    const { onPageChange } = paginator(links);
    onPageChange(2);
    expect(locationStub.href).toBe('https://movie.douban.com/a?page=2');
  });

  test('命中的链接被伪造为外域时一律不跳转（信任边界）', () => {
    resetLocation();
    const before = locationStub.href;
    const links: PageLink[] = [
      { label: '1', url: 'https://movie.douban.com/a', current: true },
      { label: '2', url: 'javascript:alert(1)' },
    ];
    paginator(links).onPageChange(2);
    expect(locationStub.href, 'a crafted paginator label must not navigate').toBe(before);
  });

  test('没有对应链接时回落相邻页 URL，同样要过同源校验', () => {
    resetLocation();
    const links: PageLink[] = [{ label: '1', url: 'https://movie.douban.com/a', current: true }];
    paginator(links, undefined, 'https://movie.douban.com/a?page=2').onPageChange(2);
    expect(locationStub.href).toBe('https://movie.douban.com/a?page=2');

    resetLocation();
    const before = locationStub.href;
    paginator(links, undefined, 'https://evil.test/a?page=2').onPageChange(2);
    expect(locationStub.href).toBe(before);
  });

  test('目标页就是当前页且无链接时不动', () => {
    resetLocation();
    const before = locationStub.href;
    const links: PageLink[] = [{ label: '1', current: true }];
    paginator(links, 'https://movie.douban.com/prev', 'https://movie.douban.com/next').onPageChange(
      1,
    );
    expect(locationStub.href).toBe(before);
  });
});
