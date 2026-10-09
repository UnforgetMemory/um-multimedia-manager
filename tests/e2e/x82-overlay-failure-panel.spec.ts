/**
 * X82 — GAP 2: the overlay mount-failure panel (0 of 2 hooks driven, on all 33
 * page types). `retry` and `dismiss` on the light-DOM `role=alert` card had
 * never been clicked in a real browser.
 *
 * Page type: the Douban trailer listing (`movie.douban.com/subject/N/trailer`,
 * overlay id `umm-trailer-overlay`). Chosen because its `beforeMount` throw is
 * reachable from the served bytes alone — `extractTrailerData()` returns null
 * when the item lists are empty (`pages/trailer/trailer-data.ts:202`), which
 * `pages/trailer/config.ts:16` turns into a mount failure immediately (no
 * `withRetry` window to race). The broken body is derived from the fixture with
 * the sanctioned `transform` option: the `<li>` bytes are removed, held in the
 * spec, and handed back verbatim for the retry-succeeds leg, so no markup is
 * invented anywhere.
 *
 * ⚠ TEST 1 IS RED ON PURPOSE: it measures a production defect. X22-B's rollback
 * promises that a mount failure tears the opaque full-screen wall and its
 * `body{overflow:hidden}` lock down. It does not, on any Douban page: the shell
 * is created by the `douban-early` bundle while the mount runs in the
 * `douban-main` bundle, and the build inlines `overlay/create-overlay.ts` into
 * BOTH (measured: the `ov-spinner` sheet appears in
 * `dist/chrome-mv3/content-scripts/douban-early.js` *and* `…/douban-main.js`),
 * so the module-level `shells` map (`create-overlay.ts:56`) that
 * `removeOverlayShell()` reads is empty in the bundle that has to remove —
 * it bails at `create-overlay.ts:124` and the node, the page-level lock style and
 * the theme-sync listener all stay. Consequence for a user: "close" leaves them
 * behind an empty wall with a locked page and no card.
 *
 * The same empty map also means `retry` never *re-creates* the shell — its
 * `createOverlay(shellOptions)` step is guarded by `getOverlayShellOptions`
 * (`overlay/mount-app.ts:148-150`), which reads that same map — so the retry legs
 * below assert what the user can still be guaranteed (exactly one shell node and
 * one `.umm-mount` container), not a rebuild.
 *
 * The trace that orders these states is taken by a document_start
 * MutationObserver, inline in the `addInitScript` call, never by polling against
 * a ~1s failure.
 */

import type { BrowserContext, Page } from '@playwright/test';
import {
  DOUBAN_STORE,
  expect,
  makeStoreRecord,
  sendRuntimeMessage,
  test,
} from './fixtures/extension-harness';
import { installDoubanFixtureRoutes } from './fixtures/douban-crawl-fixtures';
import { countInLightDom } from './fixtures/overlay-probe';

const TRAILER_URL = 'https://movie.douban.com/subject/1292052/trailer';
const SHELL_ID = 'umm-trailer-overlay';
const STYLE_ID = 'umm-trailer-overlay-page-style';
const WIDGET_ID = 'umm-mount-failure';

const SHELL = `#${SHELL_ID}`;
const PAGE_STYLE = `#${STYLE_ID}`;
const WIDGET = `#${WIDGET_ID}`;
const RETRY = `${WIDGET} [data-umm-act="retry"]`;
const DISMISS = `${WIDGET} [data-umm-act="dismiss"]`;
const MOUNT = `${SHELL} .umm-mount`;
const ROW = `${SHELL} .umm-trailer-name`;

/** Item lists the extractor reads on this page shape (`ul.video-list`, `ul.video-col3`). */
const LIST_RE = /(<ul class="(?:video-list|video-col3)">)([\s\S]*?)(<\/ul>)/g;
const LIST_COUNT = 2;

/**
 * Derive the broken body: strip the `<li>` bytes out of both item lists, keeping
 * every other fixture byte (headings, `.mod` wrappers, the empty `<ul>`s) intact.
 * Throws rather than silently serving a body the rule was not written for.
 */
