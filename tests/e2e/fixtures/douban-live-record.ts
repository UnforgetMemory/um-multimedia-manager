/**
 * Shared live-refresh round trip for the Douban overlay specs.
 *
 * Extracted from `x27b-douban-music.spec.ts` (which had grown to the exact
 * 600-line ceiling) so the same write → mark → delete → unmark sequence can be
 * reused without copying it, and so a card-scoping regression has one place to
 * be caught instead of one per page type.
 *
 * Everything runs inside the SAME document — no reload — because the contract
 * under test is the `record:updated` / `record:deleted` broadcast path (ADR-015),
 * which a reload would mask.
 */

import type { Locator, Page } from '@playwright/test';
import { DOUBAN_STORE, expect, makeStoreRecord, sendRuntimeMessage } from './extension-harness';

const OVERLAY = '#umm-douban-overlay';

/**
 * Write → mark → delete → unmark, all inside the same document (no reload).
 *
 * `ownCards` is the card set the written subject owns; the helper asserts it is
 * exactly one (callers join on a key the host proves unique), that lighting that
 * card up does NOT light up any other subject's card, and that deleting clears
 * the badge again.
 */
export async function liveRecordRoundTrip(
  extPage: Page,
  page: Page,
  key: string,
  recordUrl: string,
  ownCards: Locator,
): Promise<void> {
  const wish = page.locator(`${OVERLAY} .umm-status--wish`);
  // Every caller joins on a key the host proves unique, so exactly one card.
  const ownCount = await ownCards.count();
  expect(ownCount, 'the written subject owns exactly one card').toBe(1);
  // Start from "no record": also resets anything an earlier test wrote here.
  const del = await sendRuntimeMessage(extPage, 'DB_DELETE', { storeName: DOUBAN_STORE, key });
  expect(del.success).toBe(true);
  await expect(wish).toHaveCount(0, { timeout: 30_000 });
  const put = await sendRuntimeMessage(extPage, 'DB_PUT', {
    storeName: DOUBAN_STORE,
    key,
    record: makeStoreRecord(recordUrl, 1, 0),
  });
  expect(put.success).toBe(true);
  await expect(ownCards.locator('.umm-status--wish')).toHaveCount(ownCount, { timeout: 30_000 });
  // No other subject's card may light up — a prefix/id mix-up would mark more.
  await expect(wish).toHaveCount(ownCount);
  const del2 = await sendRuntimeMessage(extPage, 'DB_DELETE', { storeName: DOUBAN_STORE, key });
  expect(del2.success).toBe(true);
  await expect(wish).toHaveCount(0, { timeout: 30_000 });
}
