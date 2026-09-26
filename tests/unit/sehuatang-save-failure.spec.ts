import { test, expect } from '@playwright/test';
import { JSDOM } from 'jsdom';
import { reportSaveFailure, consumeSaveFailure } from '@/scenario/sehuatang/save-failure';

/**
 * 跨页保存失败诊断契约（2026-09-25 自 app.ts 拆出）。
 *
 * 抽出的动机：两个函数原先嵌在 678 行编排模块内且不导出，无法单独覆盖。
 * 抽出后零模块状态（仅 sessionStorage），可直接测试。
 *
 * 契约：失败标记按源写入 sessionStorage（跨页存活），下一个页面消费后必须**清除**
 * ——否则会重复弹出上一次的失败提示。
 */

const KEY = 'umm-sht-save-failure';

/** 被测函数使用全局 sessionStorage。 */
function useStorage(): Storage {
  const dom = new JSDOM('', { url: 'https://www.sehuatang.net/' });
  (globalThis as unknown as { sessionStorage: Storage }).sessionStorage = dom.window.sessionStorage;
  return dom.window.sessionStorage;
}

test.describe('reportSaveFailure — 写入跨页标记', () => {
  test('写入 {at, reason, detail} 结构到 sessionStorage', () => {
    const storage = useStorage();

    reportSaveFailure('batch-add-failed', 'timeout');

    const raw = storage.getItem(KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as { at: number; reason: string; detail: string };
    expect(parsed.reason).toBe('batch-add-failed');
    expect(parsed.detail).toBe('timeout');
    expect(typeof parsed.at).toBe('number');
  });

  test('无 detail 时以空串落库（保持结构稳定）', () => {
    const storage = useStorage();

    reportSaveFailure('no-avid');

    const parsed = JSON.parse(storage.getItem(KEY)!) as { detail: string };
    expect(parsed.detail).toBe('');
  });

  test('后写覆盖先写（同一键只保留最近一次失败）', () => {
    const storage = useStorage();

    reportSaveFailure('first');
    reportSaveFailure('second');

    const parsed = JSON.parse(storage.getItem(KEY)!) as { reason: string };
    expect(parsed.reason).toBe('second');
  });
});

test.describe('consumeSaveFailure — 消费并清除', () => {
  test('无标记时不抛错、不残留', () => {
    const storage = useStorage();

    expect(() => consumeSaveFailure()).not.toThrow();
    expect(storage.getItem(KEY)).toBeNull();
  });

  test('有标记时清除该键（避免重复提示）', () => {
    const storage = useStorage();
    reportSaveFailure('probe-failed', 'detail-x');

    consumeSaveFailure();

    expect(storage.getItem(KEY)).toBeNull();
  });

  test('标记内容非法 JSON 时清除该键且不抛错', () => {
    const storage = useStorage();
    storage.setItem(KEY, '{not json');

    expect(() => consumeSaveFailure()).not.toThrow();
    expect(storage.getItem(KEY)).toBeNull();
  });
});
