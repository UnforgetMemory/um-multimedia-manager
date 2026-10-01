import { expect, sendRuntimeMessage, test } from './fixtures/extension-harness';
import {
  BILIBILI_STORE,
  installBilibiliMocks,
  seedRecord,
  waitForBackgroundReady,
} from './fixtures/host-mocks';
import { biliStoreKey, bilibiliHomepageHtml, makeBiliCards } from './fixtures/bilibili-page';

/**
 * The legacy (non-Douban) injection path on the event bus.
 *
 * The bilibili listing pass is driven by a MutationObserver on the host feed, so
 * a record written from elsewhere changes nothing the observer can see: the row
 * stays marked processed with a stale verdict. The bus is therefore the only
 * delivery channel for live refresh — and its tabs leg is the part that has
 * silently failed before (ADR-015), which is why this is asserted in a real
 * browser with a real extension context rather than in a unit harness.
 *
 * Asserted: one external write flips exactly the paired card, one external
 * delete flips it back (the delete direction needs an attribute REMOVAL, which
 * the previous add-only writer could not express), and the document is never
 * reloaded — a reload would fake freshness and hide the defect.
 */

const HOME_URL = 'https://www.bilibili.com/';
const PROCESSED_ATTR = '[data-umm-bili-processed]';
const CARDS = makeBiliCards(8, 0);

function cardSelector(bvid: string): string {
  return `.bili-video-card[data-card-id="${bvid}"]`;
}

test('an external write and a later delete repaint exactly the paired bilibili card, without reload', async ({
  extContext,
  extPage,
}) => {
  await installBilibiliMocks(extContext, { homepageHtml: bilibiliHomepageHtml(CARDS) });
  await waitForBackgroundReady(extPage, BILIBILI_STORE);

  const page = await extContext.newPage();
  await page.goto(HOME_URL, { waitUntil: 'domcontentloaded' });

  await expect(page.locator(PROCESSED_ATTR)).toHaveCount(CARDS.length, { timeout: 60_000 });
  await expect(page.locator('.bili-video-card.umm-viewed')).toHaveCount(0);
  await expect(page.locator(`${cardSelector(CARDS[0]!.bvid)} .umm-bili-badge`)).toHaveText('未看');

  // Identity token: a document reload would drop this, so the assertions below
  // cannot be satisfied by a fresh page that simply read the new record.
  await page.evaluate(() => {
    (window as Window & { __ummDocToken?: string }).__ummDocToken = 'pre-write';
  });

  const target = CARDS[3]!;
  const put = await seedRecord(
    extPage,
    BILIBILI_STORE,
    biliStoreKey(target),
    `https://www.bilibili.com/video/${target.bvid}/`,
  );
  expect(put.success).toBe(true);

  const card = page.locator(cardSelector(target.bvid));
  await expect(card).toHaveClass(/umm-viewed/, { timeout: 30_000 });
  await expect(card.locator('.umm-bili-badge')).toHaveText('已看 8');
  // Precision: only the paired row moved, and nothing else got re-marked.
  await expect(page.locator('.bili-video-card.umm-viewed')).toHaveCount(1);
  await expect(page.locator(PROCESSED_ATTR)).toHaveCount(CARDS.length);

  const del = await sendRuntimeMessage(extPage, 'DB_DELETE', {
    storeName: BILIBILI_STORE,
    key: biliStoreKey(target),
  });
  expect(del.success).toBe(true);

  await expect(card).not.toHaveClass(/umm-viewed/, { timeout: 30_000 });
  await expect(card.locator('.umm-bili-badge')).toHaveText('未看');
  await expect(page.locator('.bili-video-card.umm-viewed')).toHaveCount(0);

  expect(page.url()).toBe(HOME_URL);
  expect(
    await page.evaluate(() => (window as Window & { __ummDocToken?: string }).__ummDocToken),
  ).toBe('pre-write');
});
