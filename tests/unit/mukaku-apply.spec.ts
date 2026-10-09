import { test, expect } from '@playwright/test';
import { JSDOM } from 'jsdom';
import { applyCardActions, type CardApplyInput } from '@/entrypoints/content/handlers/mukaku/apply';
import { PROCESSED_ATTR } from '@/entrypoints/content/handlers/mukaku/dom';

/**
 * `applyCardActions` 契约（2026-09-25 自 handler.processVisibleCards phase 2 抽出）。
 *
 * 抽出的动机：dim / skip / 探测失败三类结果的应用规则原先嵌在类的长方法内，
 * 依赖 `this.probeFailCooldown` 等状态，无法单测。抽出后为**无状态** DOM 应用器
 * ——失败卡的冷却登记改为「返回 mvId 列表、由调用方登记」，于是规则本身可测
 * （原实现零测试）。
 *
 * 覆盖：dim 命中 / skip / 探测失败清标记并上报 / 未命中不写。
 */

const NO_ASSOCIATION = new Set<string>();

function cardDoc(): { doc: Document; card: HTMLElement } {
  const doc = new JSDOM(
    `<body><a class="video-card" href="/mv/123" ${PROCESSED_ATTR}="true"></a></body>`,
    { url: 'https://mukaku.example/' },
  ).window.document;
  const card = doc.querySelector('.video-card') as unknown as HTMLElement;
  return { doc, card };
}

const WATCHED = {
  watchedDouban: new Set(['111']),
  watchedImdb: new Set(['tt222']),
};

test.describe('applyCardActions — 结果应用规则', () => {
  test("action='dim' → 落 .umm-dimmed", () => {
    const { card } = cardDoc();
    const inputs: CardApplyInput[] = [
      { cardEl: card, mvId: '123', action: 'dim', linkedIds: null },
    ];

    const { failedProbeMvIds } = applyCardActions(inputs, WATCHED);

    expect(card.classList.contains('umm-dimmed')).toBe(true);
    expect(failedProbeMvIds).toEqual([]);
  });

  test("action='skip' → 不改动 DOM（无关联/未命中都不写）", () => {
    const { card } = cardDoc();
    const inputs: CardApplyInput[] = [
      { cardEl: card, mvId: '123', action: 'skip', linkedIds: null },
    ];

    applyCardActions(inputs, WATCHED);

    expect(card.classList.contains('umm-dimmed')).toBe(false);
    expect(card.getAttribute(PROCESSED_ATTR)).toBe('true');
  });

  test('needs-probe 且 doubanId 命中 watched → dim', () => {
    const { card } = cardDoc();
    const inputs: CardApplyInput[] = [
      {
        cardEl: card,
        mvId: '123',
        action: 'needs-probe',
        linkedIds: { doubanId: '111', imdbId: null },
      },
    ];

    applyCardActions(inputs, WATCHED);

    expect(card.classList.contains('umm-dimmed')).toBe(true);
  });

  test('needs-probe 且仅 imdbId 命中 → dim（两条匹配路径等价）', () => {
    const { card } = cardDoc();
    const inputs: CardApplyInput[] = [
      {
        cardEl: card,
        mvId: '123',
        action: 'needs-probe',
        linkedIds: { doubanId: null, imdbId: 'tt222' },
      },
    ];

    applyCardActions(inputs, WATCHED);

    expect(card.classList.contains('umm-dimmed')).toBe(true);
  });

  test('needs-probe 且未命中 → 不 dim、不写', () => {
    const { card } = cardDoc();
    const inputs: CardApplyInput[] = [
      {
        cardEl: card,
        mvId: '123',
        action: 'needs-probe',
        linkedIds: { doubanId: '999', imdbId: 'tt999' },
      },
    ];

    applyCardActions(inputs, WATCHED);

    expect(card.classList.contains('umm-dimmed')).toBe(false);
  });

  test('探测失败（linkedIds=null）→ 清 processed 标记并上报 mvId（供调用方登记冷却）', () => {
    const { card } = cardDoc();
    const inputs: CardApplyInput[] = [
      { cardEl: card, mvId: '123', action: 'needs-probe', linkedIds: null },
    ];

    const { failedProbeMvIds } = applyCardActions(inputs, WATCHED);

    // 清标记 → 该卡在冷却窗口后被重新收集重试（失败永不永久跳过）
    expect(card.getAttribute(PROCESSED_ATTR)).toBeNull();
    expect(card.classList.contains('umm-dimmed')).toBe(false);
    expect(failedProbeMvIds).toEqual(['123']);
  });

  test('两 id 皆 null 的探测结果 → 视为命中但无匹配（不 dim，也不算失败）', () => {
    const { card } = cardDoc();
    const inputs: CardApplyInput[] = [
      {
        cardEl: card,
        mvId: '123',
        action: 'needs-probe',
        linkedIds: { doubanId: null, imdbId: null },
      },
    ];

    const { failedProbeMvIds } = applyCardActions(inputs, WATCHED);

    expect(card.classList.contains('umm-dimmed')).toBe(false);
    expect(card.getAttribute(PROCESSED_ATTR)).toBe('true');
    expect(failedProbeMvIds).toEqual([]);
  });

  test('批量：多卡混合结果分别应用，失败卡按序上报', () => {
    const doc = new JSDOM(
      `<body>
         <a class="video-card" href="/mv/1"></a>
         <a class="video-card" href="/mv/2"></a>
         <a class="video-card" href="/mv/3"></a>
       </body>`,
      { url: 'https://mukaku.example/' },
    ).window.document;
    const cards = Array.from(doc.querySelectorAll('.video-card')) as unknown as HTMLElement[];

    const inputs: CardApplyInput[] = [
      { cardEl: cards[0]!, mvId: '1', action: 'dim', linkedIds: null },
      { cardEl: cards[1]!, mvId: '2', action: 'needs-probe', linkedIds: null },
      { cardEl: cards[2]!, mvId: '3', action: 'skip', linkedIds: null },
    ];

    const { failedProbeMvIds } = applyCardActions(inputs, WATCHED);

    expect(cards[0]!.classList.contains('umm-dimmed')).toBe(true);
    expect(cards[1]!.classList.contains('umm-dimmed')).toBe(false);
    expect(cards[2]!.classList.contains('umm-dimmed')).toBe(false);
    expect(failedProbeMvIds).toEqual(['2']);
  });

  test('空输入 → 无操作、无失败上报', () => {
    const { failedProbeMvIds } = applyCardActions([], {
      watchedDouban: NO_ASSOCIATION,
      watchedImdb: NO_ASSOCIATION,
    });
    expect(failedProbeMvIds).toEqual([]);
  });
});
