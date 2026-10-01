import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';

initFileSandbox();
import { JSDOM } from 'jsdom';

/**
 * format-count — 评分人数紧凑格式化（X108）。
 *
 * 锁两件事：
 *  1. 中文路径与两页各自的历史渲染一致（doulist-detail 的 k 档 / series 的千分位
 *     分组；后者旧实现是无参 `toLocaleString()`，此处固定为 'zh-CN'，故口径是
 *     「zh 浏览器下等价」而非逐字节恒等；阈值统一属产品决策、尚未做）；
 *  2. 非中文语言走 Intl compact，不再输出中文「万」。
 */

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://movie.douban.com/',
});
defineGlobal('window', dom.window);
defineGlobal('document', dom.window.document);
defineGlobal('navigator', dom.window.navigator);
defineGlobal('localStorage', dom.window.localStorage);

const LOCALE_KEY = 'umm:locale';

async function withLocale<T>(locale: string, fn: (mod: FormatMod) => T): Promise<T> {
  try {
    dom.window.localStorage.setItem(LOCALE_KEY, locale);
    const mod = await import('@/scenario/douban/shared/format-count');
    const { initI18nSync } = await import('@/entrypoints/content/i18n');
    initI18nSync();
    return fn(mod);
  } finally {
    // 模块级 locale 是共享单例：用完落回 zh-CN 再清 key（同 a11y spec 的卫生约定）。
    dom.window.localStorage.setItem(LOCALE_KEY, 'zh-CN');
    const { initI18nSync } = await import('@/entrypoints/content/i18n');
    initI18nSync();
    dom.window.localStorage.removeItem(LOCALE_KEY);
  }
}

type FormatMod = typeof import('@/scenario/douban/shared/format-count');

test.describe('formatCountK（doulist-detail 语义）', () => {
  test('zh-CN：<1000 原样；1000–9999 带 k；≥1万 带「万」——与原实现逐字一致', async () => {
    await withLocale('zh-CN', ({ formatCountK }) => {
      expect(formatCountK(999)).toBe('999');
      expect(formatCountK(1500)).toBe('1.5k');
      expect(formatCountK(9999)).toBe('10.0k'); // 原实现的边界行为（10000 才换万档）
      expect(formatCountK(10000)).toBe('1.0万');
      expect(formatCountK(12345)).toBe('1.2万');
    });
  });

  test('zh-TW：万档用繁体「萬」', async () => {
    await withLocale('zh-TW', ({ formatCountK }) => {
      expect(formatCountK(12345)).toBe('1.2萬');
    });
  });

  test('en-US：Intl compact，不再输出中文单位', async () => {
    await withLocale('en-US', ({ formatCountK }) => {
      expect(formatCountK(12345)).toBe('12.3K');
      expect(formatCountK(1234567)).toBe('1.2M');
    });
  });
});

test.describe('formatCountGrouped（series 语义）', () => {
  test('zh-CN：千分位分组；万档同「万」', async () => {
    await withLocale('zh-CN', ({ formatCountGrouped }) => {
      expect(formatCountGrouped(999)).toBe('999');
      expect(formatCountGrouped(9999)).toBe('9,999');
      expect(formatCountGrouped(12345)).toBe('1.2万');
    });
  });

  test('en-US：Intl compact', async () => {
    await withLocale('en-US', ({ formatCountGrouped }) => {
      expect(formatCountGrouped(9999)).toBe('10K');
      expect(formatCountGrouped(12345)).toBe('12.3K');
    });
  });
});
