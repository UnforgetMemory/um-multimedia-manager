/**
 * X13 #1 — PT Dimmer real-browser coverage (live re-dimming + jank budget).
 *
 * Handler choice: NexusPHP (`NexusPHPHandler` via SITE_CONFIGS host
 * `www.audiences.me`, see src/entrypoints/content/enhancers/pt/config/sites.ts)
 * instead of M-Team. Reasons: the NexusPHP list page is a static
 * `tbody > tr` table whose rows carry douban/imdb links directly — fully
 * deterministic from fixture HTML with zero SPA hydration, whereas
 * MTeamHandler.match needs `/browse` URLs or #root mutation auto-detect and
 * keeps instance-level TTL caches (mteam.ts), i.e. more moving parts to
 * fake. Rows here are matched by extractIdsFromRowLinks (douban subject id /
 * IMDb tt id in hrefs) against DB_GET_WATCHED_IDS of `douban_records` +
 * `imdb_records` (status==2 only, engine/database/record-query.ts).
 *
 * Proven chains:
 *  A) seeded watched records (DB_PUT via popup/extension page) → rows dim
 *     `.umm-dimmed` on the injection pass; non-matching rows stay clean;
 *     an EXTERNAL DB_PUT after load re-dims its row WITHOUT reload
 *     (broadcast → per-tab tabs leg → PTDimmer.onRecordChange → 300ms
 *     debounce → process with fresh id sets) — the dimmer-side regression
 *     proof for the ADR-015 / X12 two-leg event bus;
 *     while the 200-row chunked pass (NEXUSPHP_CHUNK_SIZE=20/frame) runs,
 *     no longtask may exceed the budget below;
 *  B) the frame-chunked marker-clear pass (clearResolvedMarkers →
 *     runChunked, CLEAR_CHUNK_SIZE=20) executes on a bulk
 *     `record:updated {key:'*'}` — the payload IMPORT_DATA really emits
 *     (background/handlers/data.ts:229) when the watched set is rewritten.
 *
 * Observability note for B: on THIS host the clear pass is not externally
 * observable in production — resolved markers (data-umm-resolved /
 * data-umm-mteam-resolved) are only written by the cache-fallback /
 * background-scan branch (nexusphp.ts:158, :225), which audiences.me never
 * reaches (config: enableBackgroundScan=false + direct row IDs → rows are
 * re-evaluated every round instead). Test B therefore seeds the real marker
 * attributes onto rows first (the state the scan path leaves behind on scan
 * sites), then drives the real producer; the clear → chunk-decay → re-dim
 * cycle exercised afterwards is 100% production code.
 */

import {
  DOUBAN_STORE,
  IMDB_STORE,
  expect,
  installPtMocks,
  makeStoreRecord,
  sendRuntimeMessage,
  test,
} from './fixtures/extension-harness';
import {
  PT_DOUBAN_WATCHED_ROWS,
  PT_IMDB_WATCHED_ROWS,
  makeE2ePtSubjects,
  nexusPhpTorrentsPageHtml,
  type PtSubject,
} from './fixtures/pt-list-page';
import {
  LONGTASK_INIT_SCRIPT,
  RAF_GAP_INIT_SCRIPT,
  armWriteBatchProbe,
  blockMainThread,
  readWriteBatches,
  readLongTasks,
  readRafGaps,
  requireVisiblePage,
} from './fixtures/overlay-probe';

const SUBJECTS = makeE2ePtSubjects();
const DOUBAN_WATCHED = SUBJECTS.slice(0, PT_DOUBAN_WATCHED_ROWS); // rows 0..19
const IMDB_WATCHED = SUBJECTS.slice(21, 21 + PT_IMDB_WATCHED_ROWS); // rows 21..30
const LIVE_ROW = SUBJECTS[20]!; // douban link, written externally after load

