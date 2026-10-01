/**
 * X93 — the shared numeric paginator (`UmmPaginator`) across its consumer pages.
 *
 * `usePaginator` + `UmmPaginator` are used by seven Douban pages and, before this
 * wave, exactly ONE of them had ever been clicked (X55 on music-collect), and
 * even there the `prev` button was only ever asserted DISABLED — the branch that
 * actually navigates backwards had never run in a browser, and neither had the
 * ellipsis window (`totalPages > 7`).
 *
 * Expectations are read off each page's own host `.paginator` with the SAME
 * scoping the production parser uses (direct children only — `parseDoubanPaginator`
 * iterates `paginatorEl.children`), so this spec does not re-implement the
 * extractor and cannot pass against a mutated one.
 *
 * A deliberate divergence is pinned rather than smoothed over: `totalPages` comes
 * from the last VISIBLE numeric anchor, not from `.thispage[data-total-page]`.
 * On these fixtures the two disagree (e.g. window ends at 3, attribute says 101),
 * which is correct behaviour for a sliding window but means an assertion written
 * against the attribute would be red for the wrong reason. Each test therefore
 * derives the boundary from the window and says so.
 */

import type { BrowserContext, Page } from '@playwright/test';
import { expect, test } from './fixtures/extension-harness';
import {
  installDoubanFixtureRoutes,
  type DoubanFixtureRule,
} from './fixtures/douban-crawl-fixtures';

const OVERLAY = '#umm-douban-overlay';
const PAGER = `${OVERLAY} .umm-paginator`;
const PREV = 'button[aria-label="Previous page"]';
const NEXT = 'button[aria-label="Next page"]';

interface Target {
  name: string;
  url: string;
  rule: DoubanFixtureRule;
}

const TARGETS: Target[] = [
  {
    name: 'book-authors',
    url: 'https://book.douban.com/people/renji/authors',
    rule: { host: 'book.douban.com', match: '/people/renji/authors', fixture: 'book-authors' },
  },
  {
    name: 'book-collect',
    url: 'https://book.douban.com/people/unforgetmemory/collect?sort=time&status=finish',
    rule: {
      host: 'book.douban.com',
      match: '/people/unforgetmemory/collect',
      fixture: 'book-collect',
    },
  },
  {
    name: 'user-celebrities',
    url: 'https://movie.douban.com/people/xingxing/celebrities',
    rule: {
      host: 'movie.douban.com',
      match: '/people/xingxing/celebrities',
      fixture: 'user-celebrities',
    },
  },
  {
    name: 'user-media',
    url: 'https://movie.douban.com/people/xingxing/collect',
    rule: { host: 'movie.douban.com', match: '/people/xingxing/collect', fixture: 'user-media' },
  },
  {
    name: 'doulists-www',
    url: 'https://www.douban.com/people/1234567/doulists',
    rule: { host: 'www.douban.com', match: '/people/1234567/doulists', fixture: 'doulists-www' },
  },
];

interface HostPager {
  current: string;
  /** Every numeric label in the block — the `.thispage` span counts, because
   *  `parseDoubanPaginator` pushes it into `pageLinks` as the current entry. */
  labels: string[];
  /** Numeric anchors only (these are the ones that carry a destination). */
  anchors: { label: string; href: string }[];
  prev?: string;
  next?: string;
}

/** Oracle: the host's own paginator, scoped like `parseDoubanPaginator` (direct
 *  children), so prev/next anchors are not mistaken for page numbers. */
function readHostPager(page: Page): Promise<HostPager> {
  return page.evaluate(() => {
    const el = document.querySelector('.paginator');
    if (!el) return { current: '', labels: [], anchors: [] };
    const anchors: { label: string; href: string }[] = [];
    const labels: string[] = [];
    for (const child of Array.from(el.children)) {
      const text = (child.textContent ?? '').trim();
      if (child.tagName === 'SPAN' && (child as HTMLElement).className.includes('thispage')) {
        if (/^\d+$/.test(text)) labels.push(text);
        continue;
      }
      if (child.tagName !== 'A') continue;
      const href = (child as HTMLAnchorElement).href;
      if (/^\d+$/.test(text) && href) {
        labels.push(text);
        anchors.push({ label: text, href });
      }
    }
    return {
      current: el.querySelector('.thispage')?.textContent?.trim() ?? '',
      labels,
      anchors,
      prev: el.querySelector('.prev a')?.getAttribute('href') ?? undefined,
      next: el.querySelector('.next a')?.getAttribute('href') ?? undefined,
    };
  });
}

