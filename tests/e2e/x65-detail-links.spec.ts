/**
 * X65 — the two remaining detail-page link surfaces that were never clicked:
 * the poster (opens whatever `#mainpic a` points at — photos/lightbox on Douban)
 * and a celebrity card (opens that person's own celebrity page).
 *
 * Expectations are paired against the fixture DOM rather than the overlay's own
 * data: the overlay may only navigate to the href the page itself carries for
 * that same title/name. The `detail-movie` fixture is Douban-shaped/synthetic,
 * so what this pins is the pairing and the click wiring — not site truth.
 */

import { expect, test } from './fixtures/extension-harness';
import { openDoubanFixturePage, type DoubanFixtureRule } from './fixtures/douban-crawl-fixtures';

const DETAIL_URL = 'https://movie.douban.com/subject/1292052/';
const OVERLAY = '#umm-detail-mask';

const RULE: DoubanFixtureRule = {
  host: 'movie.douban.com',
  match: '/subject/1292052',
  fixture: 'detail-movie',
};

async function openDetail(extContext: Parameters<typeof openDoubanFixturePage>[0]) {
  const page = await openDoubanFixturePage(extContext, RULE, DETAIL_URL, {
    shell: 'umm-detail-mask',
  });
  await expect(page.locator(`${OVERLAY} .umm-poster`)).toBeVisible({ timeout: 60_000 });
  return page;
}

async function popupUrl(
  extContext: Parameters<typeof openDoubanFixturePage>[0],
  page: import('@playwright/test').Page,
  click: () => Promise<void>,
): Promise<string> {
  const known = new Set(extContext.pages());
  await click();
  await expect
    .poll(
      () => {
        const fresh = extContext.pages().filter((p) => !known.has(p) && p.url() !== 'about:blank');
        return fresh[0]?.url() ?? '';
      },
      { timeout: 20_000 },
    )
    .not.toBe('');
  const fresh = extContext.pages().filter((p) => !known.has(p) && p.url() !== 'about:blank');
  const url = fresh[0]?.url() ?? '';
  expect(url).not.toBe(page.url());
  for (const extra of fresh) await extra.close();
  return url;
}

test('海报点击落在宿主 #mainpic 自己带的那条链接上', async ({ extContext }) => {
  const page = await openDetail(extContext);
  const hostHref = await page.evaluate(
    () => document.querySelector<HTMLAnchorElement>('#mainpic a')?.href ?? '',
  );
  expect(hostHref, 'fixture lost its #mainpic anchor').not.toBe('');

  const opened = await popupUrl(extContext, page, () =>
    page.locator(`${OVERLAY} .umm-poster > div`).first().click(),
  );
  expect(opened).toBe(hostHref);
  await page.close();
});

test('影人卡片打开的是宿主为该姓名列出的那条 celebrity 链接', async ({ extContext }) => {
  const page = await openDetail(extContext);
  const cards = page.locator(`${OVERLAY} .umm-celeb-item`);
  await expect(cards.first()).toBeVisible({ timeout: 60_000 });

  // Host truth: (person name → celebrity href) as the page lists them. The same
  // person is listed several times (导演 / 演员 / 编剧 …), so uniqueness is on the
  // *href set*, not on the name — requiring one anchor per name was my wrong
  // precondition, not a product bug.
  const hostPairs = await page.evaluate(() => {
    const out: Array<{ name: string; href: string }> = [];
    for (const a of Array.from(
      document.querySelectorAll<HTMLAnchorElement>('a[href*="/celebrity/"]'),
    )) {
      const name = (a.getAttribute('title') ?? a.textContent ?? '').trim();
      if (name && a.href) out.push({ name, href: a.href });
    }
    return out;
  });
  expect(hostPairs.length, 'fixture lists no celebrity anchors to pair against').toBeGreaterThan(0);

  const name = (await cards.first().locator('.umm-celeb-name').innerText()).trim();
  const hrefs = [
    ...new Set(hostPairs.filter((pair) => pair.name === name).map((pair) => pair.href)),
  ];
  expect(hrefs.length, `host lists no celebrity link for ${JSON.stringify(name)}`).toBeGreaterThan(
    0,
  );

  const opened = await popupUrl(extContext, page, () => cards.first().click());
  expect(hrefs, 'the card must open a celebrity URL the host itself lists').toContain(opened);
  await page.close();
});
