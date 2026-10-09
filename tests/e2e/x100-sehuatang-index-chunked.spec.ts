/**
 * X100 — the Sehuatang index overlay builds its partitions through `runChunked`.
 *
 * Why this page: unlike the list page (bounded by the host's per-page thread
 * count), the index renders EVERY Discuz category the site publishes, each with
 * its sub-forum cards — hundreds of containers, thousands of nodes — and it used
 * to build and mount all of them inside one synchronous pass, so parsing plus
 * style/layout all landed in the same frame.
 *
 * Instrumented claim (SHAPE, not milliseconds): the partitions after the first
 * arrive in several mutation deliveries, none of which carries the corpus.
 * Measured on a visible page — a backgrounded tab coalesces animation frames and
 * would report one big delivery (see the note in fixtures/overlay-probe), so
 * `requireVisiblePage` is a premise and `readWriteBatches` re-checks visibility at
 * read time, throwing rather than returning collapsed data.
 *
 * Deliberate asymmetry, pinned so nobody "fixes" it blind: the FIRST partition
 * rides into the shadow root together with the shell, and a childList record lists
 * only the appended node (the shell), not its descendants — so the framer counts
 * `CATEGORY_COUNT - 1`, not `CATEGORY_COUNT`. Completeness is asserted separately,
 * from the DOM, which sees all 12.
 *
 * That total is therefore NOT the discriminating leg, and the mutation run proved
 * it: a pass that writes all 11 deferred partitions in one post-mount sweep also
 * totals 11 — it is `counts.length >= 2` (plus the per-delivery bound) that goes
 * red there. The total only proves the framer is attached and sees every write.
 *
 * Not policed here: how long any frame took (a 12-partition pass runs in tens of
 * milliseconds, far below what a millisecond budget can discriminate — X71
 * measured that deadness on the bilibili leg).
 *
 * The entrance leg DOES pin the per-chunk `runVisibleEntrance(section)` call, and
 * that was established by mutation rather than argument: deleting that one line
 * reddens the biconditional ("a card carries `.umm-sht-enter` iff its rect
 * intersects the viewport"), because with 12 sections the first several deliveries
 * land inside the viewport. The narrowing of the helper's ROOT (section instead of
 * the whole shell) is the part that stays unobservable — a rescan-cost saving with
 * identical output.
 *
 * Four tests, not one: each leg owns its own page, so a mutation reds exactly one
 * of them. A single test stops at its first failed assertion and masks every later
 * leg, which is fatal for per-mutation attribution.
 */

import { expect, test } from './fixtures/extension-harness';
import type { BrowserContext, Page } from '@playwright/test';
import { installSehuatangMocks, waitForBackgroundReady } from './fixtures/host-mocks';
import {
  armShadowWriteBatchProbe,
  probeOverlay,
  readWriteBatches,
  requireVisiblePage,
} from './fixtures/overlay-probe';
import { sehuatangIndexWideHtml } from './fixtures/sehuatang-page';

const INDEX_URL = 'https://www.sehuatang.net/';
const OVERLAY_ID = 'umm-sht-overlay';
const SECTION_CLASS = 'umm-sht-home-section';
const CATEGORY_COUNT = 12;

/** Card names the fixture must produce, derived from its numbering rule. */
const EXPECTED_CARDS = Array.from({ length: CATEGORY_COUNT }, (_, i) => [
  `版A-${i + 1}`,
  `版B-${i + 1}`,
]).flat();

/** Open the wide index with the delivery framer armed before navigation. */
async function openWideIndex(extContext: BrowserContext, extPage: Page): Promise<Page> {
  await installSehuatangMocks(extContext, { indexHtml: sehuatangIndexWideHtml(CATEGORY_COUNT) });
  await waitForBackgroundReady(extPage);

  const page = await extContext.newPage();
  await requireVisiblePage(page);
  await armShadowWriteBatchProbe(page, { hostId: OVERLAY_ID, createdClass: SECTION_CLASS });
  await page.goto(INDEX_URL, { waitUntil: 'domcontentloaded' });

  // Completeness premise for every leg: the tail must arrive even though the
  // first partition is synchronous.
  await expect
    .poll(
      async () => {
        const probe = await probeOverlay(page, OVERLAY_ID);
        return probe.home.sections;
      },
      { timeout: 60_000, message: '分区没有全部渲染出来' },
    )
    .toBe(CATEGORY_COUNT);
  return page;
}

