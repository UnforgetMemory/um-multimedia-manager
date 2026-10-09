import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';

initFileSandbox();
import { JSDOM } from 'jsdom';
import biliDetailEntry from '@/entrypoints/bilibili.content/index';
import biliHomeEntry from '@/entrypoints/bilibili-homepage.content/index';
import ytEntry from '@/entrypoints/youtube-homepage.content/index';
import { bootstrapLogging } from '@/entrypoints/content/bootstrap/logging';
import { configureLogging, debugLog, errorLog, infoLog } from '@/libraries/utils/logger';
import { STORAGE_KEYS } from '@/libraries/config';

/**
 * 日志引导的共享实现（bootstrapLogging）与其逐入口接线。
 *
 * logger 的默认值是 `import.meta.env.DEV`（生产恒关），Options 页的「调试日志」
 * 开关与级别选择只写进 chrome.storage。只有把这两个键读进 configureLogging 并在
 * onChanged 上持续跟，用户的开关才有意义；此前只有 background 与 legacy content
 * 做了这件事，三个视频入口从来没读过 —— 现象是「用户开了日志，视频站照样一行不打，
 * 线上无法取证」。
 *
 * 本文件钉住三段：
 *  1. 引导实现的行为（读存储 → 生效；onChanged → 再生效；disposer → 释放；幂等；
 *     无 storage 时不得抛，否则既有入口夹具全崩）；
 *  2. 三个视频入口的 main() 真的走到这一步（跑真实入口 main，中性 URL 下其余流程
 *     自然短路，只有日志初始化留下痕迹）；
 *  3. legacy content.ts 的等价接线（静态可达性在 x26e-entry-init-parity 里钉）。
 *
 * logger 是 worker 级单例：本文件 serial 跑，且每条用例自己复位开关与监听器。
 */

test.describe.configure({ mode: 'serial' });

interface StorageStub {
  chrome: Record<string, unknown>;
  fire: (changes: Record<string, { newValue?: unknown }>, area?: string) => void;
  listenerCount: () => number;
}

/**
 * Minimal chrome stub with a *callback-capable* storage.local.get (theme-sync
 * style call sites pass a callback, settings items await a promise).
 */
function stubChrome(storageValues: Record<string, unknown> | null): StorageStub {
  const listeners: Array<(changes: Record<string, { newValue?: unknown }>, area: string) => void> =
    [];
  const local =
    storageValues === null
      ? undefined
      : {
          get: (
            _keys: unknown,
            cb?: (result: Record<string, unknown>) => void,
          ): Promise<Record<string, unknown>> => {
            const result = { ...storageValues };
            cb?.(result);
            return Promise.resolve(result);
          },
          set: async (): Promise<void> => {},
          remove: async (): Promise<void> => {},
        };
  const chrome: Record<string, unknown> = {
    runtime: {
      id: 'test-extension',
      lastError: undefined,
      onMessage: { addListener: () => {} },
      sendMessage: (_msg: unknown, cb?: (r: unknown) => void): void => {
        cb?.({ success: true, record: null, entries: [] });
      },
    },
    storage: local ? { local, onChanged: listenerApi(listeners) } : undefined,
  };
  return {
    chrome,
    listenerCount: () => listeners.length,
    fire: (changes, area = 'local') => {
      for (const l of [...listeners]) l(changes, area);
    },
  };
}

function listenerApi(
  listeners: Array<(changes: Record<string, { newValue?: unknown }>, area: string) => void>,
): {
  addListener: (cb: (typeof listeners)[number]) => void;
  removeListener: (cb: (typeof listeners)[number]) => void;
} {
  return {
    addListener: (cb) => {
      if (!listeners.includes(cb)) listeners.push(cb);
    },
    removeListener: (cb) => {
      const i = listeners.indexOf(cb);
      if (i >= 0) listeners.splice(i, 1);
    },
  };
}

interface Captured {
  lines: string[];
  restore: () => void;
}

/** Capture the logger's four console outlets without touching `console.*` in src. */
function captureConsole(): Captured {
  const lines: string[] = [];
  const original = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
  };
  const record =
    (tag: string): ((...args: unknown[]) => void) =>
    (...args: unknown[]): void => {
      lines.push(`${tag}|${args.map((a) => String(a)).join(' ')}`);
    };
  console.log = record('log');
  console.info = record('info');
  console.warn = record('warn');
  console.error = record('error');
  return {
    lines,
    restore: () => {
      console.log = original.log;
      console.info = original.info;
      console.warn = original.warn;
      console.error = original.error;
    },
  };
}

