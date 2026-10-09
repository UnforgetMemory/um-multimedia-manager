import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';

initFileSandbox();
import { JSDOM } from 'jsdom';
import { handleBangumiListPage } from '@/entrypoints/content/handlers/bangumi-list';

/**
 * Bangumi browse-list read scoping (X58).
 *
 * The handler used to fall back to a WHOLE-STORE read whenever the visible `li`
 * elements yielded no parsable ids — including the "page type not recognised"
 * case, where the prefix is null and the marking loop cannot resolve a provider
 * id either. So that scan could never paint a row, yet it re-ran with each
 * mutation batch: the same degradation removed from the other list/collect pages.
 */

interface Sent {
  type: string;
  payload: { storeName?: string; keys?: string[] } | undefined;
}

function setup(pathname: string, listHtml: string): { sent: Sent[]; document: Document } {
  const dom = new JSDOM(
    `<!doctype html><html><body><div id="content"><ul class="browserFull browser-list">${listHtml}</ul></div></body></html>`,
    { url: `https://bgm.tv${pathname}`, pretendToBeVisual: true },
  );
  const sent: Sent[] = [];

  defineGlobal('window', dom.window);
  defineGlobal('document', dom.window.document);
  defineGlobal('location', dom.window.location);
  defineGlobal('navigator', dom.window.navigator);
  defineGlobal('Node', dom.window.Node);
  defineGlobal('Element', dom.window.Element);
  defineGlobal('HTMLElement', dom.window.HTMLElement);
  defineGlobal('SVGElement', dom.window.SVGElement);
  defineGlobal('MutationObserver', dom.window.MutationObserver);
  defineGlobal('localStorage', dom.window.localStorage);
  defineGlobal('sessionStorage', dom.window.sessionStorage);
  defineGlobal('chrome', {
    i18n: {
      getUILanguage: () => 'zh-CN',
      detectLanguage: () => 'zh-CN',
      getMessage: (key: string) => key,
    },
    storage: {
      local: {
        get: (_keys: string | string[], cb: (items: Record<string, unknown>) => void) => cb({}),
        set: (_items: unknown, cb?: () => void) => cb?.(),
      },
      onChanged: { addListener: () => {}, removeListener: () => {} },
    },
    runtime: {
      id: 'umm-test',
      lastError: undefined,
      sendMessage: (
        msg: { type: string; payload?: Sent['payload'] },
        cb?: (response: unknown) => void,
      ) => {
        sent.push({ type: msg.type, payload: msg.payload });
        cb?.({ success: true, records: [], entries: [] });
      },
      onMessage: { addListener: () => {}, removeListener: () => {} },
    },
  });

  return { sent, document: dom.window.document };
}

test('无 id 的列表项不再触发全表扫描', async () => {
  const { sent } = setup(
    '/anime/browser',
    '<li class="item odd clearit"><a href="/subject/1">无 id 条目</a></li>'.repeat(3),
  );

  await handleBangumiListPage();

  expect(sent.map((message) => message.type)).not.toContain('DB_GET_ALL');
  expect(sent.map((message) => message.type)).not.toContain('DB_GET_BULK');
});

// Path IS recognised (`/anime/browser/…` matches extractBrowserPathType); what
// makes the key set empty is the li carrying no `item_<digits>` id. A true
// prefix-null path never reaches this handler via the router gate.
test('无可解析 li id 时不读库（定向键集为空，不再全表回退）', async () => {
  const { sent } = setup(
    '/anime/browser/tag/xxx',
    '<li class="item"><a href="/subject/2">条目</a></li>',
  );

  await handleBangumiListPage();

  expect(sent.map((message) => message.type)).not.toContain('DB_GET_ALL');
});

test('有 id 时仍走定向批量读，键为 tv::<subjectId>', async () => {
  const { sent } = setup(
    '/anime/browser',
    '<li id="item_545465" class="item odd clearit"><a href="/subject/545465">番</a></li>' +
      '<li id="item_999" class="item odd clearit"><a href="/subject/999">番2</a></li>',
  );

  await handleBangumiListPage();

  const bulk = sent.find((message) => message.type === 'DB_GET_BULK');
  expect(bulk, 'expected a targeted bulk read').toBeTruthy();
  expect(bulk?.payload?.keys).toEqual(['tv::545465', 'tv::999']);
  expect(sent.map((message) => message.type)).not.toContain('DB_GET_ALL');
});
