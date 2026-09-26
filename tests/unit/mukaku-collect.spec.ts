import { test, expect } from '@playwright/test';
import { JSDOM } from 'jsdom';
import { collectVisibleCards, PROCESSED_ATTR } from '@/entrypoints/content/handlers/mukaku/dom';

/**
 * `collectVisibleCards` 契约（2026-09-25 自 handler.processVisibleCards 抽出）。
 *
 * 抽出的动机：收集规则（单次扫描上限 + 「无链接卡停放」分流）原先嵌在
 * MukakuHandler 的 142 行方法内，无法脱离类状态单测。抽出后为无状态函数，
 * 可在此直接以 JSDOM 覆盖（原实现零测试）。
 *
 * 覆盖：mvId 提取与标记 / 已标记跳过 / 无链接卡分流 / 单次扫描上限 / total 计数。
 */

/** 卡片 HTML：有链接（可提取 mvId）、无链接（只能靠列表 API 图片匹配）、已标记。 */
const LINKED = '<a class="video-card" href="/mv/123"><img src="/a.jpg"></a>';
const LINKLESS = '<div class="video-card"><img src="/b.jpg"></div>';
const PRE_MARKED = (href: string) =>
  `<a class="video-card" href="/mv/${href}" ${PROCESSED_ATTR}="true"></a>`;

function docWith(body: string): Document {
  return new JSDOM(`<body>${body}</body>`, { url: 'https://mukaku.example/' }).window.document;
}

test.describe('collectVisibleCards — 扫描收集规则', () => {
  test('有链接卡提取 mvId 并落 processed 标记', () => {
    const doc = docWith(LINKED);
    const { unprocessed, noIdCards, total } = collectVisibleCards(doc, 500);

    expect(total).toBe(1);
    expect(noIdCards).toHaveLength(0);
    expect(unprocessed).toHaveLength(1);
    expect(unprocessed[0]!.mvId).toBe('123');
    expect(unprocessed[0]!.cardEl.getAttribute(PROCESSED_ATTR)).toBe('true');
  });

  test('无链接卡进入 noIdCards，且**不**落 processed 标记（待列表 API 匹配）', () => {
    const doc = docWith(LINKLESS);
    const { unprocessed, noIdCards, total } = collectVisibleCards(doc, 500);

    expect(total).toBe(1);
    expect(unprocessed).toHaveLength(0);
    expect(noIdCards).toHaveLength(1);
    expect(noIdCards[0]!.getAttribute(PROCESSED_ATTR)).toBeNull();
  });

  test('已带 processed 标记的卡被跳过（幂等，不重复收集）', () => {
    const doc = docWith(PRE_MARKED('456') + LINKED);
    const { unprocessed, total } = collectVisibleCards(doc, 500);

    expect(total).toBe(2);
    expect(unprocessed).toHaveLength(1);
    expect(unprocessed[0]!.mvId).toBe('123');
  });

  test('单次扫描上限同时约束两类桶（防敌意页面无界探测）', () => {
    const html = LINKED.repeat(3) + LINKLESS.repeat(3);
    const doc = docWith(html);
    const { unprocessed, noIdCards, total } = collectVisibleCards(doc, 4);

    // 上限按 unprocessed+noIdCards 计数，达到即停止收集
    expect(unprocessed.length + noIdCards.length).toBe(4);
    expect(total).toBe(6);
  });

  test('空页面 → 三桶皆空', () => {
    const { unprocessed, noIdCards, total } = collectVisibleCards(docWith(''), 500);

    expect(total).toBe(0);
    expect(unprocessed).toHaveLength(0);
    expect(noIdCards).toHaveLength(0);
  });

  test('返回的 total 记录全部 .video-card 数（含被跳过的已标记卡）', () => {
    const doc = docWith(PRE_MARKED('1') + PRE_MARKED('2') + LINKED);
    const { total, unprocessed } = collectVisibleCards(doc, 500);

    expect(total).toBe(3);
    expect(unprocessed).toHaveLength(1);
  });
});
