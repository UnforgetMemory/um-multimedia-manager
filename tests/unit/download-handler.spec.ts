import { test, expect } from '@playwright/test';
import { JSDOM } from 'jsdom';
import { handleDownloadFile, downloadFileInPage } from '@/entrypoints/background/handlers/download';

/**
 * DOWNLOAD_FILE hang guard (audit 2026-09-25 §P-C): this path bypasses the
 * DataScheduler, so handleDownloadFile itself must be bounded — the response
 * (sendResponse) must arrive on every timeout/error path, and the injected
 * MAIN-world fetch must carry a deadline signal.
 */

function withChrome<T>(fake: unknown, run: () => Promise<T>): Promise<T> {
  const g = globalThis as unknown as { chrome: unknown };
  const prev = g.chrome;
  g.chrome = fake;
  return run().finally(() => {
    g.chrome = prev;
  });
}

const sender = { tab: { id: 7 } } as chrome.runtime.MessageSender;

test('handleDownloadFile returns an error when executeScript hangs (response always reaches sendResponse)', async () => {
  return withChrome({ scripting: { executeScript: () => new Promise(() => {}) } }, async () => {
    const res = await handleDownloadFile(
      { url: 'https://cdn.test/a.zip', filename: 'a.zip' },
      sender,
      30,
    );
    expect(res.success).toBe(false);
    expect(res.error).toContain('timed out');
  });
});

test('handleDownloadFile injects the self-contained downloader into the MAIN world and succeeds', async () => {
  const captured: Array<Record<string, unknown>> = [];
  return withChrome(
    {
      scripting: {
        executeScript: async (details: Record<string, unknown>) => {
          captured.push(details);
          return [];
        },
      },
    },
    async () => {
      const res = await handleDownloadFile(
        { url: 'https://cdn.test/a.zip', filename: 'a.zip' },
        sender,
      );
      expect(res).toEqual({ success: true });
      expect(captured).toHaveLength(1);
      // `!`：上方 toHaveLength(1) 已守卫（测试代码允许）。
      expect(captured[0]!.world).toBe('MAIN');
      expect(captured[0]!.args).toEqual(['https://cdn.test/a.zip', 'a.zip']);
      expect(typeof captured[0]!.func).toBe('function');
    },
  );
});

test('handleDownloadFile reports errors instead of throwing when executeScript rejects', async () => {
  return withChrome(
    {
      scripting: {
        executeScript: async () => {
          throw new Error('Cannot access a chrome:// URL');
        },
      },
    },
    async () => {
      const res = await handleDownloadFile(
        { url: 'https://cdn.test/a.zip', filename: 'a.zip' },
        sender,
      );
      expect(res.success).toBe(false);
      expect(res.error).toContain('Cannot access a chrome:// URL');
    },
  );
});

test('downloadFileInPage fetches with a timeout signal and falls back to a link when the fetch aborts', async () => {
  const dom = new JSDOM('<body></body>', { url: 'https://movie.douban.com/' });
  const g = globalThis as unknown as { document: Document; fetch: typeof fetch };
  const prevDoc = g.document;
  const prevFetch = g.fetch;
  g.document = dom.window.document;

  const appended: Element[] = [];
  const body = dom.window.document.body;
  const origAppend = body.appendChild.bind(body);
  body.appendChild = ((node: Node) => {
    appended.push(node as Element);
    return origAppend(node);
  }) as typeof body.appendChild;

  let capturedInit: RequestInit | undefined;
  g.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
    capturedInit = init;
    const err = new Error('aborted');
    err.name = 'AbortError';
    return Promise.reject(err);
  }) as typeof fetch;

  try {
    await downloadFileInPage('https://cdn.test/a.zip', 'a.zip');
    expect(capturedInit?.signal).toBeInstanceOf(AbortSignal);
    expect(capturedInit?.credentials).toBe('include');
    const fallback = appended.find(
      (el) => el.tagName === 'A' && el.getAttribute('target') === '_blank',
    );
    expect(fallback?.getAttribute('href')).toBe('https://cdn.test/a.zip');
  } finally {
    g.document = prevDoc;
    g.fetch = prevFetch;
  }
});