test('12 个分区全部落位，且子版块顺序就是提取顺序', async ({ extContext, extPage }) => {
  const page = await openWideIndex(extContext, extPage);
  const probe = await probeOverlay(page, OVERLAY_ID);

  expect(probe.home.sections, '分区数与夹具不一致').toBe(CATEGORY_COUNT);
  expect(probe.home.cardNames, '分区或子版块顺序与提取顺序不一致').toEqual(EXPECTED_CARDS);
  // The navigation layer must not run list-page machinery.
  expect(probe.gridPresent).toBe(false);
  await page.close();
});

test('分区按帧到达：没有任何一次投递带走大半个语料', async ({ extContext, extPage }) => {
  const page = await openWideIndex(extContext, extPage);
  const batches = await readWriteBatches(page);
  expect(batches, '写趟探针没接上（shadow 根不可读或 host 没出现）').not.toBeNull();

  expect(
    batches!.total,
    '按帧追加的分区数不等于 CATEGORY_COUNT - 1（首个随壳 mount，探针看不见后代）',
  ).toBe(CATEGORY_COUNT - 1);
  expect(
    batches!.counts.length,
    '分区只在一次投递里到齐（分片被关掉就是一趟全量）',
  ).toBeGreaterThanOrEqual(2);
  expect(Math.max(...batches!.counts), '某一次投递带走了大半个语料').toBeLessThanOrEqual(6);
  await page.close();
});

test('延迟插入落在灵动岛之前：岛仍是壳的最后一个子节点', async ({ extContext, extPage }) => {
  const page = await openWideIndex(extContext, extPage);
  const lastChild = await page.evaluate(
    ({ id, shellSel }) => {
      const root = document.getElementById(id)?.shadowRoot ?? null;
      const shell = root?.querySelector<HTMLElement>(shellSel);
      return shell?.lastElementChild?.id ?? 'no-shell';
    },
    { id: OVERLAY_ID, shellSel: '.umm-sht-shell' },
  );
  expect(lastChild, '灵动岛不再垫在最后（插入锚点丢了）').toBe('umm-sht-floatbar');
  await page.close();
});

test('入场类与视口严格一致：卡片拿到 enter 类当且仅当它落在视口内', async ({
  extContext,
  extPage,
}) => {
  const page = await openWideIndex(extContext, extPage);

  // The helper writes the class at insert time, so the comparison must happen on
  // a settled layout — otherwise a late image could move a card after it was
  // judged and this leg would report a product bug that is only a race.
  await page.waitForFunction(
    ({ id }) => {
      const root = document.getElementById(id)?.shadowRoot ?? null;
      const imgs = Array.from(root?.querySelectorAll<HTMLImageElement>('img') ?? []);
      return imgs.every((i) => i.complete);
    },
    { id: OVERLAY_ID },
    { timeout: 15_000 },
  );

  const audit = await page.evaluate(
    ({ id, cls }) => {
      const root = document.getElementById(id)?.shadowRoot ?? null;
      const sections = Array.from(root?.querySelectorAll<HTMLElement>(`.${cls}`) ?? []);
      const cards = sections.flatMap((s) =>
        Array.from(s.querySelectorAll<HTMLElement>('.umm-card')),
      );
      const vh = window.innerHeight;
      return {
        sections: sections.length,
        cards: cards.map((c) => {
          const r = c.getBoundingClientRect();
          return {
            enter: c.classList.contains('umm-sht-enter'),
            visible: r.top < vh && r.bottom > 0,
          };
        }),
      };
    },
    { id: OVERLAY_ID, cls: SECTION_CLASS },
  );

  expect(audit.sections, '分区数与夹具不一致，前置就崩了').toBe(CATEGORY_COUNT);
  // Positive premise: a vacuous zero was the exact hole here — with no cards the
  // "every card matches its viewport state" check passes silently.
  expect(audit.cards.length, '子版块卡片数不等于分区数 × 2').toBe(CATEGORY_COUNT * 2);

  const visible = audit.cards.filter((c) => c.visible).length;
  expect(visible, '视口内一张卡片都没有（首屏没建卡或窗口太窄）').toBeGreaterThan(0);
  expect(visible, '全部卡片都在视口内：双向判据会退化成单向').toBeLessThan(audit.cards.length);

  const mismatched = audit.cards.filter((c) => c.enter !== c.visible);
  expect(mismatched.length, '入场类与视口不相符（入场调用断了，或逐分区那次调用丢了）').toBe(0);
  await page.close();
});
