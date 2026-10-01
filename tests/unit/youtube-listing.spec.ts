import { test, expect } from '@playwright/test';
import { storeKey } from '@/entrypoints/content/ui/video-overlay-pure';
import {
  buildListingDimmerCss,
  bulkKeysForVideoIds,
  DIMMER_THRESHOLD,
  extractVideoIdFromCard,
  LISTING_BADGE_CLASS,
  LISTING_PROCESSED_ATTR,
  LISTING_VIEWED_ATTR,
  runYoutubeListingPass,
  shouldDimStatus,
  unprocessedCardSelector,
  type CardLike,
  type ListingRecordLike,
} from '@/entrypoints/content/ui/youtube-listing';

/**
 * YouTube listing 批量扫描契约（audit §P-C N+1 修复）。
 * 参照 bilibili-listing.spec 的夹具风格：纯函数断言 + JSDOM 夹具。
 */

const VID_A = 'dQw4w9WgXcQ';
const VID_B = 'a1B2c3D4e5F';

function fakeCard(opts: { hrefs?: string[] }): CardLike {
  const hrefs = opts.hrefs || [];
  return {
    getAttribute: () => null,
    querySelector(sel: string) {
      if (sel.includes('/watch?v=') && hrefs.length > 0) {
        return { getAttribute: () => hrefs[0]! };
      }
      return null;
    },
    querySelectorAll(sel: string) {
      if (!sel.includes('/watch?v=')) return [];
      return hrefs.map((href) => ({ getAttribute: () => href }));
    },
  };
}

async function docWithYtCards(body: string): Promise<Document> {
  const { JSDOM } = await import('jsdom');
  return new JSDOM(`<body>${body}</body>`, { url: 'https://www.youtube.com/' }).window.document;
}

const CARD_A = `<ytd-rich-item-renderer><a href="/watch?v=${VID_A}"></a></ytd-rich-item-renderer>`;
const CARD_B = `<ytd-video-renderer><div><a href="/watch?v=${VID_B}&list=WL"></a></div></ytd-video-renderer>`;
const CARD_LINKLESS = '<ytd-rich-item-renderer><span>no link</span></ytd-rich-item-renderer>';
const CARD_BAD_ID =
  '<ytd-rich-item-renderer><a href="/watch?v=short"></a></ytd-rich-item-renderer>';

test.describe('bulk key construction (pure)', () => {
  test('bulkKeysForVideoIds → canonical movie::<videoId>，一卡一键', () => {
    expect(bulkKeysForVideoIds([VID_A, VID_B])).toEqual([storeKey(VID_A), storeKey(VID_B)]);
    expect(bulkKeysForVideoIds([VID_A])[0]).toBe(`movie::${VID_A}`);
    expect(bulkKeysForVideoIds([])).toEqual([]);
  });

  test('extractVideoIdFromCard：主选择器优先，任意 href 兜底，非法 ID 拒绝', () => {
    expect(extractVideoIdFromCard(fakeCard({ hrefs: [`/watch?v=${VID_A}`] }))).toBe(VID_A);
    expect(extractVideoIdFromCard(fakeCard({ hrefs: [`/watch?v=${VID_B}&list=WL`] }))).toBe(VID_B);
    expect(extractVideoIdFromCard(fakeCard({ hrefs: ['/watch?v=short'] }))).toBeNull();
    expect(extractVideoIdFromCard(fakeCard({}))).toBeNull();
  });

  test('unprocessedCardSelector 排除已处理卡片（幂等扫描）', () => {
    const sel = unprocessedCardSelector();
    expect(sel).toContain(`ytd-rich-item-renderer:not([${LISTING_PROCESSED_ATTR}])`);
    expect(sel).toContain(`yt-lockup-view-model:not([${LISTING_PROCESSED_ATTR}])`);
  });

  test('dim 阈值语义不变：status >= 2 才淡化', () => {
    expect(shouldDimStatus(DIMMER_THRESHOLD - 1)).toBe(false);
    expect(shouldDimStatus(DIMMER_THRESHOLD)).toBe(true);
  });

  test('dim CSS 仍为属性窄化作用域（无 :has 全局污染）', () => {
    const css = buildListingDimmerCss();
    expect(css).toContain(`[${LISTING_VIEWED_ATTR}="true"]`);
    expect(css).toContain(`.${LISTING_BADGE_CLASS}`);
    expect(css).not.toContain(':has(');
  });
});

