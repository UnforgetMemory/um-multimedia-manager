import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';
import { JSDOM, type DOMWindow } from 'jsdom';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractSubjectId,
  extractSubjectIdFromUrl,
} from '@/scenario/douban/shared/subject-id-extract';

// Installs happen inside tests below; register this file's sandbox hooks at module scope.
initFileSandbox();

/**
 * subject-id-extract behavior lock (X11-G) — the shared 3-tier ID resolver
 * (subject|movie|tv link → data-trailer attribute → empty string).
 *
 * Fixture tests/fixtures/douban/subject-id-cards.html ships one card per
 * documented tier, incl. link-vs-attribute priority and the no-digits link
 * fallback. extractSubjectIdFromUrl reads window.location → remount per URL.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));

const dom: DOMWindow = new JSDOM(
  fs.readFileSync(path.resolve(HERE, '../fixtures/douban/subject-id-cards.html'), 'utf-8'),
  { url: 'https://movie.douban.com/' },
).window;
defineGlobal('window', dom);
defineGlobal('document', dom.document);
defineGlobal('location', dom.location);
defineGlobal('Node', dom.Node);

function card(id: string): Element {
  const el = dom.document.getElementById(id);
  if (!el) throw new Error(`fixture card missing: #${id}`);
  return el;
}

test.describe('extractSubjectId — DOM 三级解析', () => {
  test('绝对 /subject/ 链接命中', () => {
    expect(extractSubjectId(card('c-subject'))).toBe('1292052');
  });

  test('相对 /movie/ 链接经浏览器解析后命中', () => {
    expect(extractSubjectId(card('c-rel-movie'))).toBe('1440129');
  });

  test('/tv/ 链接命中（host 里的 movie. 不算 /movie/ 段）', () => {
    expect(extractSubjectId(card('c-tv'))).toBe('25828561');
  });

  test('无链接 → data-trailer 属性兜底', () => {
    expect(extractSubjectId(card('c-trailer-only'))).toBe('35000551');
  });

  test('链接与 data-trailer 并存 → 链接优先', () => {
    expect(extractSubjectId(card('c-priority'))).toBe('1291544');
  });

  test('链接存在但无数字 → 继续落到 data-trailer', () => {
    expect(extractSubjectId(card('c-nonum'))).toBe('36777777');
  });

  test('两级来源皆无 → 空串', () => {
    expect(extractSubjectId(card('c-none'))).toBe('');
  });

  test('edge: data-trailer 缺尾部斜杠（/subject/123）不匹配 → 空串', () => {
    const el = dom.document.createElement('div');
    el.dataset.trailer = 'https://movie.douban.com/subject/123';
    expect(extractSubjectId(el)).toBe('');
  });

  test('edge: 非 subject|movie|tv 段位的数字链接不误命中 → 空串', () => {
    const el = dom.document.createElement('div');
    const a = dom.document.createElement('a');
    a.href = 'https://www.douban.com/gallery/12345/';
    el.append(a);
    expect(extractSubjectId(el)).toBe('');
  });
});

test.describe('extractSubjectIdFromUrl — location.pathname', () => {
  function at(pathname: string): string {
    const next = new JSDOM('<!doctype html><html></html>', {
      url: `https://movie.douban.com${pathname}`,
    }).window;
    defineGlobal('window', next);
    defineGlobal('location', next.location);
    return extractSubjectIdFromUrl();
  }

  test('列表页 /subject/{id}/photos → id', () => {
    expect(at('/subject/1292052/photos')).toBe('1292052');
  });

  test('详情页 /trailer/{id}/ → 命中的是路径首个数字段（video id，非 subject）', () => {
    // 现状锁定：正则 /\/(\d+)\// 取第一个斜杠包裹的数字段。
    expect(at('/trailer/130123/')).toBe('130123');
  });

  test('pathname 无数字段 → 空串', () => {
    expect(at('/movie_search/query')).toBe('');
  });

  test('数字段无尾斜杠（/photos/1292052）不命中 → 空串', () => {
    expect(at('/photos/1292052')).toBe('');
  });
});