/** What the logger actually emitted for one debug + one info + one error line. */
function probeLogger(): { debug: boolean; info: boolean; error: boolean } {
  const cap = captureConsole();
  try {
    debugLog('probe-debug');
    infoLog('probe-info');
    errorLog('probe-error');
  } finally {
    cap.restore();
  }
  return {
    debug: cap.lines.some((l) => l.includes('probe-debug')),
    info: cap.lines.some((l) => l.includes('probe-info')),
    error: cap.lines.some((l) => l.includes('probe-error')),
  };
}

/** Real macrotask boundary: entry `main()`s fire-and-forget their bootstrap. */
async function settle(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

/** Neutral page: every entry's own route detection short-circuits on it. */
function mountNeutral(url: string): Document {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url,
    pretendToBeVisual: true,
  });
  Object.defineProperty(dom.window, 'matchMedia', {
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
    configurable: true,
  });
  defineGlobal('window', dom.window);
  defineGlobal('document', dom.window.document);
  defineGlobal('location', dom.window.location);
  defineGlobal('history', dom.window.history);
  defineGlobal('navigator', dom.window.navigator);
  defineGlobal('Element', dom.window.Element);
  defineGlobal('HTMLElement', dom.window.HTMLElement);
  defineGlobal('HTMLVideoElement', dom.window.HTMLVideoElement);
  defineGlobal('Node', dom.window.Node);
  defineGlobal('MutationObserver', dom.window.MutationObserver);
  // Deferred/frame work must never run here: only the logging bootstrap is under test.
  defineGlobal('requestAnimationFrame', () => 0);
  defineGlobal('cancelAnimationFrame', () => {});
  defineGlobal('setTimeout', () => 0);
  defineGlobal('clearTimeout', () => {});
  defineGlobal('setInterval', () => 0);
  defineGlobal('clearInterval', () => {});
  return dom.window.document;
}

function runMain(entry: { main: () => void }): void {
  entry.main();
}

const DEBUG_ON = { [STORAGE_KEYS.DEBUG_ENABLED]: true, [STORAGE_KEYS.LOG_LEVEL]: 'debug' };
const DEBUG_OFF = { [STORAGE_KEYS.DEBUG_ENABLED]: false, [STORAGE_KEYS.LOG_LEVEL]: 'info' };

const releases: Array<() => void> = [];

test.afterEach(() => {
  for (const release of releases.splice(0)) release();
  configureLogging({ enabled: false, level: 'info' });
});