test.describe('runYoutubeListingPass — 单次 DB_GET_BULK（N+1 消除）', () => {
  test('全部可见卡片合并为一次批量读取并回填状态', async () => {
    const doc = await docWithYtCards(CARD_A + CARD_B + CARD_LINKLESS + CARD_BAD_ID);
    const calls: Array<{ store: string; keys: string[] }> = [];
    const res = await runYoutubeListingPass({
      root: doc,
      storeName: 'youtube_records',
      dbGetBulk: async (store, keys) => {
        calls.push({ store, keys });
        return [
          { key: storeKey(VID_A), record: { status: 2, rating: 8 } },
          { key: storeKey(VID_B), record: { status: 1 } },
        ];
      },
    });

    expect(calls).toHaveLength(1); // 2 张可解析卡 = 1 次批量，而非 2 次 DB_GET
    expect(calls[0]!.keys).toEqual([storeKey(VID_A), storeKey(VID_B)]);
    expect(res.scanned).toBe(4);
    expect(res.withId).toBe(2);
    expect(res.dimmed).toBe(1);
    expect(res.badgeHits).toBe(2); // 两条记录均回填徽章（已看×1 + 想看×1）
    expect(res.bulkKeys).toEqual([storeKey(VID_A), storeKey(VID_B)]);

    const cardA = doc.querySelector('ytd-rich-item-renderer')!;
    expect(cardA.getAttribute(LISTING_PROCESSED_ATTR)).toBe('true');
    expect(cardA.getAttribute(LISTING_VIEWED_ATTR)).toBe('true');
    expect(cardA.querySelector(`.${LISTING_BADGE_CLASS}`)!.textContent).toBe('已看 8');

    const cardB = doc.querySelector('ytd-video-renderer')!;
    expect(cardB.hasAttribute(LISTING_VIEWED_ATTR)).toBe(false);
    expect(cardB.querySelector(`.${LISTING_BADGE_CLASS}`)!.textContent).toBe('想看');

    // 无 ID 卡：标记已处理但不进批量
    expect(doc.querySelector('span')!.parentElement!.getAttribute(LISTING_PROCESSED_ATTR)).toBe(
      'true',
    );
  });

  test('badgeHits 统计所有命中记录的卡（含仅在看）', async () => {
    const doc = await docWithYtCards(CARD_B);
    const res = await runYoutubeListingPass({
      root: doc,
      storeName: 'youtube_records',
      dbGetBulk: async () => [{ key: storeKey(VID_B), record: { status: 3 } }],
    });
    expect(res.badgeHits).toBe(1);
    expect(res.dimmed).toBe(1); // status 3（在看）同样 >= 阈值 → 淡化（与既有语义一致）
    expect(doc.querySelector(`.${LISTING_BADGE_CLASS}`)!.textContent).toBe('在看');
  });
});

test.describe('runYoutubeListingPass — 批量失败诊断（不得静默全灭）', () => {
  test('dbGetBulk 失败：不抛出、console.warn 一次、默认徽章保留', async () => {
    const doc = await docWithYtCards(CARD_A);
    const warns: unknown[][] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => {
      warns.push(args);
    };
    try {
      const res = await runYoutubeListingPass({
        root: doc,
        storeName: 'youtube_records',
        dbGetBulk: async () => {
          throw new Error('background unreachable');
        },
      });
      expect(res.withId).toBe(1);
      expect(res.dimmed).toBe(0);
      expect(warns).toHaveLength(1);
      expect(String(warns[0]![0])).toContain('DB_GET_BULK');
      expect(String(warns[0]![1])).toContain('background unreachable');
    } finally {
      console.warn = original;
    }
    const card = doc.querySelector('ytd-rich-item-renderer')!;
    expect(card.querySelector(`.${LISTING_BADGE_CLASS}`)!.textContent).toBe('未看');
    expect(card.hasAttribute(LISTING_VIEWED_ATTR)).toBe(false);
  });
});

/**
 * Event-driven refresh (X32). A pass marks every row it verdicted processed, so
 * without an invalidation hook an external record write is invisible until the
 * host DOM changes — and because the old update loop only ever ADDED the dim
 * attribute and skipped rows with no record, even a fresh pass could not express
 * the delete direction.
 */
