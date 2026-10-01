/**
 * X98 — the Sehuatang header menu's two panels (手动添加 / 查看已看), driven with
 * real clicks in a real browser against the built extension.
 *
 * These are the legacy content-script controls that the Sehuatang overlay wires
 * into its own header (`scenario/sehuatang/header.ts` → `openSehuatangMenu` →
 * `showManualAddPanel` / `showCheckViewedPanel`). X83 named them as "legacy
 * handler controls, never really clicked": every earlier Sehuatang spec asserted
 * render/dim state, and the two panels — the only place a user can type an id
 * into the watched stores by hand — had zero interaction coverage.
 *
 * What is pinned, and why each is the discriminating observation:
 *  - a save really reaches IndexedDB through the message path, verified by
 *    reading the key back from whichever store the id classifier chose (the
 *    panel itself only clears its input, which a no-op handler would also do if
 *    the test stopped there);
 *  - the empty-input branch writes nothing (a silent `return`, so the only
 *    evidence is "no new key");
 *  - the JSON branch's parse failure raises a dialog AND writes nothing;
 *  - the check panel's two shapes differ: a seeded id reports a rating row, an
 *    unseeded one reports no rating row — asserting only "some text appeared"
 *    would pass on either.
 *  - all three dismissal paths (Escape, close button, backdrop click) actually
 *    remove the panel, and re-opening does not stack a second one.
 */

import type { BrowserContext, Page } from '@playwright/test';
import { expect, test } from './fixtures/extension-harness';
import { installSehuatangMocks } from './fixtures/host-mocks';
import {
  readAllKeys,
  readRecord,
  seedAdultRecord,
  waitForBackgroundReady,
} from './fixtures/host-mocks';
import { sehuatangListHtml, sehuatangThreadDetailHtml } from './fixtures/sehuatang-page';
import {
  JAV_IDS_STORE_NAME,
  SEHUATANG_IDS_STORE_NAME,
  USAV_IDS_STORE_NAME,
} from '@/provider/adult-av/models';

const LIST_URL = 'https://www.sehuatang.net/forum-9-1.html';
/** The header's menu button — NOT the sibling action button that shares its class. */
const MENU_BTN = 'button.umm-sht-action[aria-haspopup="dialog"]';
const STORES = [JAV_IDS_STORE_NAME, USAV_IDS_STORE_NAME, SEHUATANG_IDS_STORE_NAME] as const;

const alt = (...parts: string[]): RegExp =>
  new RegExp(parts.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'));

async function openList(extContext: BrowserContext, extPage: Page): Promise<Page> {
  await installSehuatangMocks(extContext, {
    listHtml: sehuatangListHtml(),
    threadDetailHtml: sehuatangThreadDetailHtml({
      coverUrl: 'https://www.sehuatang.net/data/attachment/forum/cover-e2e.jpg',
      magnet: 'magnet:?xt=urn:btih:E2E00000000000000000000000000000000E2E0',
    }),
  });
  // Cold-worker gate: one completed DB round trip before the tab exists, or the
  // mount-time batch check races the first IndexedDB open (see host-mocks).
  await waitForBackgroundReady(extPage);
  const page = await extContext.newPage();
  await page.goto(LIST_URL, { waitUntil: 'domcontentloaded' });
  await expect(page.locator(MENU_BTN)).toBeVisible({ timeout: 60_000 });
  return page;
}

async function openPanel(page: Page, item: RegExp): Promise<void> {
  await page.locator(MENU_BTN).click();
  const entry = page.locator('.umm-sht-menu-item', { hasText: item }).first();
  await expect(entry, `菜单里没有 ${item} 这一项`).toBeVisible({ timeout: 10_000 });
  await entry.click();
}

async function allWatchedKeys(extPage: Page): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  for (const store of STORES) out[store] = await readAllKeys(extPage, store);
  return out;
}

/** Keys that appeared anywhere across the three watched stores. */
function addedKeys(before: Record<string, string[]>, after: Record<string, string[]>): string[] {
  const added: string[] = [];
  for (const store of STORES) {
    const prev = new Set(before[store] ?? []);
    added.push(...(after[store] ?? []).filter((k) => !prev.has(k)));
  }
  return added;
}

