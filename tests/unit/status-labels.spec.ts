import { test, expect } from '@playwright/test';
import { JSDOM } from 'jsdom';
import { initFileSandbox, defineGlobal } from './helpers/global-sandbox';
import { interestBarLabels, statusBadgeLabels } from '@/scenario/douban/shared/status-labels';
import { initI18nSync } from '@/entrypoints/content/i18n';

/**
 * Status → label mapping 国标化测试。
 *
 * 覆盖两个语义族（ADR-009）：
 * 1. interestBarLabels — 兴趣标记按钮（wish/do/collect/mark）
 * 2. statusBadgeLabels — 状态徽章展示（done/wish/none/doing）
 *
 * 关键决策（decision-1）：game done 文案统一为 '玩过'（非 '已玩'）。
 *
 * X105 起文案经 content i18n 的 `t()` 在**访问时**解析（getters），而
 * `currentLocale` 是模块级单例——全量合并跑时前序 spec 可能已把它改成
 * en-US/zh-TW，本文件若不钉语言就会把英文当成「标签漂移」。故在断言前
 * 显式 `initI18nSync()` 到 zh-CN（词典值的唯一契约语言）。
 */

initFileSandbox();
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://example.com/',
});
defineGlobal('localStorage', dom.window.localStorage);
defineGlobal('navigator', dom.window.navigator);

function pinZhCn(): void {
  dom.window.localStorage.setItem('umm:locale', 'zh-CN');
  initI18nSync();
}

test.beforeEach(() => {
  pinZhCn();
});

// ── interestBarLabels ──

test.describe('interestBarLabels', () => {
  test('movie: 想看/在看/已看/标记', () => {
    const labels = interestBarLabels.movie;
    expect(labels.wish).toBe('想看');
    expect(labels.do).toBe('在看');
    expect(labels.collect).toBe('已看');
    expect(labels.mark).toBe('标记');
  });

  test('music: 想听/在听/已听/标记', () => {
    const labels = interestBarLabels.music;
    expect(labels.wish).toBe('想听');
    expect(labels.do).toBe('在听');
    expect(labels.collect).toBe('已听');
    expect(labels.mark).toBe('标记');
  });

  test('book: 想读/在读/已读/标记', () => {
    const labels = interestBarLabels.book;
    expect(labels.wish).toBe('想读');
    expect(labels.do).toBe('在读');
    expect(labels.collect).toBe('已读');
    expect(labels.mark).toBe('标记');
  });

  test('game: 想玩/在玩/玩过/标记', () => {
    const labels = interestBarLabels.game;
    expect(labels.wish).toBe('想玩');
    expect(labels.do).toBe('在玩');
    expect(labels.collect).toBe('玩过');
    expect(labels.mark).toBe('标记');
  });
});

// ── statusBadgeLabels ──

test.describe('statusBadgeLabels', () => {
  test('movie: 已看/想看/未看/在看', () => {
    const labels = statusBadgeLabels.movie;
    expect(labels.done).toBe('已看');
    expect(labels.wish).toBe('想看');
    expect(labels.none).toBe('未看');
    expect(labels.doing).toBe('在看');
  });

  test('music: 已听/想听/未听/在听', () => {
    const labels = statusBadgeLabels.music;
    expect(labels.done).toBe('已听');
    expect(labels.wish).toBe('想听');
    expect(labels.none).toBe('未听');
    expect(labels.doing).toBe('在听');
  });

  test('book: 已读/想读/未读/在读', () => {
    const labels = statusBadgeLabels.book;
    expect(labels.done).toBe('已读');
    expect(labels.wish).toBe('想读');
    expect(labels.none).toBe('未读');
    expect(labels.doing).toBe('在读');
  });

  test('game: 玩过/想玩/未玩/在玩 (decision-1: done=玩过, not 已玩)', () => {
    const labels = statusBadgeLabels.game;
    expect(labels.done).toBe('玩过');
    expect(labels.wish).toBe('想玩');
    expect(labels.none).toBe('未玩');
    expect(labels.doing).toBe('在玩');
  });
});
