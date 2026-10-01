import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';

initFileSandbox();
import { JSDOM } from 'jsdom';
import { injectNeoDBPushButtons } from '@/entrypoints/content/neodb-push';
import type { StoreRecord, UrlIdentity } from '@/types';

/**
 * NeoDB push buttons must always leave the loading state.
 *
 * While a push is in flight the handler disables the injected buttons and gives
 * them pointer-events:none. Two exits returned early (missing NeoDB token,
 * background unreachable after retries) and skipped the restore, so the buttons
 * stayed dead until a full page reload.
 */

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'https://movie.douban.com/subject/12345/',
  pretendToBeVisual: true,
});
defineGlobal('document', dom.window.document);
defineGlobal('window', dom.window);
defineGlobal('Element', dom.window.Element);
defineGlobal('HTMLElement', dom.window.HTMLElement);
defineGlobal('Node', dom.window.Node);
defineGlobal('MutationObserver', dom.window.MutationObserver);

// The toast helper schedules its "show" class on the next frame; without rAF the
// toast call throws and the handler's catch hides the very exit path under test.
defineGlobal('requestAnimationFrame', (cb: (time: number) => void) =>
  setTimeout(() => cb(Date.now()), 16),
);
defineGlobal('cancelAnimationFrame', (handle: ReturnType<typeof setTimeout>) =>
  clearTimeout(handle),
);

// jsdom has no HTMLElement.innerText; scanDoubanPageStatus reads it.
Object.defineProperty(dom.window.HTMLElement.prototype, 'innerText', {
  get() {
    return this.textContent ?? '';
  },
  set(value: string) {
    this.textContent = value;
  },
  configurable: true,
});

const identity: UrlIdentity = {
  platform: 'douban',
  type: 'movie',
  providerId: '12345',
  url: 'https://movie.douban.com/subject/12345/',
};

const watchedRecord: StoreRecord = {
  url: 'https://movie.douban.com/subject/12345/',
  status: 2,
  rating: 8,
  comment: '',
  updatedAt: '2026-09-01T00:00:00.000Z',
  linkedIds: {},
};

interface SentMessage {
  type: string;
  payload?: unknown;
}

function installChromeStub(opts: { neodbToken?: string; unreachable?: boolean }): SentMessage[] {
  const sent: SentMessage[] = [];
  const stub = {
    runtime: {
      id: 'test-extension',
      lastError: undefined as { message: string } | undefined,
      sendMessage: (msg: SentMessage, cb?: (res: unknown) => void) => {
        sent.push(msg);
        if (opts.unreachable === true && msg.type === 'NEODB_PUSH_RATING') {
          stub.runtime.lastError = { message: 'Receiving end does not exist.' };
          cb?.(undefined);
          stub.runtime.lastError = undefined;
          return;
        }
        let response: unknown = { success: true };
        if (msg.type === 'GET_SETTINGS') {
          response =
            opts.neodbToken === undefined
              ? { success: true, settings: {} }
              : { success: true, settings: { neodbToken: opts.neodbToken } };
        } else if (msg.type === 'NEODB_PUSH_RATING') {
          response = { success: true, catalogUuid: 'uuid-1' };
        } else if (msg.type === 'DB_GET') {
          response = { success: true, record: null };
        }
        cb?.(response);
      },
      onMessage: { addListener: () => {} },
    },
    storage: { local: { get: async () => ({}) }, onChanged: { addListener: () => {} } },
  };
  defineGlobal('chrome', stub);
  return sent;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Renders the buttons, clicks "push current rating", and asserts the loading state started. */
function clickPush(): void {
  document.body.innerHTML = '<div id="interest_sect_level"></div>';
  injectNeoDBPushButtons(identity, watchedRecord);
  const btn = livePushBtn();
  expect(btn).not.toBeNull();
  btn?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  // The handler disables the buttons synchronously, before its first await.
  expect(btn?.hasAttribute('disabled')).toBe(true);
}

/** The button the user actually sees — a successful push re-renders the container. */
function livePushBtn(): HTMLElement | null {
  return document.getElementById('umm-push-original');
}

/** The loading state is three properties — none of them may survive the push. */
function loadingState(): { disabled: boolean; opacity: string; pointerEvents: string } {
  const btn = livePushBtn();
  return {
    disabled: btn?.hasAttribute('disabled') ?? false,
    opacity: btn?.style.opacity ?? '',
    pointerEvents: btn?.style.pointerEvents ?? '',
  };
}

const released = { disabled: false, opacity: '', pointerEvents: '' };

test.afterEach(() => {
  defineGlobal('chrome', undefined);
  document.body.innerHTML = '';
});

test.describe('pushToNeoDB — loading state is always released', () => {
  test('missing NeoDB token: buttons are restored instead of staying disabled', async () => {
    const sent = installChromeStub({});
    clickPush();
    await sleep(300);
    // No token ⇒ the handler bails before the push message; this is the early return.
    expect(sent.map((m) => m.type)).toEqual(['GET_SETTINGS']);
    expect(loadingState()).toEqual(released);
  });

  test('background unreachable after retries: buttons are restored', async () => {
    const sent = installChromeStub({ neodbToken: 'tok', unreachable: true });
    clickPush();
    // Two attempts with one exponential-backoff sleep between them.
    await sleep(2000);
    expect(sent.filter((m) => m.type === 'NEODB_PUSH_RATING').length).toBeGreaterThan(0);
    expect(loadingState()).toEqual(released);
  });

  test('successful push leaves the re-rendered buttons usable', async () => {
    const sent = installChromeStub({ neodbToken: 'tok' });
    clickPush();
    await sleep(400);
    expect(sent.filter((m) => m.type === 'NEODB_PUSH_RATING').length).toBe(1);
    expect(loadingState()).toEqual(released);
  });
});
