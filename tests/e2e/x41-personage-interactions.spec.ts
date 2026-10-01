/**
 * X27-C 第四波 — 影人页与作品列表页的状态化交互（personage / personage-creations
 * 的 16 个点击挂点里此前从未被真实浏览器驱动的部分）。
 *
 * 钉的是「有状态 + 由宿主数据决定是否存在」的控件，而不是又一个跳转：
 *  - 获奖列表：收起态固定 5 条，条数与按钮文案的总数都取自宿主的 li.award-item 行数；
 *    宿主行数 ≤5 时按钮必须不存在（另一条用例用 transform 把爬取件补到 7 行，
 *    让来回切换的分支真的被走一遍，而不是被 if 分支静默跳过）；
 *  - 简介超过 120 字才出现展开键，点击可来回切换；
 *  - 筛选页签 / 分页走 filterUrl 合成：保留其它筛选、**丢弃 start 游标**，
 *    后页 URL 必须等于宿主 `a.next` 自己带的 start。
 *
 * 期望值一律来自宿主 DOM 或当前 URL，不来自被测提取器的输出。
 */

import { expect, test } from './fixtures/extension-harness';
import {
  installDoubanFixtureRoutes,
  openDoubanFixturePage,
  type DoubanFixtureRule,
} from './fixtures/douban-crawl-fixtures';

const PERSONAGE_URL = 'https://www.douban.com/personage/90000001/';
const CREATIONS_BASE = 'https://www.douban.com/personage/90000001/creations';
// Both pages share this overlay id (see their config.ts: overlayId).
const OVERLAY = '#umm-personage-overlay';

const AWARD_ITEM = `${OVERLAY} .umm-award-item`;
const CREATIONS_RULE: DoubanFixtureRule = {
  host: 'www.douban.com',
  match: '/personage/90000001/creations',
  fixture: 'personage-creations',
};

/** Append award rows into the awards list specifically (the page has other ul). */
function appendAwardRows(html: string, count: number): string {
  const open = html.indexOf('<ul class="awards"');
  if (open < 0) throw new Error('[e2e] personage fixture has no ul.awards to pad');
  const close = html.indexOf('</ul>', open);
  if (close < 0) throw new Error('[e2e] ul.awards is never closed');
  const row =
    '<li class="award-item"><span>2019</span>' +
    '<a href="https://movie.douban.com/awards/x/">第X届影展</a>' +
    '<span>提名</span>' +
    '<a href="https://movie.douban.com/subject/30010009/">《补位作品》</a></li>';
  return html.slice(0, close) + row.repeat(count) + html.slice(close);
}

function personageRule(extraAwards: number): DoubanFixtureRule {
  return {
    host: 'www.douban.com',
    match: '/personage/',
    fixture: 'personage',
    transform: (html) => (extraAwards > 0 ? appendAwardRows(html, extraAwards) : html),
  };
}

async function openPersonage(extContext: Parameters<typeof openDoubanFixturePage>[0], extra = 0) {
  const page = await openDoubanFixturePage(extContext, personageRule(extra), PERSONAGE_URL);
  await expect(page.locator(`${OVERLAY} .umm-section`).first()).toBeVisible({ timeout: 60_000 });
  return page;
}

