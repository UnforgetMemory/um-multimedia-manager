import { test, expect } from '@playwright/test';
import { defineGlobal } from './helpers/global-sandbox';
import { JSDOM } from 'jsdom';
import {
  isDangerousUrl,
  openExternalUrl,
  safeHref,
  safeHrefOpt,
  sanitizePageData,
} from '@/libraries/utils/safe-url';

/**
 * safe-url contract: the single choke point that
 * decides which host-authored URL strings may reach anchors / window.open /
 * location.href. http(s) and relative forms survive; executable or opaque
 * schemes collapse to '#' at href sinks and are refused outright by
 * openExternalUrl.
 */

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://movie.douban.com/subject/1292052/',
});
defineGlobal('window', dom.window);

let opened: Array<{ url: string; target: string; features?: string }> = [];
Object.defineProperty(dom.window, 'open', {
  value: (url?: string | URL, target?: string, features?: string) => {
    opened.push({ url: String(url ?? ''), target: String(target ?? ''), features });
    return null;
  },
  configurable: true,
  writable: true,
});

test.describe('safeHref', () => {
  test('neutralizes executable and opaque schemes', () => {
    expect(safeHref('javascript:alert(1)')).toBe('#');
    expect(safeHref('JaVaScRiPt:alert(1)')).toBe('#');
    expect(safeHref(' javascript:alert(1)')).toBe('#');
    expect(safeHref('java\nscript:alert(1)')).toBe('#');
    expect(safeHref('data:text/html,<script>alert(1)</script>')).toBe('#');
    expect(safeHref('vbscript:msgbox(1)')).toBe('#');
    expect(safeHref('file:///C:/windows/win.ini')).toBe('#');
    expect(safeHref('blob:https://movie.douban.com/uuid')).toBe('#');
    expect(safeHref('mailto:someone@example.com')).toBe('#');
  });

  test('keeps http(s) and relative targets untouched', () => {
    const abs = 'https://movie.douban.com/subject/1292052/';
    expect(safeHref(abs)).toBe(abs);
    expect(safeHref('http://example.com/x')).toBe('http://example.com/x');
    expect(safeHref('/people/123/')).toBe('/people/123/');
    expect(safeHref('#anchor')).toBe('#anchor');
    expect(safeHref('')).toBe('');
  });
});

test.describe('safeHrefOpt', () => {
  test('optional/empty collapse to undefined (attribute omitted)', () => {
    expect(safeHrefOpt(undefined)).toBeUndefined();
    expect(safeHrefOpt(null)).toBeUndefined();
    expect(safeHrefOpt('')).toBeUndefined();
  });

  test('dangerous collapses to #, safe passes through', () => {
    expect(safeHrefOpt('javascript:alert(1)')).toBe('#');
    expect(safeHrefOpt('https://book.douban.com/subject/1/')).toBe(
      'https://book.douban.com/subject/1/',
    );
  });
});

test.describe('isDangerousUrl', () => {
  test('only scheme-bearing absolute URLs are judged', () => {
    expect(isDangerousUrl('javascript:alert(1)')).toBe(true);
    expect(isDangerousUrl('https://movie.douban.com/')).toBe(false);
    // Prose and relative paths never parse absolutely → untouched.
    expect(isDangerousUrl('4:30')).toBe(false);
    expect(isDangerousUrl('Star: Trek')).toBe(false);
    expect(isDangerousUrl('/subject/1292052/')).toBe(false);
    expect(isDangerousUrl('导演: 诺兰')).toBe(false);
  });
});

test.describe('sanitizePageData', () => {
  test('rewrites dangerous strings anywhere in plain structures', () => {
    const data = {
      title: 'Ok',
      link: 'javascript:alert(1)',
      list: [{ url: 'data:text/html,x' }, { keep: 'https://movie.douban.com/x' }],
      map: new Map<string, string>([['a', 'vbscript:kill']]),
      set: new Set<string>(['file:///x', 'https://movie.douban.com/ok']),
      count: 7,
      when: null,
    };
    sanitizePageData(data);
    expect(data.link).toBe('#');
    expect(data.list[0]!.url).toBe('#');
    expect(data.list[1]!.keep).toBe('https://movie.douban.com/x');
    expect(data.map.get('a')).toBe('#');
    expect([...data.set].sort()).toEqual(['#', 'https://movie.douban.com/ok']);
    expect(data.title).toBe('Ok');
    expect(data.count).toBe(7);
  });

  test('is cycle-safe and leaves class instances alone', () => {
    class Box {
      href = 'javascript:alert(1)';
    }
    const box = new Box();
    const node: Record<string, unknown> = { box, self: undefined };
    node['self'] = node;
    expect(() => sanitizePageData(node)).not.toThrow();
    expect(box.href).toBe('javascript:alert(1)'); // instances are not walked
    expect((node['self'] as Record<string, unknown>)['self']).toBe(node);
  });
});

test.describe('openExternalUrl', () => {
  test('refuses dangerous targets — window.open never sees them', () => {
    opened = [];
    openExternalUrl('javascript:alert(1)');
    openExternalUrl('data:text/html,x');
    openExternalUrl('');
    openExternalUrl(undefined);
    expect(opened).toEqual([]);
  });

  test('forwards safe targets with default _blank target', () => {
    opened = [];
    openExternalUrl('https://movie.douban.com/subject/1/');
    expect(opened).toHaveLength(1);
    expect(opened[0]!.url).toBe('https://movie.douban.com/subject/1/');
    expect(opened[0]!.target).toBe('_blank');
    openExternalUrl('https://x.example/', '_parent', 'noopener');
    expect(opened[1]!.target).toBe('_parent');
    expect(opened[1]!.features).toBe('noopener');
  });
});
