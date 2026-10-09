/**
 * X72 — the Bangumi browse-list marking pass measured, not assumed.
 *
 * Why this one: the revisit audit (`docs/audit/umpp-revisit-audit-2026-09-26.md`
 * §10 row 9) concluded that every host-scale write already goes through
 * `runChunked`. Static re-check said otherwise — `handlers/bangumi-list.ts` used
 * to do `li.appendChild(marker)` per row in one pass (`markCard`), which is
 * precisely the "宿主节点批量 append" shape that row names as the risk criterion.
 * **2026-09-30 X81 余面**：该循环已改 `runChunked(..., { chunkSize: 10 })`，
 * 本 spec 从「测量后再决定是否分片」转为「分片后的写趟形状仍有界」的回归钉。
 *
 * Same discipline as X69 (JavDB): measure before touching. The audit's own
 * judgement rule is "risk = batch append onto host nodes, or writes interleaved
 * with geometry reads", and whether that costs frames can only be answered in a
 * real browser — so this spec pins the number with the X71 instruments
 * (write-batch shape + largest rAF gap + positive control).
 *
 * Corpus is deliberately beyond the real page (200 rows vs ~30 per bangumi
 * browse page): a pass that stays inside budget at 200 has headroom at 30.
 */

import { expect, test } from './fixtures/extension-harness';
import {
  BANGUMI_STORE,
  installBangumiMocks,
  seedRecord,
  waitForBackgroundReady,
} from './fixtures/host-mocks';
import {
  RAF_GAP_INIT_SCRIPT,
  armWriteBatchProbe,
  blockMainThread,
  readRafGaps,
  readWriteBatches,
  requireVisiblePage,
} from './fixtures/overlay-probe';
import { bangumiBrowserListHtml, type BangumiListItem } from './fixtures/bangumi-page';

const LIST_URL = 'https://bangumi.tv/anime/browser';
const MARKER_CLASS = 'umm-list-status';
const TOTAL = 200;
/** Statuses the marking loop must render distinctly, beyond the volume probe. */
const SEEDED = [
  { subjectId: '9000001', status: 2, rating: 8 },
  { subjectId: '9000002', status: 1, rating: 0 },
  { subjectId: '9000003', status: 3, rating: 6.5 },
];

const ITEMS: BangumiListItem[] = Array.from({ length: TOTAL }, (_, i) => {
  const seeded = SEEDED.find((s) => s.subjectId === String(9000001 + i));
  return {
    subjectId: String(8000000 + i),
    title: `E2E 条目 ${String(i + 1)}`,
    status: seeded ? seeded.status : null,
    rating: seeded ? seeded.rating : 0,
  };
});
const HTML = bangumiBrowserListHtml([
  ...ITEMS,
  ...SEEDED.map((s) => ({
    subjectId: s.subjectId,
    title: `E2E 已记录 ${s.subjectId}`,
    status: s.status,
    rating: s.rating,
  })),
]);

/**
 * Provisional: set from measurement, budget stays below the point where a
 * 200-row pass would drop multiple frames (see the printed number and the
 * X71 wave's measured bands: 1 000 host cards cost 48-57 ms chunked).
 */
const GAP_BUDGET_MS = 150;
const CONTROL_BLOCK_MS = 300;
const CONTROL_FLOOR_MS = 200;

test('200 行 Bangumi 浏览列表的标记写趟：帧间隙有界，且探针自证可见 300ms 阻塞', async ({
  extContext,
  extPage,
}) => {
  await installBangumiMocks(extContext, { browserListHtml: HTML });
  for (const s of SEEDED) {
    const res = await seedRecord(
      extPage,
      BANGUMI_STORE,
      `tv::${s.subjectId}`,
      `https://bangumi.tv/subject/${s.subjectId}/`,
      s.status,
      s.rating,
    );
    expect(res.success, `seed ${s.subjectId} failed`).toBe(true);
  }
  await waitForBackgroundReady(extPage, BANGUMI_STORE);

  const page = await extContext.newPage();
  await requireVisiblePage(page);
  await page.addInitScript(RAF_GAP_INIT_SCRIPT);
  await armWriteBatchProbe(page, { createdClass: MARKER_CLASS });
  await page.goto(LIST_URL, { waitUntil: 'domcontentloaded' });

  // The whole corpus really got marked — "no jank" measured on a page nobody
  // processed would be worth nothing.
  await expect(page.locator(`.${MARKER_CLASS}`)).toHaveCount(TOTAL + SEEDED.length, {
    timeout: 60_000,
  });

  const probe = await readWriteBatches(page);
  expect(probe, 'write-batch probe never armed → the shape would be vacuous').not.toBeNull();
  const counts = probe?.counts ?? [];
  const worstBatch = counts.length > 0 ? Math.max(...counts) : 0;
  console.log(
    `[writes] ${String(probe?.total ?? 0)} 个标记 append 摊在 ${counts.length} 个投递批次里，` +
      `单批最多 ${worstBatch}（逐批 ${counts.slice(0, 25).join('/')}，跨时 ${String(probe?.windowMs ?? 0)}ms）`,
  );
  expect(
    probe?.total ?? 0,
    'the probe saw fewer appended markers than the DOM carries',
  ).toBeGreaterThanOrEqual(TOTAL);

  const gaps = await readRafGaps(page);
  const maxGap = gaps.length > 0 ? Math.max(...gaps) : 0;
  console.log(
    `[x72] ${TOTAL} 行写趟实测最大帧间隙 ${String(maxGap)}ms / 预算 ${String(GAP_BUDGET_MS)}ms（样本 ${String(gaps.length)}）`,
  );
  expect(maxGap, `the marking pass blocked painting for ${String(maxGap)}ms`).toBeLessThanOrEqual(
    GAP_BUDGET_MS,
  );

  // 正对照：同一次运行里真的占住主线程，记录器必须报出这个量级。
  const before = (await readRafGaps(page)).length;
  await blockMainThread(page, CONTROL_BLOCK_MS);
  const controlGaps = (await readRafGaps(page)).slice(before);
  const maxControlGap = controlGaps.length > 0 ? Math.max(...controlGaps) : 0;
  expect(
    maxControlGap,
    `probe blind: a ${String(CONTROL_BLOCK_MS)}ms block was recorded as ${String(maxControlGap)}ms`,
  ).toBeGreaterThanOrEqual(CONTROL_FLOOR_MS);

  await page.close();
});
