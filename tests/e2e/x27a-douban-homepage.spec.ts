/**
 * X27-A #1 — Douban MOVIE homepage (`movie.douban.com/`) in a real browser with
 * the real built extension, host body replaced by the byte-faithful crawled
 * fixture `tests/fixtures/douban/homepage.html` (the same DOM the node-side
 * extraction specs parse).
 *
 * Expected values never come from the extractor under test: they are read out of
 * the HOST page DOM (every `a[href*="/subject/"]` and the label the page itself
 * gives it), which the overlay does not write to. Comparing overlay output
 * against that map proves both "nothing was invented" and "title ↔ subject
 * pairing survived".
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DOUBAN_STORE,
  expect,
  makeStoreRecord,
  sendRuntimeMessage,
  test,
} from './fixtures/extension-harness';
import { installDoubanFixtureRoutes } from './fixtures/douban-crawl-fixtures';
import { readHostSubjects } from './fixtures/douban-host-subjects';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_FILE = path.resolve(HERE, '..', 'fixtures', 'douban', 'homepage.html');
const OVERLAY = '#umm-douban-overlay';

const CARD_MARK = 'data-title=';

test.describe('douban movie homepage overlay (crawled fixture)', () => {
  test('fixture bytes really contain the host card markup this spec reads', async ({
    extContext,
  }) => {
    // Guards the whole file: an empty map would make every later assertion
    // vacuously true, so fail loudly if the fixture shape changed.
    const raw = fs.readFileSync(FIXTURE_FILE, 'utf8');
    expect(raw.length).toBeGreaterThan(1000);
    expect(raw.includes(CARD_MARK)).toBe(true);
    await installDoubanFixtureRoutes(extContext, [
      { host: 'movie.douban.com', match: '/', fixture: 'homepage' },
    ]);
    const page = await extContext.newPage();
    await page.goto('https://movie.douban.com/', { waitUntil: 'domcontentloaded' });
    const cards = await readHostSubjects(page);
    expect(cards.length, 'host DOM exposes title→subject pairs').toBeGreaterThan(5);
  });

  test('shell mounts, renders only titles present in the host DOM, and a card click opens that subject', async ({
    extContext,
  }) => {
    const routes = await installDoubanFixtureRoutes(extContext, [
      { host: 'movie.douban.com', match: '/', fixture: 'homepage' },
    ]);

    const page = await extContext.newPage();
    await page.goto('https://movie.douban.com/', { waitUntil: 'domcontentloaded' });
    // The document itself must have come from the fixture, not the empty net.
    expect(routes.served()).toContain('homepage');

    // document_start shell: host + open shadow root carrying a <style>.
    // In-page polling (waitForFunction) rather than expect.poll + evaluate: the
    // latter re-serialises the predicate every tick and timed out at 30 s while
    // the shell was already present at 186 ms (measured).
    await page.waitForFunction(
      () => !!document.getElementById('umm-douban-overlay')?.shadowRoot?.querySelector('style'),
      undefined,
      { timeout: 30_000 },
    );

    // document_idle app: grid cards rendered out of the host DOM.
    const titles = page.locator(`${OVERLAY} .umm-rec-item .umm-rec-title`);
    await expect(titles.first()).toBeVisible({ timeout: 60_000 });
    const rendered = (await titles.allInnerTexts()).map((t) => t.trim());
    expect(rendered.length).toBeGreaterThanOrEqual(3);

    const byTitle = new Map((await readHostSubjects(page)).map((c) => [c.title, c.id]));
    for (const t of rendered) {
      expect(byTitle.has(t), `rendered title not in host DOM: ${JSON.stringify(t)}`).toBe(true);
    }

    // Real interaction through the injected UI: a grid card click goes via
    // openExternalUrl, so the tab that appears proves the wiring AND that the
    // card kept the subject id belonging to its own title.
    const firstTitle = rendered[0] ?? '';
    const expectedId = byTitle.get(firstTitle);
    expect(expectedId, `host DOM has no subject for ${JSON.stringify(firstTitle)}`).toBeDefined();
    const popupPromise = extContext.waitForEvent('page');
    await titles.first().click();
    const popup = await popupPromise;
    expect(popup.url()).toBe(`https://movie.douban.com/subject/${expectedId}/`);
    await popup.close();
  });

  test('an external DB write flips exactly that card badge live, without reload', async ({
    extContext,
    extPage,
  }) => {
    await installDoubanFixtureRoutes(extContext, [
      { host: 'movie.douban.com', match: '/', fixture: 'homepage' },
    ]);
    const page = await extContext.newPage();
    await page.goto('https://movie.douban.com/', { waitUntil: 'domcontentloaded' });

    const cards = page.locator(`${OVERLAY} .umm-rec-item`);
    await expect(cards.first()).toBeVisible({ timeout: 60_000 });
    const rendered = (
      await page.locator(`${OVERLAY} .umm-rec-item .umm-rec-title`).allInnerTexts()
    ).map((t) => t.trim());
    expect(await page.locator(`${OVERLAY} .umm-status--wish`).count()).toBe(0);

    const title = rendered[0] ?? '';
    const id = (await readHostSubjects(page)).find((c) => c.title === title)?.id;
    expect(id, `host DOM has no subject for ${JSON.stringify(title)}`).toBeDefined();

    const res = await sendRuntimeMessage(extPage, 'DB_PUT', {
      storeName: DOUBAN_STORE,
      key: `movie::${id}`,
      record: makeStoreRecord(`https://movie.douban.com/subject/${id}/`, 1, 0),
    });
    expect(res.success).toBe(true);

    // Broadcast → cache re-read → exactly the written card changes, no navigation.
    const wish = page.locator(`${OVERLAY} .umm-status--wish`);
    await expect(wish).toHaveCount(1, { timeout: 30_000 });
    const target = cards.filter({ has: page.locator('.umm-rec-title', { hasText: title }) });
    await expect(target).toHaveCount(1);
    await expect(target.locator('.umm-status--wish')).toHaveCount(1);
    expect(page.url()).toBe('https://movie.douban.com/');
  });
});
