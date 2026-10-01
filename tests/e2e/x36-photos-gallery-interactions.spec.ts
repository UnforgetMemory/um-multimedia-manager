/**
 * X27-C 第二波 — the photos page gallery (13 click/keyboard handlers, previously
 * only its RENDER was covered).
 *
 * The grid, the fullscreen gallery, the zoom/pan layer and the download button
 * are the richest interaction surface in the Douban overlay set, and two of its
 * contracts are invisible to render tests: the per-card download button must not
 * also open the gallery (`@click.stop`), and the boundary nav buttons are
 * conditionally rendered rather than disabled (so a test that assumes a disabled
 * button would be asserting a DOM that never exists).
 *
 * Host truth comes from the fixture DOM itself, exactly as the render spec does:
 * expectations are traced back to the page, never to what the extractor's own
 * output happens to produce.
 */

import { expect, test } from './fixtures/extension-harness';
import { openDoubanFixturePage } from './fixtures/douban-crawl-fixtures';

const PHOTOS_URL = 'https://movie.douban.com/subject/1292052/photos?type=S';
const OVERLAY = '#umm-photos-overlay';
const CARDS = `${OVERLAY} .umm-photo-card`;
const GALLERY = `${OVERLAY} .umm-gallery-overlay`;
const GALLERY_IMG = `${OVERLAY} .umm-gallery-img`;
const COUNTER = `${OVERLAY} .umm-gallery-counter-num`;

const RULE = {
  host: 'movie.douban.com',
  match: '/subject/1292052/photos',
  fixture: 'photos-gallery',
} as const;

async function openPhotosPage(extContext: Parameters<typeof openDoubanFixturePage>[0]) {
  const page = await openDoubanFixturePage(extContext, RULE, PHOTOS_URL);
  await expect(page.locator(CARDS).first()).toBeVisible({ timeout: 60_000 });
  return page;
}

test('卡片点击打开画廊并定位到那张卡自己的图', async ({ extContext }) => {
  const page = await openPhotosPage(extContext);
  const cards = page.locator(CARDS);
  const count = await cards.count();
  expect(
    count,
    'gallery needs at least two cards to prove index addressing',
  ).toBeGreaterThanOrEqual(2);

  const secondSrc = await cards.nth(1).locator('img').first().getAttribute('src');
  expect(secondSrc, 'the second card carries no src to compare against').toBeTruthy();

  await expect(page.locator(GALLERY)).toHaveCount(0);
  await cards.nth(1).click();
  await expect(page.locator(GALLERY)).toHaveCount(1);
  await expect(page.locator(GALLERY_IMG)).toHaveAttribute('src', secondSrc ?? '');
  await expect(page.locator(COUNTER)).toHaveText('2');
});

test('边界导航按钮是条件渲染：首张无上一张，前进后出现且计数跟随', async ({ extContext }) => {
  const page = await openPhotosPage(extContext);

  await page.locator(CARDS).first().click();
  await expect(page.locator(GALLERY)).toHaveCount(1);
  await expect(page.locator(`${OVERLAY} .umm-gallery-nav--prev`)).toHaveCount(0);

  await page.locator(`${OVERLAY} .umm-gallery-nav--next`).click();
  await expect(page.locator(COUNTER)).toHaveText('2');
  await expect(page.locator(`${OVERLAY} .umm-gallery-nav--prev`)).toHaveCount(1);

  await page.locator(`${OVERLAY} .umm-gallery-nav--prev`).click();
  await expect(page.locator(COUNTER)).toHaveText('1');
  await expect(page.locator(`${OVERLAY} .umm-gallery-nav--prev`)).toHaveCount(0);
});

test('✕ 关闭画廊后 DOM 内不留遮罩层', async ({ extContext }) => {
  const page = await openPhotosPage(extContext);

  await page.locator(CARDS).first().click();
  await expect(page.locator(GALLERY)).toHaveCount(1);
  await page.locator(`${OVERLAY} .umm-gallery-close`).click();
  await expect(page.locator(GALLERY)).toHaveCount(0);

  // Re-open must work from the same bar state (the open flag is not one-shot).
  await page.locator(CARDS).nth(1).click();
  await expect(page.locator(GALLERY)).toHaveCount(1);
});

test('卡片上的下载按钮被 click.stop 挡住：不冒泡开画廊（下载本身由 x104 用 download 事件作证）', async ({
  extContext,
}) => {
  const page = await openPhotosPage(extContext);

  await page.locator(`${CARDS} .umm-dl-btn`).first().click();
  await expect(page.locator(GALLERY)).toHaveCount(0);
});

test('滚轮放大出角标并改变 transform，双击复位', async ({ extContext }) => {
  const page = await openPhotosPage(extContext);
  await page.locator(CARDS).first().click();
  await expect(page.locator(GALLERY)).toHaveCount(1);

  await expect(page.locator(`${OVERLAY} .umm-gallery-zoom-badge`)).toHaveCount(0);
  await page.locator(GALLERY_IMG).dispatchEvent('wheel', { deltaY: -240 });
  await expect(page.locator(`${OVERLAY} .umm-gallery-zoom-badge`)).toHaveCount(1);
  await expect(page.locator(GALLERY_IMG)).toHaveCSS('transform', /^matrix\((?!1, 0)/);

  await page.locator(GALLERY_IMG).dblclick();
  await expect(page.locator(`${OVERLAY} .umm-gallery-zoom-badge`)).toHaveCount(0);
  await expect(page.locator(GALLERY_IMG)).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
});
