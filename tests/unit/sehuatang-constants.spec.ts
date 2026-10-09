import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';
import {
  SEHUATANG_OVERLAY_ID,
  SEHUATANG_OVERLAY_Z_INDEX,
  LOADING_SUBTITLE,
  resolveEarlyLocale,
  type EarlyLocale,
} from '@/scenario/sehuatang/constants';

/**
 * sehuatang/constants behavior lock (X11-G).
 *
 * Not pure constants: resolveEarlyLocale() is the document_start locale
 * resolver (localStorage → navigator.language, NO chrome.storage branch —
 * async is off the table at document_start). Globals are stubbed per test;
 * Node 24 getter-only globals → defineProperty, per repo precedent.
 */

initFileSandbox();

function stubEnv(stored: string | null | 'throw', language: string): void {
  const storage: Pick<Storage, 'getItem'> = {
    getItem: (k: string) => {
      if (k !== 'umm:locale') return null;
      if (stored === 'throw') throw new Error('localStorage disabled');
      return stored;
    },
  };
  defineGlobal('localStorage', storage);
  defineGlobal('navigator', { language });
}

test.afterEach(() => {
  // strip stubs so unrelated specs on the reused worker keep node defaults
  defineGlobal('localStorage', undefined);
  defineGlobal('navigator', undefined);
});

test.describe('constants — 静态契约', () => {
  test('overlay ID / z-index 与 4 语言首帧文案钉死', () => {
    expect(SEHUATANG_OVERLAY_ID).toBe('umm-sht-overlay');
    // 高于 Discuz 固定元素、低于 .umm-overlay(2147483001)：夹缝值不可漂移
    expect(SEHUATANG_OVERLAY_Z_INDEX).toBe(2147483000);
    expect(LOADING_SUBTITLE).toEqual({
      'en-US': 'Loading...',
      'zh-CN': '加载中...',
      'zh-HK': '載入中...',
      'zh-TW': '載入中...',
    });
  });
});

test.describe('resolveEarlyLocale — 同步两级解析', () => {
  test('localStorage 命中四 locale 之一 → 直接返回（最高优先级）', () => {
    const locales: EarlyLocale[] = ['en-US', 'zh-CN', 'zh-HK', 'zh-TW'];
    for (const loc of locales) {
      stubEnv(loc, 'fr-FR');
      expect(resolveEarlyLocale()).toBe(loc);
    }
  });

  test('localStorage 存了未知值（不在 LOADING_SUBTITLE 白名单）→ 落 navigator', () => {
    stubEnv('de-DE', 'en-GB');
    expect(resolveEarlyLocale()).toBe('en-US');
  });

  test('localStorage 无值 → navigator 分支', () => {
    stubEnv(null, 'zh-CN');
    expect(resolveEarlyLocale()).toBe('zh-CN');
  });

  test('localStorage 抛错（罕见禁用态）→ 静默降级 navigator，不冒泡', () => {
    stubEnv('throw', 'zh-TW');
    expect(resolveEarlyLocale()).toBe('zh-TW');
  });

  test('中文细分：TW/HK 地区标记、Hant 无地区 → zh-TW；其余 zh* → zh-CN', () => {
    stubEnv(null, 'zh-TW');
    expect(resolveEarlyLocale()).toBe('zh-TW');
    stubEnv(null, 'zh-HK');
    expect(resolveEarlyLocale()).toBe('zh-HK');
    stubEnv(null, 'zh-Hant');
    expect(resolveEarlyLocale()).toBe('zh-TW');
    stubEnv(null, 'zh-Hans-CN');
    expect(resolveEarlyLocale()).toBe('zh-CN');
    stubEnv(null, 'zh-SG');
    expect(resolveEarlyLocale()).toBe('zh-CN');
  });

  test('TW 优先于 HK（同串含二者时按代码顺序）+ 非中文一律 en-US', () => {
    stubEnv(null, 'zh-HK-TW');
    expect(resolveEarlyLocale()).toBe('zh-TW'); // includes('TW') 判在前
    stubEnv(null, 'en-US');
    expect(resolveEarlyLocale()).toBe('en-US');
    stubEnv(null, 'ja-JP');
    expect(resolveEarlyLocale()).toBe('en-US');
  });

  test('navigator.language 空串 → en-US 兜底', () => {
    stubEnv(null, '');
    expect(resolveEarlyLocale()).toBe('en-US');
  });
});