test.describe('影人页展开/收起', () => {
  test('简介超过 120 字才有展开键，点击双向切换', async ({ extContext }) => {
    const page = await openPersonage(extContext);
    const bio = page.locator(`${OVERLAY} .umm-bio-text`).first();
    await expect(bio).toBeVisible();
    const length = (await bio.innerText()).trim().length;
    const expand = page.locator('.umm-section:has(.umm-bio-text) .umm-bio-expand');

    if (length <= 120) {
      // Below the threshold the control must not exist at all.
      await expect(expand).toHaveCount(0);
      return;
    }
    // Label text is asserted as a transition, not as a literal: these are UMM
    // chrome strings destined for content i18n, and the overlay locale in the
    // test browser is not pinned. The expanded class carries the semantics.
    const collapsedLabel = (await expand.innerText()).trim();
    await expect(bio).not.toHaveClass(/umm-bio-text--expanded/);

    await expand.click();
    await expect(bio).toHaveClass(/umm-bio-text--expanded/);
    const expandedLabel = (await expand.innerText()).trim();
    expect(expandedLabel, 'toggle label must change with the state').not.toBe(collapsedLabel);

    await expand.click();
    await expect(bio).not.toHaveClass(/umm-bio-text--expanded/);
    await expect(expand).toHaveText(collapsedLabel);
  });

  test('宿主获奖未过 5 条阈值时不出展开按钮，且每条都来自宿主某一行', async ({ extContext }) => {
    const page = await openPersonage(extContext);
    // Below the threshold the control must not exist; every rendered row still
    // has to come from a host row (an invented award would be a fabrication).
    const hostNames = await page.evaluate(() =>
      Array.from(document.querySelectorAll('ul.awards li.award-item')).map(
        (li) => li.querySelector('a')?.textContent?.trim() ?? '',
      ),
    );
    const shown = (await page.locator(`${AWARD_ITEM} .umm-award-name`).allInnerTexts()).map(
      (text) => text.trim(),
    );
    expect(shown.length, 'the awards section rendered nothing to check').toBeGreaterThan(0);
    for (const name of shown) {
      expect(hostNames, `award row invented by the overlay: ${JSON.stringify(name)}`).toContain(
        name,
      );
    }
    await expect(page.locator('.umm-section:has(.umm-awards-list) .umm-bio-expand')).toHaveCount(0);
  });

  test('行数超过 5 时收起态出 5 条，展开/收起可来回切换且条数与文案一致', async ({
    extContext,
  }) => {
    const page = await openPersonage(extContext, 4);
    const items = page.locator(AWARD_ITEM);
    const toggle = page.locator('.umm-section:has(.umm-awards-list) .umm-bio-expand');
    const header = page.locator('.umm-section:has(.umm-awards-list) .umm-photos-count');

    const total = Number(/(\d+)/.exec(await header.innerText())?.[1] ?? NaN);
    expect(
      Number.isFinite(total) && total > 5,
      `padded crawl should cross the collapse threshold, header said ${total}`,
    ).toBe(true);

    await expect(items).toHaveCount(5);
    // Locale-proof: the collapsed label must name the total (digits are the same
    // in every locale), and toggling must change it and then restore it.
    const collapsedLabel = (await toggle.innerText()).trim();
    expect(collapsedLabel, 'collapsed label should advertise the total').toContain(String(total));

    await toggle.click();
    await expect(items).toHaveCount(total);
    const expandedLabel = (await toggle.innerText()).trim();
    expect(expandedLabel).not.toBe(collapsedLabel);

    await toggle.click();
    await expect(items).toHaveCount(5);
    await expect(toggle).toHaveText(collapsedLabel);
  });
});

test.describe('作品列表页筛选与分页', () => {
  test('点类型页签保留 sortby 并丢弃 start 游标', async ({ extContext }) => {
    const routes = await installDoubanFixtureRoutes(extContext, [CREATIONS_RULE]);
    const page = await extContext.newPage();
    await page.goto(`${CREATIONS_BASE}?sortby=time&start=30`, { waitUntil: 'domcontentloaded' });
    expect(routes.served()).toContain('personage-creations');

    const tabs = page.locator(`${OVERLAY} .umm-creations-tab`);
    await expect(tabs.first()).toBeVisible({ timeout: 60_000 });
    expect(await tabs.count(), 'filter tabs need at least two entries').toBeGreaterThanOrEqual(2);

    const popup = extContext.waitForEvent('page');
    await tabs.nth(1).click();
    const opened = await popup;
    const url = new URL(opened.url());
    expect(url.searchParams.get('sortby'), 'other filters must survive').toBe('time');
    expect(url.searchParams.has('start'), 'a filter change must reset pagination').toBe(false);
    expect(url.searchParams.has('type'), 'the clicked tab must set its own param').toBe(true);
    await opened.close();
  });

  test('首页无前页按钮，后页 URL 与宿主下一页链接的 start 一致', async ({ extContext }) => {
    const routes = await installDoubanFixtureRoutes(extContext, [CREATIONS_RULE]);
    const page = await extContext.newPage();
    await page.goto(CREATIONS_BASE, { waitUntil: 'domcontentloaded' });
    expect(routes.served()).toContain('personage-creations');

    // Host truth: the crawl's own next-page anchor and its start offset.
    const hostNext = await page.evaluate(() => {
      const next = document.querySelector('span.next a, a.next');
      const href = next?.getAttribute('href') ?? '';
      return new URL(href, location.href).searchParams.get('start');
    });
    expect(hostNext, 'fixture must expose a next-page cursor to compare against').toBeTruthy();

    const paginator = page.locator(`${OVERLAY} .umm-creations-paginator`);
    await expect(paginator).toBeVisible({ timeout: 60_000 });
    // Label-free locator: the buttons' text is UMM chrome resolved through
    // content i18n and this suite does not pin the overlay locale. On page 1
    // exactly one button must exist (next); the host-cursor check below proves
    // it is the next one, so a stray prev button fails the count.
    const pagerButtons = paginator.locator('button.umm-paginator-btn');
    await expect(pagerButtons).toHaveCount(1);

    const popup = extContext.waitForEvent('page');
    await pagerButtons.first().click();
    const opened = await popup;
    expect(new URL(opened.url()).searchParams.get('start')).toBe(hostNext);
    await opened.close();
  });
});
