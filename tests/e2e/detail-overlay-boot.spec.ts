/**
 * X9-C #1 — detail overlay boot on a LOCAL MOCK douban page with the REAL
 * built extension loaded in a headed Chromium.
 *
 * Proves the real chain: manifest content-script injection (douban-early at
 * document_start → shadow host; douban-main at document_idle → mountDetail)
 * + extractDetailData DOM parsing + Vue overlay render — with the host page
 * body replaced by a network-interception fixture while the URL stays on
 * movie.douban.com.
 */

import { expect, installDoubanMocks, test } from './fixtures/extension-harness';
import { doubanMovieDetailHtml, movieDetailUrl } from './fixtures/movie-detail-page';

const SUBJECT_ID = '26433416';
const TITLE = 'E2E 测试影片';

test('douban detail overlay boots and mounts the Vue app inside shadow DOM', async ({
  extContext,
}) => {
  await installDoubanMocks(extContext, {
    movieDetailHtml: doubanMovieDetailHtml({ subjectId: SUBJECT_ID, title: TITLE }),
  });

  const page = await extContext.newPage();
  await page.goto(movieDetailUrl(SUBJECT_ID), { waitUntil: 'domcontentloaded' });

  // 1. Early shell: document_start overlay host with an open shadow root exists.
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            !!document.getElementById('umm-detail-mask')?.shadowRoot &&
            !!document.getElementById('umm-detail-mask')?.shadowRoot?.querySelector('style'),
        ),
      { timeout: 30_000 },
    )
    .toBe(true);

  // 2. Mounted app (document_idle + dynamic import): Playwright CSS pierces
  //    the open shadow root — the detail app renders the mocked title.
  await expect(page.locator('#umm-detail-mask .umm-detail-title')).toContainText(TITLE, {
    timeout: 60_000,
  });

  // 3. Real extraction round trip: year + rating scraped from the mock DOM.
  await expect(page.locator('#umm-detail-mask .umm-detail-year')).toContainText('2024');
  await expect(page.locator('#umm-detail-mask .umm-rating-score')).toContainText('8.2');

  // 4. Interaction surface: the interest-marking bar is mounted.
  await expect(page.locator('#umm-detail-mask .umm-interest-bar .umm-mark-btn')).toBeVisible();
});
