import { test, expect } from '@playwright/test';
import { JSDOM } from 'jsdom';
import { storeKey } from '@/entrypoints/content/ui/video-overlay-pure';
import { configureLogging } from '@/libraries/utils/logger';
import {
  LISTING_BADGE_CLASS,
  LISTING_DIMMER_CLASS,
  LISTING_PROCESSED_ATTR,
  runListingDimmerPass,
  invalidateProcessedRows,
  type ListingRecordLike,
} from '@/entrypoints/content/ui/bilibili-listing';

/**
 * Failed bulk read must not be painted as an authoritative "unwatched".
 *
 * The listing pass pre-creates one badge per card in phase 1 (layout
 * stability) with the default status, then resolves every status with ONE
 * DB_GET_BULK. That read previously sat in a bare silent catch, so a rejected
 * read left ~200 cards showing "unwatched" badges and zero dims —
 * indistinguishable from a page of genuinely unseen videos (observed in a
 * real browser run as 0 dims where 30 were seeded, with the store keys proven
 * identical and DB_GET_BULK healthy on the same build). Pinned here:
 *  - one transient failure is retried, and the eventual answer wins;
 *  - an exhausted read leaves NO default badge behind (absence is honest, a
 *    fabricated verdict is not) and reports itself through the gated logger;
 *  - cards stay marked as processed, so withdrawing badges cannot re-arm the
 *    host-page MutationObserver into a read loop.
 *
 * `schedule`/`readWait` are injected — no animation frame, no sleeping.
 */

const CARD_BVIDS = {
  first: 'BV1111111111',
  second: 'BV2222222222',
  third: 'BV3333333333',
} as const;
const CARDS: string[] = Object.values(CARD_BVIDS);

function docWithCards(): Document {
  const dom = new JSDOM(
    `<div class="bili-feed4-layout">${CARDS.map(
      (id) =>
        `<div class="bili-video-card" data-bsb-bvid="${id}">` +
        `<div class="bili-video-card__cover">` +
        `<a class="bili-video-card__image--link" href="/video/${id}"></a></div>` +
        `</div>`,
    )}</div>`,
    { url: 'https://search.bilibili.com/all?keyword=x' },
  );
  return dom.window.document;
}

/** Frame callback runs on the next microtask: chunked writes, no rAF. */
function syncSchedule(): (task: () => void) => () => void {
  return (task: () => void) => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) task();
    });
    return () => {
      cancelled = true;
    };
  };
}

function captureWarn(): { lines: unknown[][]; restore: () => void } {
  const lines: unknown[][] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]): void => {
    lines.push(args);
  };
  configureLogging({ enabled: true, level: 'warn' });
  return {
    lines,
    restore: () => {
      console.warn = original;
      configureLogging({ enabled: false, level: 'info' });
    },
  };
}

test.describe('runListingDimmerPass — bulk read failure', () => {
  test('a read that succeeds on retry paints the real statuses (no stale defaults)', async () => {
    const doc = docWithCards();
    let attempts = 0;
    const cap = captureWarn();
    let result: Awaited<ReturnType<typeof runListingDimmerPass>>;
    try {
      result = await runListingDimmerPass({
        root: doc,
        storeName: 'bilibili_records',
        schedule: syncSchedule(),
        readWait: async () => {},
        dbGetBulk: async (_store, keys) => {
          attempts += 1;
          if (attempts === 1) throw new Error('Extension context invalidated');
          return keys
            .filter((key) => key === storeKey(CARD_BVIDS.first))
            .map((key) => ({ key, record: { status: 2, rating: 8 } }));
        },
      });
      expect(result.bulkReadOk).toBe(true);
      expect(attempts).toBeGreaterThan(1);
      expect(cap.lines).toHaveLength(0);
    } finally {
      cap.restore();
    }
    const first = doc.querySelector('.bili-video-card')!;
    expect(first.classList.contains(LISTING_DIMMER_CLASS)).toBe(true);
    expect(first.querySelector(`.${LISTING_BADGE_CLASS}`)!.textContent).toBe('已看 8');
    expect(doc.querySelectorAll(`.${LISTING_BADGE_CLASS}`).length).toBe(3);
    expect(result.dimmed).toBe(1);
  });

  test('an exhausted read leaves no default badge and no dim — and says why', async () => {
    const doc = docWithCards();
    let attempts = 0;
    const cap = captureWarn();
    let result: Awaited<ReturnType<typeof runListingDimmerPass>>;
    try {
      result = await runListingDimmerPass({
        root: doc,
        storeName: 'bilibili_records',
        schedule: syncSchedule(),
        readWait: async () => {},
        dbGetBulk: async () => {
          attempts += 1;
          throw new Error('background unreachable');
        },
      });
    } finally {
      cap.restore();
    }
    expect(result.bulkReadOk).toBe(false);
    expect(result.dimmed).toBe(0);
    expect(result.badgeHits).toBe(0);
    expect(result.withBvid).toBe(3);
    expect(attempts).toBeGreaterThan(1);
    // No card claims "unwatched": the phase-1 default badge is withdrawn.
    expect(doc.querySelectorAll(`.${LISTING_BADGE_CLASS}`).length).toBe(0);
    expect(doc.querySelectorAll(`.${LISTING_DIMMER_CLASS}`).length).toBe(0);
    // Cards stay accounted for, so the observer cannot loop on this batch.
    expect(doc.querySelectorAll(`[${LISTING_PROCESSED_ATTR}]`).length).toBe(3);
    const logged = cap.lines.map((line) => line.map((part) => String(part)).join(' '));
    expect(logged.some((line) => line.includes('DB_GET_BULK'))).toBe(true);
    expect(logged.some((line) => line.includes('background unreachable'))).toBe(true);
  });

  test('an answered read keeps every badge and costs exactly one message', async () => {
    const doc = docWithCards();
    let calls = 0;
    const result = await runListingDimmerPass({
      root: doc,
      storeName: 'bilibili_records',
      schedule: syncSchedule(),
      readWait: async () => {},
      dbGetBulk: async (_store, keys) => {
        calls += 1;
        return keys.map((key) => ({ key, record: { status: 1 } }));
      },
    });
    expect(calls).toBe(1);
    expect(result.bulkReadOk).toBe(true);
    expect(result.badgeHits).toBe(3);
    expect(doc.querySelectorAll(`.${LISTING_BADGE_CLASS}`).length).toBe(3);
    expect(doc.querySelector(`.${LISTING_BADGE_CLASS}`)!.textContent).toBe('想看');
  });
});