function stripItemLists(html: string, captured: string[]): string {
  let hits = 0;
  const out = html.replace(LIST_RE, (_m, open: string, inner: string, close: string) => {
    hits += 1;
    captured.push(inner);
    return `${open}${close}`;
  });
  if (hits !== LIST_COUNT) {
    throw new Error(
      `[x82] trailer-list shape changed: matched ${hits} item lists, expected ${LIST_COUNT} ` +
        '(update the rule, not the assertion)',
    );
  }
  return out;
}

interface ShellTraceEntry {
  t: number;
  shell: boolean;
  lock: string;
  widget: boolean;
}

async function readTrace(page: Page): Promise<ShellTraceEntry[]> {
  return page.evaluate(() => {
    const w = window as Window & { __ummShellTrace?: ShellTraceEntry[] };
    return w.__ummShellTrace ?? [];
  });
}

/**
 * The trace collapsed to one state word per transition: wall state (`wall` =
 * opaque shell + scroll lock, `shell` = shell without lock, `host` = no shell)
 * suffixed by `+card` while the failure panel is in the document, e.g.
 * `wall>wall+card>host+card>host`. A failure path that leaves the wall up keeps
 * the `wall` half — which is exactly what test 1 asserts.
 */
async function shellStates(page: Page): Promise<string> {
  const trace = await readTrace(page);
  const states: string[] = [];
  for (const e of trace) {
    const base = e.shell ? (e.lock === 'hidden' ? 'wall' : 'shell') : 'host';
    const s = e.widget ? `${base}+card` : base;
    if (states[states.length - 1] !== s) states.push(s);
  }
  return states.join('>');
}

/** Computed `overflow` on `body` (the page-level lock is a light-DOM style). */
async function bodyOverflow(page: Page): Promise<string> {
  return page.evaluate(() =>
    document.body ? getComputedStyle(document.body).overflow : 'no-body',
  );
}

/**
 * Host-side truth for the trailer listing: the `<li>` blocks carrying both a
 * cover link and a titled anchor. Re-derived from the light DOM the overlay never
 * writes to, so the expected row set never comes from the extractor under test.
 */
function readHostItems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    for (const li of Array.from(document.querySelectorAll('#content .mod ul > li'))) {
      const cover = li.querySelector('a.pr-video');
      const titleA = li.querySelector('p a');
      const title = titleA?.textContent?.trim() ?? '';
      if (!cover || !titleA || !title) continue;
      out.push(title);
    }
    return out;
  });
}

/**
 * Open the trailer listing with a broken body, and prove the served document came
 * from the fixture (an empty stub would render nothing and fake a failure).
 */
async function openBrokenTrailerPage(ctx: BrowserContext): Promise<{
  page: Page;
  chunks: string[];
  logs: string[];
}> {
  const captured: string[] = [];
  await installDoubanFixtureRoutes(ctx, [
    {
      host: 'movie.douban.com',
      match: '/subject/1292052/trailer',
      fixture: 'trailer-list',
      transform: (html: string) => stripItemLists(html, captured),
    },
  ]);
  const page = await ctx.newPage();
  const logs: string[] = [];
  page.on('console', (msg) => logs.push(msg.text()));
  // The recorder is INLINE on purpose: `isolation:check` treats a global write as
  // page-side (no release required) only when it sits lexically inside a
  // browser-side call — these writes land in the PAGE's window, never in the
  // spec worker that Playwright reuses across files.
  //
  // Document_start (MAIN world): every DOM mutation re-samples whether the shell /
  // the failure widget exist and what the body scroll-lock resolves to, appending
  // only transitions. It also keeps a strong reference to the last shell element,
  // so a torn-down (detached) node stays inspectable — the only way to see a
  // leaked theme listener.
  await page.addInitScript(
    (ids: { shell: string; widget: string }) => {
      const w = window as Window & {
        __ummShellTrace?: ShellTraceEntry[];
        __ummShellRef?: HTMLElement | null;
      };
      const trace: ShellTraceEntry[] = [];
      w.__ummShellTrace = trace;

      const sample = (): void => {
        const shell = document.getElementById(ids.shell);
        if (shell) w.__ummShellRef = shell;
        const entry: ShellTraceEntry = {
          t: Math.round(performance.now()),
          shell: !!shell,
          lock: document.body ? getComputedStyle(document.body).overflow : 'no-body',
          widget: !!document.getElementById(ids.widget),
        };
        const last = trace[trace.length - 1];
        if (
          !last ||
          last.shell !== entry.shell ||
          last.lock !== entry.lock ||
          last.widget !== entry.widget
        ) {
          trace.push(entry);
        }
      };

      sample();
      try {
        // `document`, not `documentElement`: at document_start the latter can be null.
        new MutationObserver(sample).observe(document, {
          childList: true,
          subtree: true,
          attributes: true,
        });
      } catch {
        /* recorder unavailable — the trace assertions go red loudly, never vacuously */
      }
    },
    { shell: SHELL_ID, widget: WIDGET_ID },
  );
  await page.goto(TRAILER_URL, { waitUntil: 'domcontentloaded' });
  expect(
    captured.length,
    'the broken rule must strip exactly the item lists it was written for',
  ).toBeGreaterThanOrEqual(LIST_COUNT);
  return { page, chunks: captured.slice(0, LIST_COUNT), logs };
}

