/**
 * X56 — the photos page pagination (2 click sites, rendered TWICE: header nav +
 * footer pagination).
 *
 * The duplication is itself a contract: `goToPage(url)` no-ops on an empty URL
 * and both copies take the same `--disabled` class, so a change that fixes only
 * one block would leave a clickable "上一页" that jumps nowhere. Expectations come
 * from the crawled pager (`thispage` plus its prev/next anchors); the boundary
 * case removes those anchors through X39's transform hook, so the deviation is
 * visible at the call site instead of a hand-written fixture pretending to be
 * the host.
 */

import { expect, test } from './fixtures/extension-harness';
import {
  installDoubanFixtureRoutes,
  openDoubanFixturePage,
  type DoubanFixtureRule,
} from './fixtures/douban-crawl-fixtures';

const PHOTOS_URL = 'https://movie.douban.com/subject/1292052/photos?type=S';
const OVERLAY = '#umm-photos-overlay';
const BTN = `${OVERLAY} .umm-nav-btn`;
const DISABLED = `${OVERLAY} .umm-nav-btn--disabled`;

const BASE_RULE: DoubanFixtureRule = {
  host: 'movie.douban.com',
  match: '/subject/1292052/photos',
  fixture: 'photos-gallery',
};

function withoutPagerAnchors(html: string): string {
  const found = (html.match(/class="(prev|next)"/g) ?? []).length;
  if (found < 2) {
    throw new Error(`[e2e] photos pager changed (${found} anchors); update this transform`);
  }
  return html.replace(/<span class="(prev|next)">[\s\S]*?<\/span>/g, '');
}

test('页码文案、两份导航与跳转目标都跟随宿主 pager', async ({ extContext }) => {
  const page = await openDoubanFixturePage(extContext, BASE_RULE, PHOTOS_URL);
  await expect(page.locator(BTN).first()).toBeVisible({ timeout: 60_000 });

  const host = await page.evaluate(() => {
    const thispage = document.querySelector('.paginator .thispage');
    const hrefOf = (sel: string) => document.querySelector<HTMLAnchorElement>(sel)?.href ?? '';
    return {
      current: (thispage?.textContent ?? '').trim(),
      total: thispage?.getAttribute('data-total-page') ?? '',
      prev: hrefOf('.paginator .prev a'),
      next: hrefOf('.paginator .next a'),
    };
  });
  expect(host.current, 'fixture pager changed shape').not.toBe('');
  expect(host.prev).not.toBe('');
  expect(host.next).not.toBe('');
  // X108：分页文案已入词典、随语言渲染 ⇒ 不再钉具体字面量；判据改为
  // 「两份导航显示同一 page-info，且其中按序含宿主 current/total 两个数字」。
  const navPages = page.locator(`${OVERLAY} .umm-nav-page`);
  await expect(navPages).toHaveCount(2);
  const firstPageText = (await navPages.nth(0).innerText()).trim();
  expect((await navPages.nth(1).innerText()).trim()).toBe(firstPageText);
  expect(firstPageText, 'page-info 未按序含宿主 current/total').toMatch(
    new RegExp(`${host.current}[^\\d]+${host.total}`),
  );
  await expect(page.locator(BTN)).toHaveCount(4);
  await expect(page.locator(DISABLED)).toHaveCount(0);

  const footer = page.locator(`${OVERLAY} .umm-photo-footer`);
  await footer.locator('.umm-nav-btn').nth(1).click();
  await expect(page).toHaveURL(host.next, { timeout: 30_000 });

  await page.goto(PHOTOS_URL, { waitUntil: 'domcontentloaded' });
  await expect(footer).toBeVisible({ timeout: 60_000 });
  await footer.locator('.umm-nav-btn').nth(0).click();
  await expect(page).toHaveURL(host.prev, { timeout: 30_000 });
  await page.close();
});

test('宿主 pager 没有 prev/next 时，两份导航同时禁用且点击不跳转', async ({ extContext }) => {
  const routes = await installDoubanFixtureRoutes(extContext, [
    { ...BASE_RULE, transform: withoutPagerAnchors },
  ]);
  const page = await extContext.newPage();
  await page.goto(PHOTOS_URL, { waitUntil: 'domcontentloaded' });
  expect(routes.served()).toContain('photos-gallery');

  await expect(page.locator(BTN)).toHaveCount(4, { timeout: 60_000 });
  await expect(page.locator(DISABLED)).toHaveCount(4);

  const before = page.url();
  await page.locator(BTN).first().click({ force: true });
  await page.locator(BTN).nth(3).click({ force: true });
  await page.waitForTimeout(500);
  expect(page.url(), 'disabled nav must not navigate').toBe(before);
  await page.close();
});