test.describe('bootstrapLogging — 共享实现的行为', () => {
  test('存储里的开关与级别灌进 logger（生产默认是关的）', async () => {
    const stub = stubChrome(DEBUG_ON);
    defineGlobal('chrome', stub.chrome);
    releases.push(await bootstrapLogging());
    expect(probeLogger()).toEqual({ debug: true, info: true, error: true });
  });

  test('存储说关就是关：级别 debug 也不得放行日志', async () => {
    const stub = stubChrome({
      [STORAGE_KEYS.DEBUG_ENABLED]: false,
      [STORAGE_KEYS.LOG_LEVEL]: 'debug',
    });
    defineGlobal('chrome', stub.chrome);
    configureLogging({ enabled: true, level: 'debug' });
    releases.push(await bootstrapLogging());
    expect(probeLogger()).toEqual({ debug: false, info: false, error: false });
  });

  test('时序（X111 受控场景）：storage 读完成前的日志走默认值且不追发，await 之后才按设置放行', async () => {
    // X103 遗留的收口：bootstrapLogging 是异步的——「读到设置」不保证「首条日志之前
    // 读到」。即便 stub 立即兑现，logging.ts 里的 `await Promise.all([...])` 也把
    // 「读到设置」推到微任务之后，同步的 `infoLog('early')` 本来就落在窗口里；
    // **闸门 stub** 的作用是把窗口从微任务级**加宽到宏任务级**（抗实现里多一层
    // await 的漂移），不是在造唯一的窗口。契约按实测钉死：窗口内的日志按当时的配置
    // 执行且**不缓冲追发**（若日后改为缓冲，第一条断言会红——那是设计变更，必须
    // 连同这里一起改，而不是静默变化）。
    // 变异清单：M1 删 bootstrapLogging 里的 configureLogging 调用（late 红，X111 已证）；
    // M2 去掉 `await Promise.all`（时序位移，本用例应红）；M3 logger 改缓冲追发（early
    // 红，设计变更哨兵）；M4 闸门换回立即兑现（两条断言应仍绿，证明闸门只是加宽窗口）。
    let openGate: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      openGate = resolve;
    });
    const listeners: Array<
      (changes: Record<string, { newValue?: unknown }>, area: string) => void
    > = [];
    const values: Record<string, unknown> = { ...DEBUG_ON };
    defineGlobal('chrome', {
      storage: {
        local: {
          get: async (_keys: unknown, cb?: (r: Record<string, unknown>) => void) => {
            await gate;
            const result = { ...values };
            cb?.(result);
            return result;
          },
          set: async (): Promise<void> => {},
          remove: async (): Promise<void> => {},
        },
        onChanged: listenerApi(listeners),
      },
    });

    // 生产姿态：默认关。窗口内记一条 —— 此时没有任何设置被读到过。
    configureLogging({ enabled: false, level: 'info' });
    const cap = captureConsole();
    try {
      const pending = bootstrapLogging();
      // 正向前缀：窗口确实关着——此刻设置还没被读到，logger 必须仍按默认（关）执行。
      // 若这条先红，说明实现把读设置提前到了首条日志之前，本用例的时序声称失去判据。
      expect(probeLogger().info, '窗口未建立：设置读得太早，本用例失去判据').toBe(false);
      infoLog('early-before-settings');
      openGate();
      releases.push(await pending);
      infoLog('late-after-settings');
    } finally {
      cap.restore();
    }
    expect(
      cap.lines.some((l) => l.includes('early-before-settings')),
      '窗口内日志被追发了——当前实现不缓冲，若改设计请同波更新本判据',
    ).toBe(false);
    expect(
      cap.lines.some((l) => l.includes('late-after-settings')),
      '设置到达后日志仍未放行——bootstrapLogging 没有把读到设置灌进 logger',
    ).toBe(true);
  });

  test('Options 页改开关/级别 → 已开页面即时跟随', async () => {
    const stub = stubChrome(DEBUG_OFF);
    defineGlobal('chrome', stub.chrome);
    releases.push(await bootstrapLogging());
    expect(probeLogger().debug).toBe(false);

    stub.fire({
      [STORAGE_KEYS.DEBUG_ENABLED]: { newValue: true },
      [STORAGE_KEYS.LOG_LEVEL]: { newValue: 'debug' },
    });
    expect(probeLogger()).toEqual({ debug: true, info: true, error: true });

    stub.fire({ [STORAGE_KEYS.LOG_LEVEL]: { newValue: 'error' } });
    expect(probeLogger()).toEqual({ debug: false, info: false, error: true });
  });

  test('无关变更与其他存储区域不得改写日志配置', async () => {
    const stub = stubChrome(DEBUG_ON);
    defineGlobal('chrome', stub.chrome);
    releases.push(await bootstrapLogging());
    stub.fire({ theme: { newValue: 'dark' } });
    stub.fire({ [STORAGE_KEYS.DEBUG_ENABLED]: { newValue: false } }, 'session');
    expect(probeLogger()).toEqual({ debug: true, info: true, error: true });
  });

  test('disposer 释放监听器（释放后 onChanged 再无影响）', async () => {
    const stub = stubChrome(DEBUG_OFF);
    defineGlobal('chrome', stub.chrome);
    const release = await bootstrapLogging();
    expect(stub.listenerCount()).toBe(1);
    release();
    expect(stub.listenerCount()).toBe(0);
    stub.fire({
      [STORAGE_KEYS.DEBUG_ENABLED]: { newValue: true },
      [STORAGE_KEYS.LOG_LEVEL]: { newValue: 'debug' },
    });
    expect(probeLogger().debug).toBe(false);
  });

  test('重复引导幂等：一个文档只挂一个监听器', async () => {
    const stub = stubChrome(DEBUG_ON);
    defineGlobal('chrome', stub.chrome);
    releases.push(await bootstrapLogging());
    releases.push(await bootstrapLogging());
    expect(stub.listenerCount()).toBe(1);
  });

  test('没有 chrome.storage 也不得抛（既有入口夹具零改动）', async () => {
    const stub = stubChrome(null);
    defineGlobal('chrome', stub.chrome);
    await expect(bootstrapLogging()).resolves.toBeInstanceOf(Function);
  });
});

test.describe('三个视频入口真的接上日志引导', () => {
  const cases = [
    { name: 'bilibili detail', entry: biliDetailEntry, url: 'https://example.com/no-video' },
    { name: 'bilibili homepage', entry: biliHomeEntry, url: 'https://example.com/no-listing' },
    { name: 'youtube homepage', entry: ytEntry, url: 'https://example.com/no-feed' },
  ];

  for (const { name, entry, url } of cases) {
    test(`${name}: main() 之后用户开关生效`, async () => {
      const stub = stubChrome(DEBUG_ON);
      defineGlobal('chrome', stub.chrome);
      mountNeutral(url);
      configureLogging({ enabled: false, level: 'info' });
      runMain(entry as unknown as { main: () => void });
      await settle();
      expect(probeLogger().debug, `${name} 未走到日志引导`).toBe(true);
    });
  }
});