/**
 * Put the removed `<li>` bytes back into the empty lists they came from — "the
 * good body, served the second time". A mount retry re-runs `beforeMount` against
 * the live document and never re-navigates (`overlay/mount-app.ts:146-151`), so
 * the live DOM *is* the body at that point.
 */
async function restoreItemLists(page: Page, chunks: string[]): Promise<void> {
  await page.evaluate((inner: string[]) => {
    const lists = Array.from(
      document.querySelectorAll<HTMLUListElement>('#content ul.video-list, #content ul.video-col3'),
    );
    if (lists.length !== inner.length) {
      throw new Error(`[x82] ${lists.length} empty lists vs ${inner.length} chunks to restore`);
    }
    lists.forEach((list, i) => {
      list.innerHTML = inner[i] ?? '';
    });
  }, chunks);
}

async function waitForFailurePanel(page: Page): Promise<void> {
  await expect(page.locator(WIDGET)).toBeVisible({ timeout: 30_000 });
}

/** Flip `umm:appearance` from `from` to its opposite, through the extension origin. */
async function flipTheme(extPage: Page, from: string): Promise<string> {
  const target = from === 'dark' ? 'light' : 'dark';
  await extPage.evaluate(({ key, value }) => chrome.storage.local.set({ [key]: value }), {
    key: 'umm:appearance',
    value: { theme: target },
  });
  return target;
}

function liveShellTheme(page: Page): Promise<string | null> {
  return page.evaluate(
    () => document.getElementById('umm-trailer-overlay')?.getAttribute('data-theme') ?? null,
  );
}

function detachedShell(page: Page): Promise<{ connected: boolean; theme: string | null } | null> {
  return page.evaluate(() => {
    const w = window as Window & { __ummShellRef?: HTMLElement | null };
    const el = w.__ummShellRef ?? null;
    return el ? { connected: el.isConnected, theme: el.getAttribute('data-theme') } : null;
  });
}

