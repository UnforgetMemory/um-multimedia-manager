/**
 * X104 — the photos hooks nobody had pressed: the filter tab strip (main and
 * sub levels), the sidebar links (`openLink`), and the in-gallery download.
 *
 * `x36` drives card → gallery, the boundary nav, ✕ close, the card download's
 * `click.stop` and the wheel zoom; `x56` drives the pager. That leaves
 * `photos/App.vue:187` (main tabs), `:197` (sub tabs), `:272` (sidebar buttons)
 * and `:294` (gallery download). The download leg also repairs a claim made
 * elsewhere: the card test is titled "触发下载" yet only asserts the gallery did
 * not open — the download itself was never witnessed.
 *
 * Page-type honesty about the sidebar: `photos-data.ts` fills `sidebarLinks`
 * ONLY on `/all_photos` (pinned both ways by `tests/unit/photos-data.spec.ts`:
 * `[]` for the single-type page, three entries for the summary page), and the
 * template renders the block under `v-if="d.sidebarLinks.length"`. So the
 * positive leg runs against a summary page and a separate leg pins the
 * single-type absence — otherwise "no buttons here" would read as a broken
 * handler instead of the documented branch split.
 *
 * Oracles are host-derived and each negative leg carries its premise:
 *  - tab targets come from the host `#photos_filter` anchors, and the counts
 *    also prove the extractor skipped `li.up` ("回到顶部");
 *  - the current tab is a host `<span>` (extracted with an empty url), so
 *    clicking it must not navigate — asserted only after proving a current
 *    entry exists;
 *  - each sidebar button must open its OWN host href in a new tab and leave
 *    this page in place;
 *  - the download leg compares two photos and demands two filenames:
 *    `downloadPhoto(currentPhoto)` freezing on one photo is invisible to a
 *    single-photo assertion.
 */

import type { BrowserContext, Page } from '@playwright/test';
import { expect, test } from './fixtures/extension-harness';
import { openDoubanFixturePage, type DoubanFixtureRule } from './fixtures/douban-crawl-fixtures';

const PHOTOS_URL = 'https://movie.douban.com/subject/1292052/photos?type=S';
const ALL_PHOTOS_URL = 'https://movie.douban.com/subject/1292052/all_photos';
const OVERLAY = '#umm-photos-overlay';
const TAB = `${OVERLAY} .umm-filter-tab`;
const TAB_SUB = `${TAB}--sub`;
const TAB_ACTIVE = `${OVERLAY} .umm-filter-tab--active`;
const SIDEBAR_BTN = `${OVERLAY} .umm-photo-sidebar-btn`;
const GALLERY = `${OVERLAY} .umm-gallery-overlay`;
const GALLERY_IMG = `${OVERLAY} .umm-gallery-img`;
const GALLERY_DL = `${OVERLAY} .umm-gallery-dl`;
const CARDS = `${OVERLAY} .umm-photo-card`;

const RULE: DoubanFixtureRule = {
  host: 'movie.douban.com',
  match: '/subject/1292052/photos',
  fixture: 'photos-gallery',
};

/** Summary page: the only branch that carries sidebar links. */
const ALL_RULE: DoubanFixtureRule = {
  host: 'movie.douban.com',
  match: '/subject/1292052/all_photos',
  fixture: 'photos-all',
};

async function openPhotos(extContext: BrowserContext, rule: DoubanFixtureRule, url: string) {
  const page = await openDoubanFixturePage(extContext, rule, url);
  await expect(page.locator(CARDS).first()).toBeVisible({ timeout: 60_000 });
  return page;
}