const PT_LIST_URL = 'https://www.audiences.me/torrents.php?tab=010101';
const MTM_RESOLVED_ATTR = 'data-umm-mteam-resolved';
const SEEDED_MARKERS = SUBJECTS.length;
const SEED_WATCHED = DOUBAN_WATCHED.length + IMDB_WATCHED.length; // 30

/**
 * Jank budget on the PROBE THAT MEASURES (X71).
 *
 * This spec used to assert on `PerformanceObserver('longtask')` durations.
 * X69's control experiment killed that: a deliberate 220 ms main-thread block
 * produced ZERO entries on the first read and a 55 ms entry afterwards — the
 * entries are delivered by a callback posted after the blocking task, and the
 * reported duration is not blocking time. An assertion that passes on an empty
 * list is not a budget.
 *
 * So the hard number is now the largest rAF gap (frames the main thread
 * literally could not paint), and the same run must SEE a deliberate
 * `blockMainThread` block or the spec reports "probe blind". The long-task list
 * stays as a diagnostic line only.
 *
 * MEASURED LIMIT OF THAT NUMBER (X71): collapsing `NEXUSPHP_CHUNK_SIZE` to
 * "write all 200 rows in one task" left the largest rAF gap at **34 ms** — the
 * same as the chunked build. A millisecond budget at this corpus therefore does
 * NOT catch "chunking switched off". The write-batch profile does (see (a′)):
 * each MutationObserver delivery is one task's writes, so a one-shot pass puts
 * all 30 dims into a single batch. The two legs are kept on purpose: (c) bounds
 * real blocking, (a′) proves the pass is actually spread over tasks.
 *
 * WHY the batch probe replaced a 5 ms level sampler (X71, measured): the sampler
 * read `0 → 30` on code that IS chunked at 20/frame — an interval can only see
 * an intermediate level if a tick happens to fall between two writes, so it
 * failed on correct code. And it replaced a rAF-frame bucket counter too: on the
 * bilibili fixture that counter attributed 200 chunked writes to ONE frame,
 * because an unobserved page gets its animation frames throttled. Task
 * attribution needs neither a sampling rate nor a frame clock.
 */
const GAP_BUDGET_MS = 150;
const CONTROL_BLOCK_MS = 300;
const CONTROL_FLOOR_MS = 200;

/**
 * Per-task write budget. `NEXUSPHP_CHUNK_SIZE` is 20, so a correct pass writes
 * ≤20 dims per task; 26 is that plus slack for two chunks whose records get
 * delivered in one checkpoint. A collapsed one-shot pass lands 30 here and goes
 * red — the exact mutation X71 measured the ms budget missing.
 */
const WRITES_PER_TASK_BUDGET = 26;

/**
 * Clear-pass bounds, measured this wave: the 200 seeded markers were removed in
 * exactly 10 deliveries of 20 (`CLEAR_CHUNK_SIZE` is 20 in dimmer/index.ts),
 * spanning 110 ms. 40 = 2× the chunk, tolerating one coalesced pair of chunks;
 * 4 batches = the expected 10 with 2.5× collapse room. A synchronous clear is
 * one delivery of 200 and is red on both legs.
 */
const CLEAR_WRITES_PER_TASK_BUDGET = 40;
const MIN_CLEAR_BATCHES = 4;

function doubanKey(s: PtSubject): string {
  return `movie::${s.doubanId}`;
}

function imdbKey(s: PtSubject): string {
  return `movie::${s.imdbId}`;
}

async function seedWatchedSet(extPage: import('@playwright/test').Page): Promise<void> {
  // Direct background writes (popup origin → SW → IndexedDB), before navigation.
  for (const s of DOUBAN_WATCHED) {
    const res = await sendRuntimeMessage(extPage, 'DB_PUT', {
      storeName: DOUBAN_STORE,
      key: doubanKey(s),
      record: makeStoreRecord(`https://movie.douban.com/subject/${s.doubanId}/`, 2, 8),
    });
    expect(res.success).toBe(true);
  }
  for (const s of IMDB_WATCHED) {
    const res = await sendRuntimeMessage(extPage, 'DB_PUT', {
      storeName: IMDB_STORE,
      key: imdbKey(s),
      record: makeStoreRecord(`https://www.imdb.com/title/${s.imdbId}/`, 2, 7),
    });
    expect(res.success).toBe(true);
  }
}

