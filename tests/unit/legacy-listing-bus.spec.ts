import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Legacy listing entries must arm the event bus (X32).
 *
 * A listing pass driven only by a MutationObserver reacts to host DOM changes,
 * never to a record written from the popup, another tab or a sync run. The bus
 * is the only channel that can reach an already-rendered row — and the same
 * channel has silently failed before (a Service Worker's runtime message does
 * not reach injected scripts, so the tabs leg is what makes refresh work at all).
 *
 * Structural rather than behavioural because the failure mode is an omission: a
 * file that never subscribes produces no error anywhere, and the listing simply
 * shows stale verdicts until the page reloads.
 */

const ENTRY_DIR = path.resolve(process.cwd(), 'src/entrypoints');
/** Only these two entries drive a chunked listing pass today. */
const LISTING_CALL = /runYoutubeListingPass\(|runListingDimmerPass\(/;
const REQUIRED = {
  'initEventBus() armed': /initEventBus\(\)/,
  'record:updated subscribed': /onEvent\(\s*'record:updated'/,
  'record:deleted subscribed': /onEvent\(\s*'record:deleted'/,
  'processed marks cleared per key': /invalidateProcessedRows\(/,
};

function listingEntries(): string[] {
  const found: string[] = [];
  for (const dir of fs.readdirSync(ENTRY_DIR)) {
    const file = path.join(ENTRY_DIR, dir, 'index.ts');
    if (!fs.existsSync(file)) continue;
    if (LISTING_CALL.test(fs.readFileSync(file, 'utf8'))) found.push(file);
  }
  return found.sort();
}

test.describe('legacy listing 入口必须挂上事件总线', () => {
  test('扫描确实命中列表入口（守卫不能空转）', () => {
    const entries = listingEntries().map((file) => path.relative(ENTRY_DIR, file));
    expect(entries).toEqual([
      path.join('bilibili-homepage.content', 'index.ts'),
      path.join('youtube-homepage.content', 'index.ts'),
    ]);
  });

  // Negative seed: without this the regexes could all be vacuously true.
  test('必需项判定能区分接线与未接线（守卫自证）', () => {
    const unwired = `
      function scan(): void { void runListingDimmerPass({ root: document }); }
    `;
    const wired = `
      initEventBus();
      const off = onEvent('record:updated', onRecordChange);
      onEvent('record:deleted', onRecordChange);
      if (invalidateProcessedRows(document, key) > 0) void scan();
    `;
    for (const rule of Object.values(REQUIRED)) {
      expect(rule.test(unwired)).toBe(false);
      expect(rule.test(wired)).toBe(true);
    }
  });

  test('每个列表入口都订阅两事件并脏化已处理标记', () => {
    for (const file of listingEntries()) {
      const src = fs.readFileSync(file, 'utf8');
      const missing = Object.entries(REQUIRED)
        .filter(([, rule]) => !rule.test(src))
        .map(([name]) => name);
      expect(missing, `${path.relative(ENTRY_DIR, file)} 缺事件接线`).toEqual([]);
    }
  });

  test('订阅随列表下线释放（不做跨路由活体订阅）', () => {
    for (const file of listingEntries()) {
      const src = fs.readFileSync(file, 'utf8');
      expect(src).toMatch(/let releaseRecordSub/);
      expect(src).toMatch(/releaseRecordSub\?\.\(\);/);
    }
  });
});
