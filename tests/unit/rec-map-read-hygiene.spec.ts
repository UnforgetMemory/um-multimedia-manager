import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';

initFileSandbox();
import { JSDOM } from 'jsdom';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Record-map read hygiene (ADR-015 §7.1, X31-B).
 *
 * `loadRecordMap` has a documented fall-through: no id list (or an empty one)
 * means "walk the whole store". That is correct for a page that genuinely wants
 * every record and catastrophic for a page that merely wants the rows it can
 * see — an empty section pays a full IndexedDB scan on its mount path.
 *
 * Two halves:
 *  1. the fall-through itself, pinned against a message stub so the guarded
 *     helpers' reason to exist stays measurable;
 *  2. a structural pass over EVERY douban page config, because the fall-through
 *     is invisible in a code review — `loadRecordMap('game', ids)` reads fine.
 *     The scan enumerates the pages directory rather than trusting a list, so a
 *     new page cannot slip past unexamined.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGES_DIR = path.resolve(HERE, '../../src/scenario/douban/pages');

type MapModule = typeof import('@/scenario/douban/shared/load-record-map');
let mapPromise: Promise<MapModule> | null = null;
function loadMap(): Promise<MapModule> {
  loaderAnchor();
  mapPromise ??= import('@/scenario/douban/shared/load-record-map');
  return mapPromise;
}

/** The record-cache core touches DOM globals at import time. */
function loaderAnchor(): void {
  defineGlobal(
    'window',
    new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://movie.douban.com/' })
      .window,
  );
}

interface SentMessage {
  type: string;
  payload: unknown;
}

/** Install a chrome.runtime stub that answers every DB read with an empty store. */
function installStoreStub(): SentMessage[] {
  const sent: SentMessage[] = [];
  defineGlobal('chrome', {
    runtime: {
      id: 'test-extension',
      lastError: undefined,
      sendMessage: (msg: SentMessage, cb?: (res: unknown) => void) => {
        sent.push(msg);
        if (msg.type === 'DB_GET_BULK') {
          cb?.({ success: true, entries: [] });
          return;
        }
        cb?.({ success: true, entries: [], record: null });
      },
    },
  });
  return sent;
}

test.describe('loadRecordMap 的全表扫 fall-through（守卫助手存在的理由）', () => {
  test('空 id 数组 → 落到 DB_GET_ALL（这就是 config 页必须改走守卫版的原因）', async () => {
    const sent = installStoreStub();
    const { loadRecordMap } = await loadMap();
    await loadRecordMap('movie', []);
    expect(sent.map((m) => m.type)).toEqual(['DB_GET_ALL']);
  });

  test('id 数组缺省（解析未产出条目）→ 同样落到 DB_GET_ALL', async () => {
    const sent = installStoreStub();
    const { loadRecordMap } = await loadMap();
    await loadRecordMap('game', undefined);
    expect(sent.map((m) => m.type)).toEqual(['DB_GET_ALL']);
  });
});

test.describe('页面 config 读取卫生：禁止裸 loadRecordMap', () => {
  function configFiles(): string[] {
    return fs
      .readdirSync(PAGES_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(PAGES_DIR, entry.name, 'config.ts'))
      .filter((file) => fs.existsSync(file));
  }

  test('枚举到了页面（扫描本身不能静默空转）', () => {
    expect(configFiles().length).toBeGreaterThanOrEqual(30);
  });

  // Negative seed: the guard is worthless if a typo in the pattern makes every
  // assertion pass vacuously. `loadRecordMap(` must be detectable while
  // `loadRecordMapForIds(` stays acceptable.
  test('正则能区分裸调用与守卫调用（守卫自证）', () => {
    const bare = "const m = await loadRecordMap('movie', ids);";
    const guarded = "const m = await loadRecordMapForIds('movie', ids);";
    expect(/loadRecordMap\(/.test(bare)).toBe(true);
    expect(/loadRecordMap\(/.test(guarded)).toBe(false);
    expect(/loadRecordMapFor(Ids|Keys)\(/.test(guarded)).toBe(true);
  });

  test('任何页面 config 都不裸调 loadRecordMap', () => {
    const offenders = configFiles()
      .filter((file) => /loadRecordMap\(/.test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(PAGES_DIR, file));
    expect(offenders).toEqual([]);
  });

  // Pages that seed a record map must route through a guard that resolves an
  // empty id/keys list to an empty map — deleting the call entirely would make
  // the badges silently seedless, so the call site is asserted per page.
  for (const page of [
    'albums',
    'game-explore',
    'personage',
    'personage-creations',
    'search',
    'series',
  ]) {
    test(`${page} 走 loadRecordMapForIds`, () => {
      const src = fs.readFileSync(path.join(PAGES_DIR, page, 'config.ts'), 'utf8');
      expect(src).toMatch(/loadRecordMapForIds\(/);
    });
  }

  test('doulist-detail 走 loadRecordMapForKeys（键数组版，无前缀）', () => {
    const src = fs.readFileSync(path.join(PAGES_DIR, 'doulist-detail', 'config.ts'), 'utf8');
    expect(src).toMatch(/loadRecordMapForKeys\(/);
  });
});