test.describe('Sehuatang 手动添加 / 查看已看面板', () => {
  test('菜单打开手动添加面板，三条关闭路径都真的移除面板', async ({ extContext, extPage }) => {
    const page = await openList(extContext, extPage);

    await openPanel(page, alt('Manual Add', '手动添加'));
    const input = page.locator('#umm-add-input');
    await expect(input).toBeVisible({ timeout: 10_000 });
    // The panel focuses its input on open — the affordance that makes the Enter
    // shortcut work, so it is asserted rather than assumed.
    expect(
      await input.evaluate((el) => el === document.activeElement),
      '面板打开后输入框未获得焦点',
    ).toBe(true);

    await page.keyboard.press('Escape');
    await expect(input, 'Escape 没关面板').toHaveCount(0);

    await openPanel(page, alt('Manual Add', '手动添加'));
    await expect(input).toBeVisible({ timeout: 10_000 });
    await page.locator('#umm-add-close').click();
    await expect(input, '关闭按钮没关面板').toHaveCount(0);

    await openPanel(page, alt('Manual Add', '手动添加'));
    await expect(input).toBeVisible({ timeout: 10_000 });
    // While it is open the panel is modal: the point under the menu trigger hits
    // this overlay, not the button. That is what `.umm-overlay`'s
    // z-index:2147483001 buys (it must clear the Sehuatang shell at …000), so a
    // lowered tier shows up here instead of silently making the panel
    // click-through. It also means the `if (getElementById) return` re-open
    // guard is a programmatic safety net, not a UI-reachable path.
    const box = await page.locator(MENU_BTN).boundingBox();
    expect(box, '夹具丢了菜单触发器').toBeTruthy();
    // Playwright pierces the open shadow root to get that box; the hit test below
    // runs in the light DOM, where a node inside a shadow root reports as its
    // host — so "the topmost thing here is the modal" is a real stacking claim,
    // not a tautology.
    const covered = await page.evaluate(
      (pt: { x: number; y: number }) => {
        const hit = document.elementFromPoint(pt.x, pt.y);
        return hit?.closest('.umm-overlay')?.id ?? 'trigger-reachable';
      },
      { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 },
    );
    expect(covered, '面板没有盖住菜单触发器（遮罩层不再模态）').toBe('umm-manual-add-overlay');

    // Backdrop click: `e.target === overlay` is the close condition, so aim at
    // the overlay itself, at a corner far from the centered panel. Address it by
    // its own id — `.umm-overlay` is a shared class (the menu panel uses it too)
    // and `.first()` lands on the other one, which sits underneath.
    await page.locator('#umm-manual-add-overlay').click({ position: { x: 6, y: 6 } });
    await expect(input, '点遮罩没关面板').toHaveCount(0);
  });

  test('手动添加真的写进已看库：输入框清空，且记录可按规范化后的番号读回', async ({
    extContext,
    extPage,
  }) => {
    const page = await openList(extContext, extPage);
    const before = await allWatchedKeys(extPage);

    await openPanel(page, alt('Manual Add', '手动添加'));
    const raw = 'e2e jp 9001';
    await page.locator('#umm-add-input').fill(raw);
    await page.locator('#umm-add-rating').selectOption({ index: 8 });
    await page.locator('#umm-add-save').click();

    // The background handler stores `${source}::${normalizeAvId(id)}`, and
    // normalizeAvId is uppercase + whitespace→'-'. Deriving the key here (rather
    // than copying it) is what makes "the record came back" a real round trip.
    const expectedKey = `manual::${raw.toUpperCase().trim().replace(/\s+/g, '-')}`;
    await expect(page.locator('#umm-add-input'), '保存后输入框未清空').toHaveValue('');

    const after = await allWatchedKeys(extPage);
    const added = addedKeys(before, after);
    expect(added, '保存没有在任何已看库留下记录').toContain(expectedKey);

    const store = STORES.find((s) => (after[s] ?? []).includes(expectedKey))!;
    const res = await readRecord(extPage, store, expectedKey);
    expect(res.success, `DB_GET 没能读回 ${expectedKey}`).toBe(true);
    // The selected star must be what came back — asserting the serialized
    // envelope keeps the check honest if the response nests the record.
    expect(JSON.stringify(res), '评分没有按所选值写入').toContain('"rating":8');
  });

  // Scope stated honestly: this pins the OBSERVABLE no-op (nothing written, no
  // dialog, panel stays open). It cannot pin the panel's own `if (!val) return;` —
  // measured: deleting that line leaves all cases here green, because the
  // background handler rejects an empty id too (`handleAdultAvAdd`'s
  // `if (!id || !source)`) and `sendMsg` throws before the clear runs. The guard
  // itself is pinned in tests/unit/content-panel-guards.spec.ts, where the
  // observable is the message count.
  test('空输入保存是静默无操作：不写库、不弹提示、面板保持打开', async ({
    extContext,
    extPage,
  }) => {
    const page = await openList(extContext, extPage);
    const before = await allWatchedKeys(extPage);
    let dialogs = 0;
    page.on('dialog', (d) => {
      dialogs++;
      void d.dismiss();
    });

    await openPanel(page, alt('Manual Add', '手动添加'));
    await page.locator('#umm-add-save').click();
    await page.waitForTimeout(500);

    expect(await allWatchedKeys(extPage).then((a) => addedKeys(before, a)), '空输入写了库').toEqual(
      [],
    );
    expect(dialogs, '空输入弹了提示').toBe(0);
    await expect(page.locator('#umm-add-input'), '空输入后面板自己关了').toBeVisible();
  });

  test('批量 JSON 解析失败只弹提示，且不写任何库', async ({ extContext, extPage }) => {
    const page = await openList(extContext, extPage);
    const before = await allWatchedKeys(extPage);
    const seen: string[] = [];
    page.on('dialog', (d) => {
      seen.push(d.message());
      void d.dismiss();
    });

    await openPanel(page, alt('Manual Add', '手动添加'));
    // Square brackets route into the JSON branch; this body cannot parse.
    await page.locator('#umm-add-input').fill('[{"id": broken }]');
    await page.locator('#umm-add-save').click();

    // Pin the dialog's TEXT, not merely that "some dialog appeared": a count-only
    // assertion stays green when the alert is swapped for any other message
    // (review finding). 'JSON' is a substring of `t('Invalid JSON')` in all four
    // content locales, so this does not depend on which language the page resolved.
    await expect
      .poll(() => seen.join('|'), { message: '非法 JSON 没有弹出可读提示' })
      .toContain('JSON');
    expect(
      await allWatchedKeys(extPage).then((a) => addedKeys(before, a)),
      '解析失败的批量输入仍写了库',
    ).toEqual([]);
    // The guard returns before clearing: the user keeps their input to fix it.
    await expect(page.locator('#umm-add-input')).toHaveValue('[{"id": broken }]');
  });

  test('查看已看：已入库的番号给评分行，未入库的只给未看状态', async ({ extContext, extPage }) => {
    const page = await openList(extContext, extPage);
    const seeded = 'E2ECV-7001';
    const seed = await seedAdultRecord(extPage, JAV_IDS_STORE_NAME, seeded, LIST_URL);
    expect(seed.success, '前置：夹具没能写入一条已看记录').toBe(true);

    await openPanel(page, alt('Check Viewed', '查看已看', '检查已看'));
    const input = page.locator('#umm-cv-input');
    await expect(input).toBeVisible({ timeout: 10_000 });

    await input.fill(seeded.toLowerCase());
    await page.locator('#umm-cv-check').click();
    const result = page.locator('#umm-cv-result');
    await expect(result.locator('div').first(), '查询没有产出结果行').toBeVisible();
    await expect(result, '已入库番号未给出评分行（说明没读到记录）').toContainText('/ 10');

    await input.fill('E2ECV-0000');
    await page.locator('#umm-cv-check').click();
    // doCheck is async (getAll → render), so the previous 3-row result can still
    // be on screen when the click resolves. Poll to the settled state instead of
    // counting immediately — the claim is "an unknown ID yields ONLY the status
    // row", which is only observable after the second render lands.
    await expect
      .poll(() => result.locator('div').count(), {
        message: '未入库番号也产出了多行（应只有状态行）',
      })
      .toBe(1);
    await expect(result, '未入库番号却显示了评分').not.toContainText('/ 10');
  });
});
