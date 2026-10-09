import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';
import * as fs from 'node:fs';
import * as path from 'node:path';

initFileSandbox();
import { JSDOM } from 'jsdom';
import { hideNativeNav, hideNavForPage } from '@/scenario/douban/shared/hide-nav';

/**
 * Douban page-type completeness + native-nav hiding (X47).
 *
 * Two separate silent-failure modes, neither previously tested:
 *  1. adding a `PageType` variant to `url-detector.ts` without a mount entry in
 *     `main.ts` — `detectPageType()` then returns a type nobody mounts, and the
 *     page just looks like a plain Douban page (no error, no overlay). The only
 *     legitimate gap today is `video`, which main.ts aliases to the trailer
 *     mount; the guard pins exactly that and nothing else.
 *  2. `hideNavForPage` deciding which native bars to hide. A wrong branch leaves
 *     Douban's own nav next to our overlay (or hides nav the page needs), and no
 *     test would notice.
 */

const DETECTOR = path.resolve(process.cwd(), 'src/scenario/douban/shared/url-detector.ts');
const MAIN = path.resolve(process.cwd(), 'src/scenario/douban/main.ts');

function pageTypeValues(): string[] {
  const src = fs.readFileSync(DETECTOR, 'utf8');
  const union = src.slice(src.indexOf('export type PageType ='), src.indexOf('export function'));
  return [
    ...new Set([...union.matchAll(/\|\s*\{\s*type:\s*'([a-z0-9-]+)'/g)].map((m) => m[1] ?? '')),
  ];
}

function mountKeys(): Set<string> {
  const src = fs.readFileSync(MAIN, 'utf8');
  const table = src.slice(src.indexOf('const PAGE_MOUNTS = {'));
  return new Set([...table.matchAll(/^\s*'?([a-z0-9-]+)'?\s*:/gm)].map((m) => m[1] ?? ''));
}

/** Alias expressions like `pageType.type === 'video' ? 'trailer' : pageType.type`. */
function pageAliases(): Array<{ from: string; to: string }> {
  const src = fs.readFileSync(MAIN, 'utf8');
  return [...src.matchAll(/pageType\.type\s*===\s*'([a-z0-9-]+)'\s*\?\s*'([a-z0-9-]+)'/g)].map(
    (match) => ({ from: match[1] ?? '', to: match[2] ?? '' }),
  );
}

test.describe('PageType 完备性', () => {
  test('解析到足够多的页型与挂载键（守卫不空转）', () => {
    expect(pageTypeValues().length).toBeGreaterThanOrEqual(30);
    expect(mountKeys().size).toBeGreaterThanOrEqual(30);
  });

  test('每个 PageType 都有挂载入口，唯一的例外是 video→trailer 别名', () => {
    const keys = mountKeys();
    const aliased = new Set(pageAliases().map((alias) => alias.from));
    const unmounted = pageTypeValues().filter((type) => !keys.has(type) && !aliased.has(type));
    expect(unmounted, `这些页型没有挂载入口: ${unmounted.join(', ')}`).toEqual([]);
    expect([...aliased].sort()).toEqual(['video']);
  });

  test('别名两端都要成立：源页型存在且本身无挂载键，目标必须是已存在的挂载键', () => {
    const keys = mountKeys();
    const types = new Set(pageTypeValues());
    const problems: string[] = [];
    for (const { from, to } of pageAliases()) {
      if (!types.has(from)) problems.push(`别名源 '${from}' 不是 PageType 成员`);
      if (keys.has(from)) problems.push(`别名源 '${from}' 自己就有挂载键，别名是多余的`);
      if (!keys.has(to)) problems.push(`别名目标 '${to}' 没有对应挂载键`);
    }
    expect(problems).toEqual([]);
  });
});

test.describe('hideNavForPage 的原生导航隐藏', () => {
  const NAV_IDS = ['db-global-nav', 'db-nav-movie', 'db-nav-music', 'db-nav-book'] as const;

  function freshDom(): Document {
    const dom = new JSDOM(
      `<!doctype html><html><body>${NAV_IDS.map((id) => `<div id="${id}"></div>`).join(
        '',
      )}</body></html>`,
      { url: 'https://movie.douban.com/' },
    );
    defineGlobal('document', dom.window.document);
    defineGlobal('window', dom.window);
    defineGlobal('navigator', dom.window.navigator);
    defineGlobal('Node', dom.window.Node);
    defineGlobal('Element', dom.window.Element);
    defineGlobal('HTMLElement', dom.window.HTMLElement);
    return dom.window.document;
  }

  function hiddenIds(doc: Document): string[] {
    return NAV_IDS.filter((id) => doc.getElementById(id)?.style.display === 'none');
  }

  type AnyPageType = Parameters<typeof hideNavForPage>[0];

  test('hideNativeNav 无参数时不动任何节点', () => {
    const doc = freshDom();
    hideNativeNav();
    expect(hiddenIds(doc)).toEqual([]);
  });

  test('目标节点不存在时静默跳过（宿主改版不该抛错）', () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://movie.douban.com/',
    });
    defineGlobal('document', dom.window.document);
    defineGlobal('window', dom.window);
    expect(() => hideNativeNav({ globalNav: true, movieNav: true })).not.toThrow();
  });

  test('详情页按媒体类型选择要藏的原生条：电影=global+movie，音乐=global+music，图书=只 global', () => {
    const movieDoc = freshDom();
    hideNavForPage({ type: 'detail', mediaType: 'movie' } as AnyPageType);
    expect(hiddenIds(movieDoc)).toEqual(['db-global-nav', 'db-nav-movie']);

    const musicDoc = freshDom();
    hideNavForPage({ type: 'detail', mediaType: 'music' } as AnyPageType);
    expect(hiddenIds(musicDoc)).toEqual(['db-global-nav', 'db-nav-music']);

    const bookDoc = freshDom();
    hideNavForPage({ type: 'detail', mediaType: 'book' } as AnyPageType);
    expect(hiddenIds(bookDoc)).toEqual(['db-global-nav']);
  });

  test('首页与搜索页保留原生导航（它们是页面设计的一部分）', () => {
    for (const pageType of [
      { type: 'homepage' },
      { type: 'music-homepage' },
      { type: 'book-homepage' },
      { type: 'search', mediaType: 'movie' },
    ] as unknown as AnyPageType[]) {
      const doc = freshDom();
      hideNavForPage(pageType);
      expect(hiddenIds(doc), `${JSON.stringify(pageType)} 不该藏任何原生条`).toEqual([]);
    }
  });

  test('图书类页面藏 global+book，音乐类藏 global+music', () => {
    const bookDoc = freshDom();
    hideNavForPage({ type: 'book-reviews' } as AnyPageType);
    expect(hiddenIds(bookDoc)).toEqual(['db-global-nav', 'db-nav-book']);

    const musicDoc = freshDom();
    hideNavForPage({ type: 'genre' } as AnyPageType);
    expect(hiddenIds(musicDoc)).toEqual(['db-global-nav', 'db-nav-music']);

    const personageDoc = freshDom();
    hideNavForPage({ type: 'personage' } as AnyPageType);
    expect(hiddenIds(personageDoc)).toEqual(['db-global-nav']);
  });
});
