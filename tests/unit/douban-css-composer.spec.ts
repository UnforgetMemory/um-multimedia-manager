import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import {
  composeStylesForPage,
  getPageStyleChunks,
  getRegisteredCssPresets,
} from '@/scenario/douban/css-composer';

/**
 * X5 按需加载/包体波：douban css-composer preset→样式集映射（纯函数断言）。
 *
 * 冻结三件事：
 * 1. preset 内容与顺序（BASE_SHARED 前置 + 页内追加）；
 * 2. preset 引用的 chunk 名与 css-map 登记表**双向**对齐（无缺登记、无孤儿死重）；
 * 3. composeStylesForPage 对给定 map 的选择/跳过/拼接行为。
 */

/** 从 css-map.ts 源码解析 cssMap 的键清单（避免 node 侧 ?raw import）。 */
function parseCssMapKeys(): string[] {
  const src = readFileSync('src/scenario/douban/css-map.ts', 'utf8');
  const body = src.slice(src.indexOf('export const cssMap'));
  return [...body.matchAll(/^\s+'?([a-z][a-z0-9-]*)'?:\s*\w+Css,/gm)].map((m) => m[1]!);
}

const BASE_SHARED = [
  'static-tokens',
  'design-tokens',
  'theme',
  'breakpoints',
  'page-layout',
  'base',
];

test.describe('douban css-composer — preset→样式集纯映射', () => {
  test('每个 preset 均以 BASE_SHARED 六件套开头且顺序冻结', () => {
    for (const pageType of getRegisteredCssPresets()) {
      const chunks = getPageStyleChunks(pageType);
      expect(chunks.slice(0, BASE_SHARED.length), pageType).toEqual(BASE_SHARED);
    }
  });

  test('preset 引用 ⊆ cssMap 键（无未登记 chunk）', () => {
    const keys = new Set(parseCssMapKeys());
    // 44 个 douban styles/*.css + 1 个 libraries tokens.static.css
    expect(keys.size).toBe(45);
    for (const pageType of getRegisteredCssPresets()) {
      for (const name of getPageStyleChunks(pageType)) {
        expect(keys.has(name), `${pageType} 引用未登记 chunk: ${name}`).toBe(true);
      }
    }
  });

  test('cssMap 键 ⊆ preset 引用并集（无零引用死重样式）', () => {
    const referenced = new Set(
      getRegisteredCssPresets().flatMap((t) => [...getPageStyleChunks(t)]),
    );
    for (const key of parseCssMapKeys()) {
      expect(referenced.has(key), `cssMap 孤儿键（无任何 preset 消费）: ${key}`).toBe(true);
    }
  });

  test('抽查页级映射：detail/search/book-review-detail/personage-creations', () => {
    expect(getPageStyleChunks('detail')).toEqual([...BASE_SHARED, 'detail', 'interest']);
    expect(getPageStyleChunks('search')).toEqual([...BASE_SHARED, 'media-chips', 'search']);
    expect(getPageStyleChunks('book-review-detail')).toEqual([
      ...BASE_SHARED,
      'review-detail',
      'book-review-detail',
    ]);
    expect(getPageStyleChunks('personage-creations')).toEqual([
      ...BASE_SHARED,
      'paginator',
      'personage-creations',
    ]);
    expect(getPageStyleChunks('homepage')).toEqual([...BASE_SHARED, 'homepage']);
  });

  test('composeStylesForPage：按 preset 顺序拼段、跳过缺失键、附加 extra', () => {
    const fakeMap: Record<string, string> = {
      'static-tokens': ':root{}',
      'design-tokens': ':host{}',
      theme: '.theme{}',
      breakpoints: '.bp{}',
      'page-layout': '.layout{}',
      base: '.base{}',
      // detail/interest 故意缺失 → 应被跳过而非抛错
    };
    const css = composeStylesForPage('detail', fakeMap, [{ name: 'extra', css: '.x{}' }]);
    expect(css).toContain('/* === base === */');
    expect(css).not.toContain('/* === detail === */');
    expect(css).not.toContain('/* === interest === */');
    expect(css).toContain('/* === extra === */');
    expect(css.indexOf('/* === base === */')).toBeLessThan(css.indexOf('/* === extra === */'));
  });
});