test('200-row NexusPHP list dims seeded rows, live re-dims an external write, stays under the longtask budget', async ({
  extContext,
  extPage,
}) => {
  await installPtMocks(extContext, { torrentsListHtml: nexusPhpTorrentsPageHtml(SUBJECTS) });
  await seedWatchedSet(extPage);

  const page = await extContext.newPage();
  // Timing and shape legs only mean anything on a rendering page.
  await requireVisiblePage(page);
  // Both probes must pre-date the injection pass → document_start init scripts.
  await page.addInitScript(LONGTASK_INIT_SCRIPT);
  await page.addInitScript(RAF_GAP_INIT_SCRIPT);
  await armWriteBatchProbe(page, { className: 'umm-dimmed' });
  await page.goto(PT_LIST_URL, { waitUntil: 'domcontentloaded' });

  // (a) exact dimming pattern: only the 30 seeded rows carry .umm-dimmed.
  const dimmed = page.locator('#torrents-body > tr.umm-dimmed');
  await expect(dimmed).toHaveCount(SEED_WATCHED, { timeout: 60_000 });
  await expect(page.locator('#torrent-row-0')).toHaveClass(/umm-dimmed/);
  await expect(page.locator('#torrent-row-25')).toHaveClass(/umm-dimmed/);
  await expect(page.locator('#torrent-row-20')).not.toHaveClass(/umm-dimmed/);
  await expect(page.locator('#torrent-row-100')).not.toHaveClass(/umm-dimmed/);
  // Direct-ID rows are re-evaluated every round: no resolved marker is ever
  // written on this host (see header note).
  await expect(page.locator('#torrents-body [data-umm-resolved]')).toHaveCount(0);

  // (a′) 分片真的摊开了：每条淡化的 class 写入按**MutationObserver 的投递批次**
  // 归桶 —— 一次投递就是一个任务写完的所有记录，所以批次大小＝单任务写入条数。
  // 只在初次写趟的窗口里读，之后的事件重算会往批次里加写入，把判据稀释掉。
  // 这也是毫秒预算抓不到的东西：实测把 chunkSize 调成一趟写完整表，最大帧间隙
  // 仍是 34ms（与分片同值），但全部写入会落进同一个批次。
  const probe = await readWriteBatches(page);
  expect(
    probe,
    'write-batch probe never armed → the chunking profile would be vacuous',
  ).not.toBeNull();
  const counts = probe?.counts ?? [];
  const totalWrites = probe?.total ?? 0;
  const worstBatch = counts.length > 0 ? Math.max(...counts) : 0;
  console.log(
    `[writes] 初次淡化 ${totalWrites} 次写入摊在 ${counts.length} 个任务批次里，` +
      `单批最多 ${worstBatch} 次（逐批 ${counts.join('/')}，跨时 ${String(probe?.windowMs ?? 0)}ms）`,
  );
  expect(totalWrites, 'the dim pass wrote nothing').toBeGreaterThanOrEqual(SEED_WATCHED);
  expect(
    counts.length,
    `全部淡化落在同一个任务批次（${counts.join('/')}）⇒ 分片已失效`,
  ).toBeGreaterThanOrEqual(2);
  expect(
    worstBatch,
    `单任务写入 ${worstBatch} 条，超过分片上限 ${WRITES_PER_TASK_BUDGET}`,
  ).toBeLessThanOrEqual(WRITES_PER_TASK_BUDGET);

  // (b) EXTERNAL write for a not-yet-dimmed row → live re-dim, no reload.
  const putRes = await sendRuntimeMessage(extPage, 'DB_PUT', {
    storeName: DOUBAN_STORE,
    key: doubanKey(LIVE_ROW),
    record: makeStoreRecord(`https://movie.douban.com/subject/${LIVE_ROW.doubanId}/`, 2, 9),
  });
  expect(putRes.success).toBe(true);
  await expect(dimmed).toHaveCount(SEED_WATCHED + 1, { timeout: 30_000 });
  await expect(page.locator('#torrent-row-20')).toHaveClass(/umm-dimmed/);

  // Shrink leg: DB_DELETE broadcasts record:deleted and the dimmer
  // re-evaluates — the row that carries a now-unwatched douban id must be
  // UN-dimmed (D1 fix: nexusphp direct-ID pass calls undimElement on a fresh
  // "not watched" verdict; previously dimElement only ever added the class).
  const delRes = await sendRuntimeMessage(extPage, 'DB_DELETE', {
    storeName: DOUBAN_STORE,
    key: doubanKey(LIVE_ROW),
  });
  expect(delRes.success).toBe(true);
  await expect
    .poll(
      async () => {
        const res = await sendRuntimeMessage(extPage, 'DB_GET', {
          storeName: DOUBAN_STORE,
          key: doubanKey(LIVE_ROW),
        });
        return res.record ? 'present' : 'gone';
      },
      { timeout: 15_000 },
    )
    .toBe('gone');
  // Let the debounce (300ms) + chunked re-evaluation round finish, then…
  await page.waitForTimeout(3_000);
  await expect(page.locator('#torrent-row-20')).not.toHaveClass(/umm-dimmed/); // un-dimmed (D1)
  // Sibling rows keep their dim — the clear is per-row verdict, not page-wide.
  await expect(page.locator('#torrent-row-0')).toHaveClass(/umm-dimmed/);
  await expect(dimmed).toHaveCount(SEED_WATCHED, { timeout: 30_000 });

  // (c) jank budget over the WHOLE run (injection pass + event re-runs).
  const tasks = await readLongTasks(page);
  const worstTask = tasks.length > 0 ? Math.max(...tasks) : 0;
  const gaps = await readRafGaps(page);
  const maxGap = gaps.length > 0 ? Math.max(...gaps) : 0;
  console.log(
    `[jank] 200-row run: ${String(gaps.length)} raf gaps max=${String(maxGap)}ms | ` +
      `${String(tasks.length)} longtasks max=${String(worstTask)}ms（诊断，不作预算）`,
  );
  expect(maxGap, `the dimmer run blocked painting for ${String(maxGap)}ms`).toBeLessThanOrEqual(
    GAP_BUDGET_MS,
  );

  // 正对照：同一次运行里真的占住主线程，记录器必须报出这个量级 —— 否则
  // 「没有长任务」与「没在测」长得一模一样。
  const before = (await readRafGaps(page)).length;
  await blockMainThread(page, CONTROL_BLOCK_MS);
  const after = await readRafGaps(page);
  const controlGaps = after.slice(before);
  const maxControlGap = controlGaps.length > 0 ? Math.max(...controlGaps) : 0;
  expect(
    maxControlGap,
    `probe blind: a ${String(CONTROL_BLOCK_MS)}ms block was recorded as ${String(maxControlGap)}ms`,
  ).toBeGreaterThanOrEqual(CONTROL_FLOOR_MS);
});