test.describe('事件驱动刷新与删除方向（X32）', () => {
  test('invalidateProcessedRows 只脏化事件键对应的那一行', async () => {
    const { invalidateProcessedRows } = await import('@/entrypoints/content/ui/youtube-listing');
    const doc = await docWithYtCards(CARD_A + CARD_B);
    await runYoutubeListingPass({
      root: doc,
      storeName: 'youtube_records',
      dbGetBulk: async () => [],
    });
    expect(doc.querySelectorAll(`[${LISTING_PROCESSED_ATTR}]`)).toHaveLength(2);

    expect(invalidateProcessedRows(doc, storeKey(VID_A))).toBe(1);
    expect(doc.querySelectorAll(`[${LISTING_PROCESSED_ATTR}]`)).toHaveLength(1);
    // An unrelated key must not dirty anything: a whole-feed re-scan per foreign
    // write is exactly the storm this hook exists to avoid.
    expect(invalidateProcessedRows(doc, storeKey('ZZZZZZZZZZZ'))).toBe(0);
  });

  test('键缺省或为 * 时脏化全部行（批量写入 / 恢复形态）', async () => {
    const { invalidateProcessedRows } = await import('@/entrypoints/content/ui/youtube-listing');
    const doc = await docWithYtCards(CARD_A + CARD_B);
    await runYoutubeListingPass({
      root: doc,
      storeName: 'youtube_records',
      dbGetBulk: async () => [],
    });

    expect(invalidateProcessedRows(doc, '*')).toBe(2);
    expect(doc.querySelectorAll(`[${LISTING_PROCESSED_ATTR}]`)).toHaveLength(0);
  });

  test('记录被删除后重扫：淡化属性被撤、徽章回到未看', async () => {
    const { invalidateProcessedRows } = await import('@/entrypoints/content/ui/youtube-listing');
    let entries: Array<{ key: string; record: ListingRecordLike | null }> = [
      { key: storeKey(VID_A), record: { status: 2, rating: 8 } },
    ];
    const read = async (): Promise<Array<{ key: string; record: ListingRecordLike | null }>> =>
      entries;
    const doc = await docWithYtCards(CARD_A);

    await runYoutubeListingPass({ root: doc, storeName: 'youtube_records', dbGetBulk: read });
    const card = doc.querySelector('ytd-rich-item-renderer')!;
    expect(card.getAttribute(LISTING_VIEWED_ATTR)).toBe('true');
    expect(card.querySelector(`.${LISTING_BADGE_CLASS}`)!.textContent).toBe('已看 8');

    entries = []; // the record was deleted elsewhere
    expect(invalidateProcessedRows(doc, storeKey(VID_A))).toBe(1);
    await runYoutubeListingPass({ root: doc, storeName: 'youtube_records', dbGetBulk: read });

    expect(card.hasAttribute(LISTING_VIEWED_ATTR)).toBe(false);
    expect(card.querySelector(`.${LISTING_BADGE_CLASS}`)!.textContent).toBe('未看');
  });

  test('状态降到阈值以下时同样撤淡化（不只看删除）', async () => {
    const { invalidateProcessedRows } = await import('@/entrypoints/content/ui/youtube-listing');
    let status = 2;
    const read = async (): Promise<Array<{ key: string; record: ListingRecordLike | null }>> => [
      { key: storeKey(VID_A), record: { status, rating: 0 } },
    ];
    const doc = await docWithYtCards(CARD_A);

    await runYoutubeListingPass({ root: doc, storeName: 'youtube_records', dbGetBulk: read });
    const card = doc.querySelector('ytd-rich-item-renderer')!;
    expect(card.hasAttribute(LISTING_VIEWED_ATTR)).toBe(true);

    status = 1; // 想看 — below DIMMER_THRESHOLD
    invalidateProcessedRows(doc, storeKey(VID_A));
    await runYoutubeListingPass({ root: doc, storeName: 'youtube_records', dbGetBulk: read });

    expect(card.hasAttribute(LISTING_VIEWED_ATTR)).toBe(false);
    expect(card.querySelector(`.${LISTING_BADGE_CLASS}`)!.textContent).toBe('想看');
  });
});
