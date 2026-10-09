/**
 * X50 — the personage-creations filter surface (7 click sites: 3 type tabs, 3
 * sort buttons, role chips, plus the poster/title pair that both open one
 * creation).
 *
 * `x41` covered this page's paginator (no 前页 on page 1, and the next cursor
 * equal to the host's own link). What was untested is the part most likely to be
 * written wrong during a refactor: `filterUrl` must **preserve the other
 * dimensions** and **drop the pagination cursor** — losing `start` is the
 * documented behaviour, but silently losing `sortby`/`type`/`role` would flip
 * the user back to a default view while looking like a successful filter click.
 *
 * Creation-card assertions are paired against the host DOM: the overlay may only
 * open a subject URL that the host page itself lists under that title.
 */

import { expect, test } from './fixtures/extension-harness';
import { openDoubanFixturePage, type DoubanFixtureRule } from './fixtures/douban-crawl-fixtures';

const OVERLAY = '#umm-personage-overlay';
const BASE = 'https://www.douban.com/personage/90000001/creations';
const START_URL = `${BASE}?type=filmmaker&sortby=time&start=30`;

const RULE: DoubanFixtureRule = {
  host: 'www.douban.com',
  match: '/personage/90000001/creations',
  fixture: 'personage-creations',
};

async function openCreations(extContext: Parameters<typeof openDoubanFixturePage>[0]) {
  const page = await openDoubanFixturePage(extContext, RULE, START_URL, {
    shell: 'umm-personage-overlay',
  });
  await expect(page.locator(`${OVERLAY} .umm-creations-tab`).first()).toBeVisible({
    timeout: 60_000,
  });
  return page;
}

/**
 * Clicks, then waits for a popup whose URL stops changing.
 *
 * A bare `waitForEvent('page')` resolves on the FIRST page object the context
 * reports — which may be a popup still landing from a previous case (this suite
 * shares one persistent browser context), or the same tab before its navigation
 * commits. Collecting and polling makes each case independent of run order.
 */
async function clickAndReadPopup(
  extContext: Parameters<typeof openDoubanFixturePage>[0],
  locator: import('@playwright/test').Locator,
  page: import('@playwright/test').Page,
): Promise<string> {
  const opened: import('@playwright/test').Page[] = [];
  const collect = (candidate: import('@playwright/test').Page): void => {
    opened.push(candidate);
  };
  extContext.on('page', collect);
  const known = new Set(extContext.pages());
  const before = page.url();
  await locator.click();
  try {
    await expect
      .poll(
        async () => {
          const fresh = opened.filter((p) => !known.has(p) && p.url() !== 'about:blank');
          return fresh[0]?.url() ?? '';
        },
        { timeout: 30_000, message: 'no popup with a committed URL appeared' },
      )
      .not.toBe('');
    const fresh = opened.filter((p) => !known.has(p) && p.url() !== 'about:blank');
    const url = fresh[0]?.url() ?? '';
    expect(url, 'the click must not navigate the page under test instead').not.toBe(before);
    for (const extra of fresh) await extra.close();
    return url;
  } finally {
    extContext.off('page', collect);
  }
}

test('类型页签：换 type 时保留 sortby 与 role 语义，并丢弃 start 游标', async ({ extContext }) => {
  const page = await openCreations(extContext);
  const tabs = page.locator(`${OVERLAY} .umm-creations-tab`);
  expect(await tabs.count(), 'three type tabs expected').toBe(3);

  // The active tab must reflect the URL we arrived with, not a constant.
  // Asserted by identity/index, not label text: tab labels are UMM chrome
  // resolved through content i18n, and this suite does not pin the overlay
  // locale (same reason the sort buttons below are index-asserted).
  await expect(page.locator(`${OVERLAY} .umm-creations-tab--active`)).toHaveCount(1);
  await expect(tabs.nth(0)).toHaveClass(/umm-creations-tab--active/);

  const url = new URL(await clickAndReadPopup(extContext, tabs.nth(1), page));
  expect(url.searchParams.get('type')).toBe('writer');
  expect(url.searchParams.get('sortby'), 'sortby must survive a type switch').toBe('time');
  expect(url.searchParams.has('start'), 'filter switch must reset pagination').toBe(false);
  await page.close();
});

test('排序按钮：换 sortby 时保留 type，并丢弃 start 游标', async ({ extContext }) => {
  const page = await openCreations(extContext);
  const sorts = page.locator(`${OVERLAY} .umm-creations-sort-btn`);
  expect(await sorts.count(), 'three sort options expected').toBe(3);
  // Which option is active is asserted by identity/index, not by label text:
  // sort labels are UMM chrome destined for content i18n, and the overlay
  // locale in the test browser is not pinned.
  const active = page.locator(`${OVERLAY} .umm-creations-sort-btn--active`);
  await expect(active).toHaveCount(1);
  await expect(sorts.nth(0)).toHaveClass(/umm-creations-sort-btn--active/);

  const url = new URL(await clickAndReadPopup(extContext, sorts.nth(2), page));
  expect(url.searchParams.get('sortby')).toBe('vote');
  expect(url.searchParams.get('type'), 'type must survive a sort switch').toBe('filmmaker');
  expect(url.searchParams.has('start')).toBe(false);
  await page.close();
});

test('角色筛选：chip 写入 role 参数且保留 type/sortby', async ({ extContext }) => {
  const page = await openCreations(extContext);
  const chips = page.locator(`${OVERLAY} .umm-creations-role-chip`);
  expect(
    await chips.count(),
    'role bar needs the 全部 chip plus host roles',
  ).toBeGreaterThanOrEqual(2);

  const url = new URL(await clickAndReadPopup(extContext, chips.nth(1), page));
  expect(url.searchParams.get('type')).toBe('filmmaker');
  expect(url.searchParams.get('sortby')).toBe('time');
  expect(url.searchParams.has('start')).toBe(false);
  expect(url.searchParams.get('role'), 'the clicked chip must set its own role').toBeTruthy();
  await page.close();
});

test('作品卡：海报与信息区两个入口都只打开宿主为该标题列出的条目地址', async ({ extContext }) => {
  const page = await openCreations(extContext);
  const cards = page.locator(`${OVERLAY} .umm-creation-card`);
  await expect(cards.first()).toBeVisible();

  // Host truth: (title → subject href) pairs as listed by the crawled page.
  const hostPairs = await page.evaluate(() => {
    const out: Array<{ title: string; href: string }> = [];
    for (const a of Array.from(
      document.querySelectorAll<HTMLAnchorElement>('a[href*="/subject/"]'),
    )) {
      const title = (a.getAttribute('title') ?? a.textContent ?? '').trim();
      const href = a.href;
      if (title) out.push({ title, href });
    }
    return out;
  });
  expect(hostPairs.length, 'host lists no subject links to pair against').toBeGreaterThan(0);

  const first = cards.first();
  const titleEl = first.locator('.umm-creation-title');
  const title = (await titleEl.innerText()).trim();
  const candidates = hostPairs.filter((pair) => pair.title.includes(title));
  expect(candidates.length, `host has no unambiguous entry for ${JSON.stringify(title)}`).toBe(1);
  const expected = candidates[0]?.href ?? '';

  const viaTitle = await clickAndReadPopup(extContext, titleEl, page);
  expect(viaTitle).toBe(expected);

  const viaPoster = await clickAndReadPopup(
    extContext,
    first.locator('.umm-creation-poster'),
    page,
  );
  expect(viaPoster, 'the poster surface must open the same creation as the title').toBe(expected);
  await page.close();
});