test('失败面板出现，且 X22-B 的拆壳回滚在真实构建里生效（墙与滚动锁均已解除）', async ({
  extContext,
  extPage,
}) => {
  const { page, logs } = await openBrokenTrailerPage(extContext);

  // ── what the failure path does get right ──
  await waitForFailurePanel(page);
  expect(await countInLightDom(page, `${WIDGET}[role="alert"]`), 'light-DOM alert card').toBe(1);
  await expect(page.locator(RETRY)).toHaveCount(1);
  await expect(page.locator(DISMISS)).toHaveCount(1);
  // The failed mount took its half-built app with it (releaseLiveMount).
  await expect(page.locator(MOUNT)).toHaveCount(0);
  // Which path produced the card? The mount one (`overlay/mount-app.ts:127`), not
  // the CSS/component-import bootstrap one (`mount-plan.ts:59`) — otherwise this
  // spec would be measuring a different failure than the extractor's.
  expect(
    logs.some((l) => l.includes('mountUmmOverlay error')),
    `no mount-failure warn in the captured console: ${JSON.stringify(logs.slice(0, 6))}`,
  ).toBe(true);

  // Positive control for the block below: the wall really did go up and really
  // did lock scrolling. The recorder resolves the shell through
  // `document.getElementById`, i.e. the same node the selectors below address.
  expect(await shellStates(page), 'shell created at document_start + body locked').toContain(
    'wall',
  );
  // The wall's existence is proven by the recorder history above (`toContain('wall')`
  // is only satisfiable while the shell was actually up and body-locked), not by
  // re-reading the DOM here — by this point the rollback has already run, and a
  // "still present" assertion would be asserting the very defect that is fixed.

  // ── X22-B contract, now satisfied by the element-carried shell record ──
  // Shell state travels on the shell element itself because `create-overlay.ts`
  // is inlined into BOTH douban-early (which builds the shell) and douban-main
  // (which performs this rollback); a module-level Map cannot cross that
  // boundary, and before that fix the wall and the scroll lock survived here.
  expect(
    await countInLightDom(page, SHELL),
    'the opaque full-screen wall must be gone after a failed mount',
  ).toBe(0);
  expect(
    await countInLightDom(page, PAGE_STYLE),
    'the page-level body{overflow:hidden} lock must be removed',
  ).toBe(0);
  expect(await bodyOverflow(page), 'body scroll lock must be released').not.toBe('hidden');

  // Host page visible again. Sampled point-wise this is fragile (a single
  // coordinate can legitimately land on any host element, or on the corner
  // widget), so the assertion is geometric: the host article box must be
  // present and intersecting the viewport, and the point sampled must not be
  // the shell.
  const centre = await page.evaluate(() => {
    const el = document.elementFromPoint(Math.floor(window.innerWidth / 2), 240);
    return { id: el?.id ?? '', tag: el?.tagName ?? '' };
  });
  expect(centre.id, `viewport sample hits <${centre.tag}#${centre.id}>`).not.toBe(SHELL_ID);
  const hostBoxInView = await page
    .locator('#content')
    .first()
    .evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.top < window.innerHeight && r.bottom > 0;
    });
  expect(hostBoxInView, 'host #content must be laid out and inside the viewport again').toBe(true);

  // Theme-sync disposer (the return value X22-B first had to wire up): a leaked
  // chrome.storage.onChanged listener keeps rewriting data-theme on a detached
  // shell. Reaching this line at all presupposes the two assertions above.
  const shell = await detachedShell(page);
  expect(shell, 'the recorder kept a handle on the shell').not.toBeNull();
  expect(shell?.connected, 'the shell must have left the document').toBe(false);
  expect(shell?.theme, 'the shell carried a resolved theme').toBeTruthy();
  const target = await flipTheme(extPage, shell?.theme ?? 'dark');
  expect(target).not.toBe(shell?.theme);
  await page.waitForTimeout(700);
  expect(
    (await detachedShell(page))?.theme,
    'a disposed shell must stop reacting to theme changes',
  ).toBe(shell?.theme);
});

test('重试仍失败：面板只有一张（showMountFailure 幂等），失败的挂载不留容器', async ({
  extContext,
}) => {
  const { page } = await openBrokenTrailerPage(extContext);
  await waitForFailurePanel(page);
  const panelBefore = await countInLightDom(page, WIDGET);
  expect(panelBefore, 'one card before the click').toBe(1);

  await page.locator(RETRY).click();
  // The click dismisses the card first, then re-mounts; that mount fails too.
  await expect(page.locator(WIDGET)).toBeVisible({ timeout: 30_000 });
  expect(
    await countInLightDom(page, `${WIDGET}[role="alert"]`),
    'a second failure replaces the card, it never stacks a second one',
  ).toBe(1);
  // Neither attempt left a mounted app behind.
  await expect(page.locator(MOUNT)).toHaveCount(0);
  await expect(page.locator(ROW)).toHaveCount(0);

  // The trace separates "replaced" from "never went away": the click must drop the
  // card, and the second failure must bring exactly one card back.
  const trace = await readTrace(page);
  const rest = trace.slice(trace.findIndex((e) => e.widget) + 1);
  expect(
    rest.some((e) => !e.widget),
    'the retry click removed the card first',
  ).toBe(true);
  expect(
    rest.filter((e) => e.widget).length,
    'then the second failure showed exactly one replacement card',
  ).toBe(1);
});