/**
 * Event-driven refresh and the delete direction (X32). A pass marks each row it
 * verdicted as processed, so without an invalidation hook an external record
 * write stays invisible until the host feed mutates — and because the update
 * loop used to ADD the dim class only and skip rows with no record, even a fresh
 * pass could not express "this record is gone".
 */
test.describe('事件驱动刷新与删除方向（X32）', () => {
  const pass = async (
    doc: Document,
    entries: Array<{ key: string; record: ListingRecordLike | null }>,
  ) =>
    runListingDimmerPass({
      root: doc,
      storeName: 'bilibili_records',
      schedule: syncSchedule(),
      readWait: async () => {},
      dbGetBulk: async () => entries,
    });

  test('脏化只落在事件键对应的行，无关键零脏化', async () => {
    const doc = docWithCards();
    await pass(doc, []);
    expect(doc.querySelectorAll(`[${LISTING_PROCESSED_ATTR}]`)).toHaveLength(3);

    expect(invalidateProcessedRows(doc, storeKey(CARD_BVIDS.second))).toBe(1);
    expect(doc.querySelectorAll(`[${LISTING_PROCESSED_ATTR}]`)).toHaveLength(2);
    expect(invalidateProcessedRows(doc, storeKey('BVNOPE1111111'))).toBe(0);
  });

  test('无键或 * 广播脏化全部行（批量写入 / 恢复形态）', async () => {
    const doc = docWithCards();
    await pass(doc, []);

    expect(invalidateProcessedRows(doc, '*')).toBe(3);
    expect(doc.querySelectorAll(`[${LISTING_PROCESSED_ATTR}]`)).toHaveLength(0);
    await pass(doc, []);
    expect(invalidateProcessedRows(doc, undefined)).toBe(3);
  });

  test('记录删除后重扫：淡化类被撤、徽章回到未看', async () => {
    const doc = docWithCards();
    const first = doc.querySelector('.bili-video-card')!;
    await pass(doc, [{ key: storeKey(CARD_BVIDS.first), record: { status: 2, rating: 8 } }]);
    expect(first.classList.contains(LISTING_DIMMER_CLASS)).toBe(true);
    expect(first.querySelector(`.${LISTING_BADGE_CLASS}`)!.textContent).toBe('已看 8');

    const result = await pass(doc, []); // still processed: nothing re-read
    expect(result.scanned).toBe(0);

    expect(invalidateProcessedRows(doc, storeKey(CARD_BVIDS.first))).toBe(1);
    const second = await pass(doc, []);
    expect(second.scanned).toBe(1);
    expect(first.classList.contains(LISTING_DIMMER_CLASS)).toBe(false);
    expect(first.querySelector(`.${LISTING_BADGE_CLASS}`)!.textContent).toBe('未看');
  });

  test('状态降到阈值以下同样撤淡化（不只删除）', async () => {
    const doc = docWithCards();
    const first = doc.querySelector('.bili-video-card')!;
    await pass(doc, [{ key: storeKey(CARD_BVIDS.first), record: { status: 2 } }]);
    expect(first.classList.contains(LISTING_DIMMER_CLASS)).toBe(true);

    invalidateProcessedRows(doc, storeKey(CARD_BVIDS.first));
    await pass(doc, [{ key: storeKey(CARD_BVIDS.first), record: { status: 1 } }]);
    expect(first.classList.contains(LISTING_DIMMER_CLASS)).toBe(false);
    expect(first.querySelector(`.${LISTING_BADGE_CLASS}`)!.textContent).toBe('想看');
  });
});