async function openPager(
  extContext: BrowserContext,
  t: Target,
  transform?: (html: string) => string,
): Promise<Page> {
  const rule = transform ? { ...t.rule, transform } : t.rule;
  await installDoubanFixtureRoutes(extContext, [rule]);
  const page = await extContext.newPage();
  await page.goto(t.url, { waitUntil: 'domcontentloaded' });
  await expect(page.locator(PAGER)).toBeVisible({ timeout: 60_000 });
  return page;
}

/** Replace the whole `.paginator` block; throws if the pattern did not match. */
function replacePaginator(html: string, inner: string): string {
  const re = /<div class="paginator">[\s\S]*?<\/div>/;
  if (!re.test(html)) throw new Error('[e2e] no .paginator block to replace');
  return html.replace(re, `<div class="paginator">${inner}</div>`);
}

test.describe('UmmPaginator 消费页（X83 缺口：7 页中仅 1 页被点过，prev/省略号从未走通）', () => {
  for (const t of TARGETS) {
    test(`${t.name}：激活页码、边界禁用态与页码跳转全部等于宿主分页器`, async ({ extContext }) => {
      const page = await openPager(extContext, t);
      const host = await readHostPager(page);
      expect(host.labels.length, `${t.name} 窗口只有一页，无从驱动翻页`).toBeGreaterThanOrEqual(2);
      expect(host.anchors.length, `${t.name} 窗口里没有带 href 的页码锚点`).toBeGreaterThanOrEqual(
        1,
      );
      expect(host.current, `${t.name} 夹具缺 .thispage`).not.toBe('');

      const pager = page.locator(PAGER);
      // Production reads `totalPages` as the LAST pageLink label (window order),
      // not `data-total-page` — mirrored here deliberately, see the header note.
      const totalFromWindow = Number(host.labels[host.labels.length - 1]);
      const current = Number(host.current);

      await expect(pager.locator('.umm-paginator-btn--active')).toHaveText(host.current);
      // Boundaries derived, not hardcoded: if a re-crawl lands on a different
      // page, the expectation follows the host instead of failing arbitrarily.
      const prev = pager.locator(PREV);
      const next = pager.locator(NEXT);
      if (current <= 1) await expect(prev, `第 ${current} 页时前页应禁用`).toBeDisabled();
      else await expect(prev, `第 ${current} 页时前页应可用`).toBeEnabled();
      if (current >= totalFromWindow)
        await expect(next, `窗口末页 ${totalFromWindow} 时后页应禁用`).toBeDisabled();
      else await expect(next, `未到窗口末页时后页应可用`).toBeEnabled();

      // The last window page: the furthest jump the host itself offers by number.
      const last = host.anchors[host.anchors.length - 1]!;
      await pager
        .locator('button', { hasText: new RegExp(`^${last.label}$`) })
        .first()
        .click();
      await expect(page).toHaveURL(last.href, { timeout: 30_000 });
    });
  }

  test('book-collect：每个数字页码各自跳向宿主为它列出的那条 URL', async ({ extContext }) => {
    const t = TARGETS.find((x) => x.name === 'book-collect')!;
    for (const label of ['2', '3']) {
      const page = await openPager(extContext, t);
      const host = await readHostPager(page);
      const entry = host.anchors.find((n) => n.label === label);
      expect(entry, `fixture lost its page-${label} anchor`).toBeTruthy();
      await page
        .locator(PAGER)
        .locator('button', { hasText: new RegExp(`^${label}$`) })
        .click();
      await expect(page).toHaveURL(entry!.href, { timeout: 30_000 });
      await page.close();
    }
  });

  // ── the branch no fixture ever reached: a MIDDLE page ────────────────────
  // Every crawled fixture sits on page 1, so `prev` was only ever observed
  // disabled and `onPageChange(page < current)` (the `prevPageUrl` fallback path)
  // never ran. Rebuilding the block as "page 2 of 3" drives both directions.
  test('中间页（改写夹具造出第 2/3 页）：前页与后页各自跳向宿主的 prev/next 链接', async ({
    extContext,
  }) => {
    const t = TARGETS.find((x) => x.name === 'book-authors')!;
    const asMiddle = (html: string): string =>
      replacePaginator(
        html,
        '<span class="prev"><a href="?start=0">&lt;前页</a></span>' +
          '<a href="?start=0">1</a>' +
          '<span class="thispage" data-total-page="3">2</span>' +
          '<a href="?start=50">3</a>' +
          '<span class="next"><a href="?start=50">后页&gt;</a></span>',
      );

    const base = await openPager(extContext, t, asMiddle);
    const host = await readHostPager(base);
    expect(host.current, '改写未生效：thispage 仍是 2 以外').toBe('2');
    expect(
      host.anchors.map((n) => n.label),
      '改写后的窗口页码不符',
    ).toEqual(['1', '3']);

    await expect(base.locator(`${PAGER} .umm-paginator-btn--active`)).toHaveText('2');
    // Both neighbours are reachable now — the two branches page 1 cannot exercise.
    await expect(base.locator(PAGER).locator(PREV)).toBeEnabled();
    await expect(base.locator(PAGER).locator(NEXT)).toBeEnabled();
    const prevHref = new URL(host.prev!, t.url).href;
    await base.locator(PAGER).locator(PREV).click();
    await expect(base).toHaveURL(prevHref, { timeout: 30_000 });
    await base.close();

    const again = await openPager(extContext, t, asMiddle);
    const host2 = await readHostPager(again);
    const nextHref = new URL(host2.next!, t.url).href;
    await again.locator(PAGER).locator(NEXT).click();
    await expect(again).toHaveURL(nextHref, { timeout: 30_000 });
    await again.close();
  });

  // ── the ellipsis window (`totalPages > 7`) ───────────────────────────────
  test('窗口超过 7 页时出现省略号，且首尾页码仍可点', async ({ extContext }) => {
    const t = TARGETS.find((x) => x.name === 'user-media')!;
    const wide = (html: string): string =>
      replacePaginator(
        html,
        '<span class="thispage" data-total-page="9">1</span>' +
          [2, 3, 4, 5, 6, 7, 8, 9]
            .map((n) => `<a href="?start=${(n - 1) * 25}">${n}</a>`)
            .join('') +
          '<span class="next"><a href="?start=25">后页&gt;</a></span>',
      );

    const page = await openPager(extContext, t, wide);
    const pager = page.locator(PAGER);
    await expect(pager.locator('.umm-paginator-ellipsis')).toHaveCount(1);
    // 1 … 2 3 4 5 … 9  → the window is narrower than the 9 anchors the host lists.
    const labels = await pager.locator('.umm-paginator-btn').allInnerTexts();
    expect(labels.length, `窗口未收窄：${labels.join(',')}`).toBeLessThan(9);
    expect(labels.map((l) => l.trim())).toContain('9');

    const host = await readHostPager(page);
    const nine = host.anchors.find((n) => n.label === '9');
    expect(nine, '改写后的第 9 页锚点丢失').toBeTruthy();
    await pager.locator('button', { hasText: /^9$/ }).click();
    await expect(page).toHaveURL(nine!.href, { timeout: 30_000 });
  });

  // ── the gate in front of navigation ──────────────────────────────────────
  // `onPageChange` only follows a link that `isSafeDoubanUrl` accepts. No natural
  // fixture exercises that (every crawled href is same-site), so the gate is
  // poisoned here: one page number points off-site, the other stays on-site. If
  // the gate were widened to "always allow", the first click navigates; if it
  // were narrowed to "allow nothing", the second one fails.
  //
  // The off-site host MUST be stubbed: the fixture installer only routes
  // *.douban.com / *.doubanio.com, so an unstubbed `evil.example` navigation
  // would hang on DNS and a fixed sleep would "pass" while the gate was wide
  // open. With an instant local answer, a followed link commits within a frame.
  test('宿主分页链接指向站外时不跳转，站内那条仍可跳', async ({ extContext }) => {
    const t = TARGETS.find((x) => x.name === 'book-collect')!;
    const poisoned = (html: string): string =>
      replacePaginator(
        html,
        '<span class="prev"><a href="?sort=time&amp;status=finish&amp;start=0">前页</a></span>' +
          '<span class="thispage" data-total-page="6">1</span>' +
          '<a href="https://evil.example/?start=25">2</a>' +
          '<a href="?sort=time&amp;status=finish&amp;start=50">3</a>' +
          '<span class="next"><a href="?sort=time&amp;status=finish&amp;start=25">下一页&gt;</a></span>',
      );

    const page = await openPager(extContext, t, poisoned);
    await extContext.route(
      '**evil.example**',
      (route) =>
        void route.fulfill({ status: 200, contentType: 'text/html', body: '<html>ESCAPED</html>' }),
    );
    const before = page.url();
    await page.locator(PAGER).locator('button', { hasText: /^2$/ }).click();
    // Poll the URL rather than sleeping once: the negative must be observed over
    // a window in which a real navigation would certainly have committed.
    await expect
      .poll(() => page.url(), {
        message: '站外分页链接被跟进了（isSafeDoubanUrl 门失效）',
        timeout: 3_000,
        intervals: [50, 100, 250],
      })
      .toBe(before);

    const host = await readHostPager(page);
    const three = host.anchors.find((n) => n.label === '3');
    expect(three, '改写丢了第 3 页锚点').toBeTruthy();
    await page.locator(PAGER).locator('button', { hasText: /^3$/ }).click();
    await expect(page).toHaveURL(three!.href, { timeout: 30_000 });
  });

  // ── the total-source divergence, actually discriminated ──────────────────
  // `usePaginator.totalPages` reads the LAST WINDOW LABEL, not
  // `.thispage[data-total-page]`. Every natural fixture sits on page 1, where
  // both derivations leave `next` enabled — so those fixtures cannot tell the
  // two apart (measured: switching the source keeps them green). On the last
  // window page with a LARGER attribute the two disagree: window says "stop",
  // attribute says "keep going". This is the case that pins the choice.
  test('末页且 data-total-page 更大时，后页按窗口末页禁用', async ({ extContext }) => {
    const t = TARGETS.find((x) => x.name === 'user-media')!;
    const lastOfWindow = (html: string): string =>
      replacePaginator(
        html,
        '<span class="prev"><a href="?start=0">&lt;前页</a></span>' +
          '<a href="?start=0">1</a>' +
          '<a href="?start=25">2</a>' +
          '<span class="thispage" data-total-page="101">3</span>' +
          '<span class="next"><a href="?start=50">后页&gt;</a></span>',
      );

    const page = await openPager(extContext, t, lastOfWindow);
    const host = await readHostPager(page);
    // Premise: the two sources really disagree here, else the assertion below is
    // once again unfalsifiable.
    expect(host.current, '改写未生效：thispage 不是 3').toBe('3');
    const windowLast = Number(host.labels[host.labels.length - 1]);
    const attrTotal = await page.evaluate(() =>
      Number(document.querySelector('.thispage')?.getAttribute('data-total-page') ?? '0'),
    );
    expect(windowLast, '窗口末页不是 3').toBe(3);
    expect(attrTotal > windowLast, '两个总数来源在此例并不冲突').toBe(true);

    await expect(page.locator(PAGER).locator(NEXT), '窗口末页时后页应禁用').toBeDisabled();
    await expect(page.locator(PAGER).locator(PREV), '非首页时前页应可用').toBeEnabled();
  });

  // ── the auto-hide rule, as a fact about this fixture ─────────────────────
  // game-collect's host paginator lists ONE numeric page (its `data-total-page`
  // is 1 too) while also carrying a stray `.next` anchor. The component hides
  // itself at `totalPages <= 1`, so the correct outcome is no pager at all.
  // NOTE: because both total sources agree here, this case does NOT discriminate
  // them — the dedicated 末页 case above is what pins that choice.
  test('game-collect：窗口只有一页时整个分页器不渲染（宿主仍留着一条 next 锚点）', async ({
    extContext,
  }) => {
    const t: Target = {
      name: 'game-collect',
      url: 'https://www.douban.com/people/unforgetmemory/games?action=collect',
      rule: {
        host: 'www.douban.com',
        match: '/people/unforgetmemory/games',
        fixture: 'game-collect',
      },
    };
    await installDoubanFixtureRoutes(extContext, [t.rule]);
    const page = await extContext.newPage();
    await page.goto(t.url, { waitUntil: 'domcontentloaded' });
    await expect(page.locator(`${OVERLAY} .umm-trailer-card, ${OVERLAY} .umm-mount`)).toBeVisible({
      timeout: 60_000,
    });
    const host = await readHostPager(page);
    expect(host.labels.length, '夹具变了：game-collect 窗口不再只有一页').toBe(1);
    expect(
      await page.evaluate(() => !!document.querySelector('.paginator .next a')),
      '夹具丢了那条 next 锚点，本例的前提不再成立',
    ).toBe(true);
    await expect(page.locator(PAGER)).toHaveCount(0);
  });
});
