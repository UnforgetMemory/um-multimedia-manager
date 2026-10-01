/**
 * X55 — the shared numeric paginator (UmmPaginator) on a real collect page.
 *
 * Five page types (music-collect, book-collect, game-collect, book-authors,
 * doulists) render this component, and none of its three click sites had ever
 * been driven: prev/next disabled states, and the numbered buttons' jump to the
 * **host's own** page URL. The expectations come from the crawled paginator
 * anchors, so a change in how labels map to links cannot pass silently.
 */

import { expect, test } from './fixtures/extension-harness';
import {
  installDoubanFixtureRoutes,
  type DoubanFixtureRule,
} from './fixtures/douban-crawl-fixtures';

const COLLECT_URL = 'https://music.douban.com/mine?status=collect';
const OVERLAY = '#umm-douban-overlay';
const RULE: DoubanFixtureRule = {
  host: 'music.douban.com',
  match: '/mine',
  fixture: 'music-collect',
};

/** Host truth: the crawled paginator's own label → absolute href map. */
async function hostPageLinks(
  page: import('@playwright/test').Page,
): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const out: Record<string, string> = {};
    for (const a of Array.from(document.querySelectorAll('.paginator a'))) {
      const label = (a.textContent ?? '').trim();
      if (label) out[label] = new URL(a.getAttribute('href') ?? '', location.href).href;
    }
    out.__next = new URL(
      document.querySelector<HTMLAnchorElement>('.paginator .next a')?.getAttribute('href') ?? '',
      location.href,
    ).href;
    return out;
  });
}

test('数字分页：首屏禁用前页，页码按宿主链接跳转，后页与宿主 next 一致', async ({ extContext }) => {
  await installDoubanFixtureRoutes(extContext, [RULE]);
  const page = await extContext.newPage();
  await page.goto(COLLECT_URL, { waitUntil: 'domcontentloaded' });

  const paginator = page.locator(`${OVERLAY} .umm-paginator`);
  await expect(paginator).toBeVisible({ timeout: 60_000 });

  const links = await hostPageLinks(page);
  expect(links['2'], 'fixture lost its page-2 anchor').toBeTruthy();

  const prev = paginator.locator('button[aria-label="Previous page"]');
  await expect(prev).toBeDisabled();

  const active = paginator.locator('.umm-paginator-btn--active');
  await expect(active).toHaveText('1');

  // Page number → the host's own URL for that label.
  await paginator.locator('button', { hasText: /^2$/ }).click();
  await expect(page).toHaveURL(links['2'] ?? '', { timeout: 30_000 });

  await page.goto(COLLECT_URL, { waitUntil: 'domcontentloaded' });
  await expect(paginator).toBeVisible({ timeout: 60_000 });
  await paginator.locator('button', { hasText: /^3$/ }).click();
  await expect(page).toHaveURL(links['3'] ?? '', { timeout: 30_000 });

  await page.goto(COLLECT_URL, { waitUntil: 'domcontentloaded' });
  await expect(paginator).toBeVisible({ timeout: 60_000 });
  await paginator.locator('button[aria-label="Next page"]').click();
  await expect(page).toHaveURL(links.__next ?? '', { timeout: 30_000 });
});
