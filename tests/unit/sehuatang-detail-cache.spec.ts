import { test, expect } from '@playwright/test';
import {
  getCachedDetails,
  putCachedDetails,
  type SehuatangDetailCacheEntry,
} from '@/scenario/sehuatang/detail-cache';
import type { ResponseMessageMap } from '@/types';

/**
 * sehuatang detail-cache (content client) behavior lock (X11-G).
 *
 * L1 Map → ONE SEHUATANG_CACHE_GET_BATCH message → plain-miss degradation.
 * The layer must never throw and never leak a failure to callers (ADR-024
 * D2: optimization layer, not correctness layer). TTL/expiry lives in the
 * background provider (locked by sehuatang-cache.spec.ts at the DB layer);
 * here L1 is session-lived by design, so isolation = unique tids per test
 * (the Map is a module singleton and the worker may be reused).
 *
 * chrome.runtime is stubbed per test; safeSendMessage semantics (retries =
 * total attempts) are locked in utils-context.spec.ts.
 */

interface ChromeStub {
  runtime: {
    id: string;
    lastError: { message: string } | null;
    sendMessage: (message: SentMessage, callback: (response: unknown) => void) => void;
  };
}

interface SentMessage {
  type: string;
  payload?: unknown;
}

let prevChrome: unknown;

function stubChrome(script: Array<{ respond?: unknown; lastError?: string }>): SentMessage[] {
  const calls: SentMessage[] = [];
  const runtime: ChromeStub['runtime'] = {
    id: 'testextensionid',
    lastError: null,
    sendMessage: (message, callback) => {
      calls.push(message);
      const step = script[Math.min(calls.length - 1, script.length - 1)]!;
      if (step.lastError !== undefined) {
        runtime.lastError = { message: step.lastError };
        callback(undefined);
        runtime.lastError = null;
        return;
      }
      callback(step.respond);
    },
  };
  prevChrome = (globalThis as { chrome?: unknown }).chrome;
  Object.defineProperty(globalThis, 'chrome', { value: { runtime }, configurable: true });
  return calls;
}

test.afterEach(() => {
  Object.defineProperty(globalThis, 'chrome', {
    value: prevChrome,
    configurable: true,
    writable: true,
  });
  prevChrome = undefined;
});

function entry(
  tid: string,
  over: Partial<SehuatangDetailCacheEntry> = {},
): SehuatangDetailCacheEntry {
  return {
    tid,
    imageUrl: `https://img.example/${tid}.jpg`,
    magnetLink: `magnet:?xt=urn:btih:${tid}`,
    cachedAt: 1700000000000,
    ...over,
  };
}

const getOk = (
  entries: Record<string, SehuatangDetailCacheEntry>,
): ResponseMessageMap['SEHUATANG_CACHE_GET_BATCH'] => ({ success: true, data: { entries } });