/** Host filter strip, split the way the extractor splits it. */
function hostFilters(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector('#photos_filter');
    const mainLis = Array.from(root?.querySelectorAll(':scope > ul > li') ?? []).filter(
      (li) => !li.classList.contains('up'),
    );
    const anchors = mainLis
      .map((li) => li.querySelector<HTMLAnchorElement>('a'))
      .filter((a): a is HTMLAnchorElement => !!a)
      .map((a) => ({ label: (a.textContent ?? '').trim(), href: a.href }));
    const current =
      mainLis
        .find((li) => !li.querySelector('a'))
        ?.querySelector('span')
        ?.textContent?.trim() ?? '';
    const sub = Array.from(root?.querySelectorAll(':scope > ul > ul.sub li a') ?? []).map((a) => ({
      label: (a.textContent ?? '').trim(),
      href: (a as HTMLAnchorElement).href,
    }));
    const skippedTop = root?.querySelectorAll('li.up').length ?? 0;
    return { anchors, current, sub, skippedTop };
  });
}

function hostSidebarLinks(page: Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLAnchorElement>('.aside .links a, .aside .mb30 a'))
      .map((a) => ({ text: (a.textContent ?? '').trim().replace(/^>\s*/, ''), href: a.href }))
      .filter((l) => l.text && l.href),
  );
}