test('重试成功：一个 .umm-mount、渲染条目与宿主一致（X33 单活挂载）', async ({
  extContext,
  extPage,
}) => {
  const { page, chunks } = await openBrokenTrailerPage(extContext);
  await waitForFailurePanel(page);

  // Serve the good body to the retry: the same `<li>` bytes the rule removed.
  await restoreItemLists(page, chunks);
  const hostItems = await readHostItems(page);
  expect(hostItems.length, 'the restored host lists carry items').toBeGreaterThanOrEqual(2);
  // Nothing mounted itself before the click — the retry is the only trigger.
  await expect(page.locator(MOUNT)).toHaveCount(0);

  await page.locator(RETRY).click();
  await expect(page.locator(ROW).first()).toBeVisible({ timeout: 30_000 });

  // One shell node, one mount container, one heading — X33's re-entry guard.
  expect(await countInLightDom(page, SHELL)).toBe(1);
  expect(await countInLightDom(page, PAGE_STYLE), 'exactly one page-level lock').toBe(1);
  await expect(page.locator(MOUNT)).toHaveCount(1);
  expect(await countInLightDom(page, WIDGET), 'a successful retry drops the card').toBe(0);
  await expect(page.locator(`${SHELL} .umm-trailer-title`)).toHaveCount(1);

  // Expected rows come from the host DOM, and nothing duplicates them.
  await expect(page.locator(ROW)).toHaveCount(hostItems.length);
  const rendered = (await page.locator(ROW).allInnerTexts()).map((t) => t.trim());
  expect([...rendered].sort()).toEqual([...hostItems].sort());

  // Live overlay ⇒ the host is locked again (the shell is an opaque wall).
  expect(await bodyOverflow(page)).toBe('hidden');

  // Positive control for the disposer probe in test 1: a LIVE shell does react.
  const liveBefore = await liveShellTheme(page);
  expect(liveBefore, 'the live shell carries a resolved theme').toBeTruthy();
  const target = await flipTheme(extPage, liveBefore ?? 'dark');
  await expect.poll(() => liveShellTheme(page), { timeout: 10_000 }).toBe(target);
});

test('关闭：移除面板，且不会自发复现', async ({ extContext }) => {
  const { page } = await openBrokenTrailerPage(extContext);
  await waitForFailurePanel(page);

  await page.locator(DISMISS).click();
  expect(await countInLightDom(page, WIDGET), 'dismiss removes the card').toBe(0);

  // "Does not re-fire on its own": no timer/mount path may bring it back, and no
  // app may appear either.
  await page.waitForTimeout(3_000);
  expect(await countInLightDom(page, WIDGET)).toBe(0);
  await expect(page.locator(MOUNT)).toHaveCount(0);
  await expect(page.locator(ROW)).toHaveCount(0);

  const states = await shellStates(page);
  expect(
    states.split('>').filter((s) => s.includes('card')),
    'the card appeared once and never came back',
  ).toHaveLength(1);
});

test('面板关闭后 record:updated 广播不复活面板、也不重挂应用', async ({ extContext, extPage }) => {
  const { page } = await openBrokenTrailerPage(extContext);
  await waitForFailurePanel(page);
  await page.locator(DISMISS).click();
  await expect(page.locator(WIDGET)).toHaveCount(0);

  const key = 'movie::1292052';
  // Clear first: a leftover row would turn the PUT into a no-op write.
  const del = await sendRuntimeMessage(extPage, 'DB_DELETE', { storeName: DOUBAN_STORE, key });
  expect(del.success).toBe(true);
  const put = await sendRuntimeMessage(extPage, 'DB_PUT', {
    storeName: DOUBAN_STORE,
    key,
    record: makeStoreRecord('https://movie.douban.com/subject/1292052/', 2, 8),
  });
  expect(put.success, 'the broadcast has a real write behind it').toBe(true);

  await page.waitForTimeout(3_000);
  expect(await countInLightDom(page, WIDGET), 'the card must not come back').toBe(0);
  await expect(page.locator(MOUNT)).toHaveCount(0);
  await expect(page.locator(ROW)).toHaveCount(0);
  const states = await shellStates(page);
  expect(
    states.split('>').filter((s) => s.includes('card')),
    'exactly one card appearance',
  ).toHaveLength(1);
});