function captureConsole(): { warns: string[]; errors: string[]; restore: () => void } {
  const warns: string[] = [];
  const errors: string[] = [];
  const prevWarn = console.warn;
  const prevError = console.error;
  console.warn = (...args: unknown[]) => void warns.push(args.map(String).join(' '));
  console.error = (...args: unknown[]) => void errors.push(args.map(String).join(' '));
  return {
    warns,
    errors,
    restore: () => {
      console.warn = prevWarn;
      console.error = prevError;
    },
  };
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

test.describe('getCachedDetails — 读链', () => {
  test('全 miss → 单条 GET_BATCH（payload 只含 miss）→ 命中回填 L1，二次读零消息', async () => {
    const calls = stubChrome([{ respond: getOk({ 'L1-SEQ-A': entry('L1-SEQ-A') }) }]);

    const first = await getCachedDetails(['L1-SEQ-A', 'L1-SEQ-B']);
    expect(calls).toEqual([
      { type: 'SEHUATANG_CACHE_GET_BATCH', payload: { tids: ['L1-SEQ-A', 'L1-SEQ-B'] } },
    ]);
    expect(first.get('L1-SEQ-A')).toEqual(entry('L1-SEQ-A'));
    // 后台未返回的 tid 是普通 miss，不占位
    expect(first.has('L1-SEQ-B')).toBe(false);

    const second = await getCachedDetails(['L1-SEQ-A']);
    expect(calls).toHaveLength(1); // L1 命中，不再发消息
    expect(second.get('L1-SEQ-A')?.imageUrl).toBe('https://img.example/L1-SEQ-A.jpg');
  });

  test('混合批：L1 命中直返，仅 miss 进消息 payload', async () => {
    const calls = stubChrome([
      { respond: { success: true, data: { saved: 1 } } },
      { respond: getOk({ 'L1-MIX-B': entry('L1-MIX-B') }) },
    ]);
    putCachedDetails([entry('L1-MIX-A')]);
    await flush();

    const res = await getCachedDetails(['L1-MIX-A', 'L1-MIX-B']);
    expect(calls[0]).toEqual({
      type: 'SEHUATANG_CACHE_PUT',
      payload: {
        entries: [
          {
            tid: 'L1-MIX-A',
            imageUrl: 'https://img.example/L1-MIX-A.jpg',
            magnetLink: 'magnet:?xt=urn:btih:L1-MIX-A',
          },
        ],
      },
    });
    expect(calls[1]).toEqual({
      type: 'SEHUATANG_CACHE_GET_BATCH',
      payload: { tids: ['L1-MIX-B'] },
    });
    expect(res.get('L1-MIX-A')?.magnetLink).toBe('magnet:?xt=urn:btih:L1-MIX-A');
    expect(res.get('L1-MIX-B')?.magnetLink).toBe('magnet:?xt=urn:btih:L1-MIX-B');
  });

  test('空 tid 列表 → 不发消息，返回空 Map', async () => {
    const calls = stubChrome([{ respond: getOk({}) }]);
    const res = await getCachedDetails([]);
    expect(res.size).toBe(0);
    expect(calls).toHaveLength(0);
  });

  test('success:false → 降级空 miss（不抛错），且 L1 不被污染', async () => {
    const h = captureConsole();
    try {
      stubChrome([{ respond: { success: false, error: 'store broken' } }]);
      const res = await getCachedDetails(['L1-NEG-A']);
      expect(res.size).toBe(0);
    } finally {
      h.restore();
    }
    // 未回填 → 再次读取会重新发消息
    const calls = stubChrome([{ respond: getOk({}) }]);
    await getCachedDetails(['L1-NEG-A']);
    expect(calls).toHaveLength(1);
  });

  test('传输失败（lastError → safeSendMessage null）→ L1 命中照常返回，miss 降级', async () => {
    const calls = stubChrome([
      { respond: { success: true, data: { saved: 1 } } },
      { lastError: 'Could not establish connection.' },
    ]);
    putCachedDetails([entry('L1-ERR-A')]);
    await flush();
    const res = await getCachedDetails(['L1-ERR-A', 'L1-ERR-B']);
    expect(res.get('L1-ERR-A')?.imageUrl).toBe('https://img.example/L1-ERR-A.jpg');
    expect(res.has('L1-ERR-B')).toBe(false);
    // retries:1 → 恰好一次 GET 发送，不做退避重试
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual({
      type: 'SEHUATANG_CACHE_GET_BATCH',
      payload: { tids: ['L1-ERR-B'] },
    });
  });
});

test.describe('putCachedDetails — 写链（fire-and-forget）', () => {
  test('wire 只带 {tid,imageUrl,magnetLink}（cachedAt 由后台盖章），L1 立即可读', async () => {
    const calls = stubChrome([{ respond: { success: true, data: { saved: 1 } } }]);

    putCachedDetails([entry('L1-PUT-A', { cachedAt: 999, imageUrl: null, magnetLink: null })]);
    await flush();

    expect(calls).toEqual([
      {
        type: 'SEHUATANG_CACHE_PUT',
        payload: { entries: [{ tid: 'L1-PUT-A', imageUrl: null, magnetLink: null }] },
      },
    ]);
    // L1 写入同步生效：下一次批量读不再走消息
    const hits = await getCachedDetails(['L1-PUT-A']);
    expect(hits.get('L1-PUT-A')?.imageUrl).toBeNull();
    expect(calls).toHaveLength(1);
  });

  test('空数组 → 零消息零副作用', async () => {
    const calls = stubChrome([{ respond: { success: true, data: { saved: 0 } } }]);
    putCachedDetails([]);
    await flush();
    expect(calls).toHaveLength(0);
  });

  test('服务端拒绝（success:false）→ console.warn 可见且 L1 保留', async () => {
    const h = captureConsole();
    try {
      stubChrome([{ respond: { success: false, error: 'over batch limit' } }]);
      putCachedDetails([entry('L1-REJ-A')]);
      await flush();
      expect(
        h.warns.some((w) => w.includes('write rejected') && w.includes('over batch limit')),
      ).toBe(true);
    } finally {
      h.restore();
    }
    const calls = stubChrome([{ respond: getOk({}) }]);
    const res = await getCachedDetails(['L1-REJ-A']);
    expect(res.has('L1-REJ-A')).toBe(true); // L1 命中 → 持久化落空不影响本次会话
    expect(calls).toHaveLength(0);
  });

  test('传输失败（lastError → null 响应）→ safeSendMessage 记 error、无未处理拒绝、L1 保留', async () => {
    const h = captureConsole();
    let calls: SentMessage[] = [];
    try {
      calls = stubChrome([{ lastError: 'Receiving end does not exist.' }]);
      putCachedDetails([entry('L1-TX-A')]);
      await flush();
      await flush();
      expect(calls).toHaveLength(1);
      // 传输耗尽由 safeSendMessage 的 console.error 面呈现（永不 rethrow）
      expect(h.errors.some((e) => e.includes('All retries exhausted'))).toBe(true);
    } finally {
      h.restore();
    }
    const stub2 = stubChrome([{ respond: getOk({}) }]);
    const res = await getCachedDetails(['L1-TX-A']);
    expect(res.has('L1-TX-A')).toBe(true);
    expect(stub2).toHaveLength(0);
  });
});