test.describe('photos 页的页签、侧栏链接与画廊下载', () => {
  test('筛选条两级页签都渲染，且宿主 li.up「回到顶部」被提取器跳过', async ({ extContext }) => {
    const page = await openPhotos(extContext, RULE, PHOTOS_URL);
    const host = await hostFilters(page);
    expect(host.anchors.length, '夹具主级页签不足').toBeGreaterThanOrEqual(2);
    expect(host.sub.length, '夹具次级页签不足').toBeGreaterThanOrEqual(1);
    expect(host.skippedTop, '夹具没有 li.up，跳过判据会空转').toBeGreaterThan(0);
    expect(host.current, '夹具没有当前页签（span 形态）').not.toBe('');

    await expect(page.locator(`${TAB}:not(${TAB_SUB})`)).toHaveCount(host.anchors.length + 1);
    await expect(page.locator(TAB_SUB)).toHaveCount(host.sub.length);
    await expect(page.locator(`${TAB}:has-text("回到顶部")`), '被跳过的条目仍渲染出来').toHaveCount(
      0,
    );
    await page.close();
  });

  test('主级页签各自跳到宿主为它列出的 href，目标两两不同', async ({ extContext }) => {
    const page = await openPhotos(extContext, RULE, PHOTOS_URL);
    const host = await hostFilters(page);

    const seen: string[] = [];
    for (const entry of host.anchors) {
      const target = page.locator(`${TAB}:has-text("${entry.label}")`).first()!;
      await expect(target, `宿主页签「${entry.label}」没渲染`).toBeVisible();
      await target.click();
      await expect(page, `页签「${entry.label}」跳错目标`).toHaveURL(entry.href, {
        timeout: 30_000,
      });
      seen.push(entry.href);
      // The route answers with the same body, so the strip is back and the next
      // tab can be pressed without re-opening the page.
      await expect(page.locator(TAB).first()).toBeVisible({ timeout: 30_000 });
    }
    expect(new Set(seen).size, '两个主级页签共用同一条目标').toBe(seen.length);
    await page.close();
  });

  test('次级页签（排序）也跳自己的 href，不同于主级任何一条', async ({ extContext }) => {
    const page = await openPhotos(extContext, RULE, PHOTOS_URL);
    const host = await hostFilters(page);
    const sub = host.sub.find((s) => s.href.includes('/photos?type=S'))!;
    expect(sub, '次级页签里没有一条留在本页型内（换了页型就无从判别）').toBeTruthy();
    expect(
      host.anchors.every((a) => a.href !== sub.href),
      '次级目标与某条主级相同',
    ).toBe(true);

    const target = page.locator(`${TAB_SUB}:has-text("${sub.label}")`).first()!;
    await expect(target).toBeVisible();
    await target.click();
    await expect(page).toHaveURL(sub.href, { timeout: 30_000 });
    await page.close();
  });

  test('当前页签（宿主是 span）标为激活且点了不跳', async ({ extContext }) => {
    const page = await openPhotos(extContext, RULE, PHOTOS_URL);
    const host = await hostFilters(page);
    expect(host.current, '夹具无当前页签，本例无从判别').not.toBe('');

    const active = page.locator(TAB_ACTIVE)!;
    await expect(active).toHaveText(host.current);
    const before = page.url();
    // A sentinel distinguishes "nothing happened" from "same URL, reloaded":
    // assigning an empty url to location.href reloads the document, which keeps
    // page.url() identical and would let that implementation pass.
    await page.evaluate(() => {
      (window as unknown as { __ummNoNav?: number }).__ummNoNav = 1;
    });
    await active.click();
    await page.waitForTimeout(600);
    expect(page.url(), '点当前页签把自己跳走了（空 url 仍被当地址用）').toBe(before);
    expect(
      await page.evaluate(() => (window as unknown as { __ummNoNav?: number }).__ummNoNav),
      '页面被重新加载（哨兵丢了）——当前页签不应触发任何导航',
    ).toBe(1);
    await page.close();
  });

  test('汇总页：三个侧栏按钮各开自己的宿主链接，本页不跳', async ({ extContext }) => {
    const page = await openPhotos(extContext, ALL_RULE, ALL_PHOTOS_URL);
    const links = await hostSidebarLinks(page);
    expect(links.length, '汇总页夹具没有三条侧栏链接').toBe(3);

    const buttons = page.locator(SIDEBAR_BTN);
    await expect(buttons, '侧栏按钮数与宿主链接数不一致').toHaveCount(links.length);

    const before = page.url();
    const openedUrls: string[] = [];
    for (let i = 0; i < links.length; i++) {
      // window.open hands back a popup whose URL is still about:blank, so the
      // popup is awaited as an event and its URL polled — counting pages right
      // after the click reads the pre-navigation state.
      const popupPromise = page.waitForEvent('popup');
      await buttons.nth(i)!.click();
      const popup = await popupPromise;
      await expect
        .poll(() => popup.url(), { message: `侧栏按钮 ${i} 的新标签没有落在自己 href` })
        .toBe(links[i]!.href);
      openedUrls.push(popup.url());
      await popup.close();
    }
    expect(new Set(openedUrls).size, '侧栏按钮共用同一条目标').toBe(links.length);
    expect(page.url(), '侧栏按钮把本页导航走了').toBe(before);
    await page.close();
  });

  test('单类型照片页没有侧栏按钮（sidebarLinks 只属于汇总页分支）', async ({ extContext }) => {
    const page = await openPhotos(extContext, RULE, PHOTOS_URL);
    // Premise: the host DOES carry the aside here, so the absence below is the
    // extractor's branch split rather than a missing fixture.
    expect((await hostSidebarLinks(page)).length, '照片页夹具缺 aside 链接，本例无从判别').toBe(3);
    await expect(page.locator(SIDEBAR_BTN)).toHaveCount(0);
    await page.close();
  });

  test('画廊下载走完整链路：两张不同照片得到两个不同文件名', async ({ extContext }) => {
    const page = await openPhotos(extContext, RULE, PHOTOS_URL);
    const names: string[] = [];

    for (const index of [0, 1]) {
      await page.locator(CARDS).nth(index)!.click();
      await expect(page.locator(GALLERY)).toHaveCount(1);
      const src = (await page.locator(GALLERY_IMG).getAttribute('src')) ?? '';
      expect(src, `第 ${index + 1} 张画廊图片没有 src`).not.toBe('');

      const waited = page.waitForEvent('download', { timeout: 15_000 });
      await page.locator(GALLERY_DL).click();
      const dl = await waited;
      const filename = dl.suggestedFilename();
      const ext = src.split('.').pop()?.split('?')[0]?.toLowerCase() ?? '';
      expect(filename, `下载文件名没带上图片自己的扩展名（${ext}）`).toMatch(
        new RegExp(`\\.${ext}$`, 'i'),
      );
      names.push(filename);

      await page.locator(`${OVERLAY} .umm-gallery-close`).click();
      await expect(page.locator(GALLERY)).toHaveCount(0);
    }

    expect(names[0], '两张照片下载到同一个文件名（downloadPhoto 冻在同一张上）').not.toBe(names[1]);
    await page.close();
  });
});