test('bulk record:updated (*) frame-chunk-clears 200 resolved markers (~20/frame) and re-dims from the imported set', async ({
  extContext,
  extPage,
}) => {
  await installPtMocks(extContext, { torrentsListHtml: nexusPhpTorrentsPageHtml(SUBJECTS) });

  const page = await extContext.newPage();
  await requireVisiblePage(page);
  // X71: this leg used to sample the remaining-marker count on a 5 ms interval
  // and require strictly-between levels. That sampler is fragile by
  // construction — it can only see an intermediate value if a tick happens to
  // fall between two chunks, and it flaked exactly that way on correct code
  // (60 s waitForFunction timeout) while the batch probe below reported this
  // page's chunks truthfully (20 then 10 in test 1). Delivery batches need no
  // luck: one delivery = one task's writes.
  await armWriteBatchProbe(page, { removedAttribute: MTM_RESOLVED_ATTR });
  await page.goto(PT_LIST_URL, { waitUntil: 'domcontentloaded' });
  // Ready signals: injectGlobalStyles ran (content.ts fullInit) + one tick of
  // slack for initRouter → PTDimmer.runFor to attach its event-bus subs.
  await expect(page.locator('#umm-global-styles')).toBeAttached({ timeout: 60_000 });
  await page.waitForTimeout(1_500);

  // Seed the marker state the cache/scan path leaves on scan sites.
  await page.evaluate((attr: string) => {
    for (const row of Array.from(document.querySelectorAll('#torrents-body > tr'))) {
      row.setAttribute(attr, 'true');
    }
  }, MTM_RESOLVED_ATTR);

  // Real producer of `record:updated { key: '*' }`: IMPORT_DATA rewrites the
  // watched set (clearAll + import + per-store '*' broadcast, data.ts:229).
  const doubanRecords: Record<string, unknown> = {};
  for (const s of SUBJECTS.slice(0, 21))
    doubanRecords[doubanKey(s)] = makeStoreRecord(s.name, 2, 8);
  const imdbRecords: Record<string, unknown> = {};
  for (const s of IMDB_WATCHED) imdbRecords[imdbKey(s)] = makeStoreRecord(s.name, 2, 7);
  const importRes = await sendRuntimeMessage(extPage, 'IMPORT_DATA', {
    schema: 'umm-export',
    version: 2,
    exportedAt: new Date().toISOString(),
    stores: { [DOUBAN_STORE]: doubanRecords, [IMDB_STORE]: imdbRecords },
  });
  expect(importRes.success).toBe(true);

  // Bulk event → 30 real dim writes + live dim of row 20 via the SAME event
  // path, no reload (21 douban + 10 imdb = 31).
  await expect(page.locator('#torrents-body > tr.umm-dimmed')).toHaveCount(31, {
    timeout: 60_000,
  });

  // Chunked clear ⇒ the 200 removals must be spread over several deliveries, and
  // no single task may carry more than CLEAR_CHUNK_SIZE plus slack. A
  // synchronous clear yields one batch holding the whole corpus → both legs red.
  const probe = await readWriteBatches(page);
  expect(
    probe,
    'write-batch probe never armed → the clear profile would be vacuous',
  ).not.toBeNull();
  const clearCounts = probe?.counts ?? [];
  const clearTotal = probe?.total ?? 0;
  const worstClearBatch = clearCounts.length > 0 ? Math.max(...clearCounts) : 0;
  console.log(
    `[chunk-clear] ${clearTotal} 次清除标记摊在 ${clearCounts.length} 个任务批次里，` +
      `单批最多 ${worstClearBatch}（逐批 ${clearCounts.slice(0, 25).join('/')}，` +
      `跨时 ${String(probe?.windowMs ?? 0)}ms）`,
  );
  expect(clearTotal, 'the clear pass removed nothing').toBeGreaterThanOrEqual(SEEDED_MARKERS);
  expect(
    clearCounts.length,
    `只有 ${clearCounts.length} 个清除批次（逐批 ${clearCounts.join('/')}）⇒ 分片已失效`,
  ).toBeGreaterThanOrEqual(MIN_CLEAR_BATCHES);
  expect(
    worstClearBatch,
    `单任务清除 ${worstClearBatch} 条，超过分片上限 ${CLEAR_WRITES_PER_TASK_BUDGET}`,
  ).toBeLessThanOrEqual(CLEAR_WRITES_PER_TASK_BUDGET);
  await expect(page.locator(`#torrents-body [${MTM_RESOLVED_ATTR}]`)).toHaveCount(0);
});
