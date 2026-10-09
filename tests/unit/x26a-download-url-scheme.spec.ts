import { test, expect } from '@playwright/test';
import { handleDownloadFile, isSafeDownloadUrl } from '@/entrypoints/background/handlers/download';

/**
 * Download URL scheme gate.
 *
 * The download url is scraped from host page DOM (img src/data-src) and then
 * handed to a MAIN-world injection whose anchor fallback does `a.href = url;
 * a.click()`. Without a scheme allowlist a page author could plant
 * `javascript:`/`data:` and have it executed in the host page principal.
 */

const sender = { tab: { id: 7 } } as chrome.runtime.MessageSender;

async function withChrome<T>(fake: unknown, run: () => Promise<T>): Promise<T> {
  const g = globalThis as unknown as { chrome?: unknown };
  // Release via the import-time descriptor, not `g.chrome = prev`: writing
  // undefined leaves an own key behind, and a later spec may branch on absence.
  const original = Object.getOwnPropertyDescriptor(globalThis, 'chrome');
  g.chrome = fake;
  try {
    return await run();
  } finally {
    if (original) Object.defineProperty(globalThis, 'chrome', original);
    else delete g.chrome;
  }
}

test('isSafeDownloadUrl accepts http(s) urls', () => {
  expect(isSafeDownloadUrl('https://img.example/a.jpg')).toBe(true);
  expect(isSafeDownloadUrl('http://cdn.test/a.zip')).toBe(true);
});

test('isSafeDownloadUrl rejects every non-http(s) scheme and unparseable input', () => {
  for (const bad of [
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'blob:https://evil.test/uuid',
    'file:///etc/passwd',
    'not a url',
    '',
    '/relative/path.jpg',
  ]) {
    expect(isSafeDownloadUrl(bad)).toBe(false);
  }
});

test('handleDownloadFile rejects a javascript: url without ever injecting', async () => {
  let injected = 0;
  return withChrome(
    {
      scripting: {
        executeScript: async () => {
          injected++;
          return [];
        },
      },
    },
    async () => {
      const res = await handleDownloadFile(
        { url: 'javascript:alert(document.cookie)', filename: 'x.jpg' },
        sender,
      );
      expect(res.success).toBe(false);
      expect(injected).toBe(0);
    },
  );
});

test('handleDownloadFile still injects for a plain https url (anchor fallback preserved)', async () => {
  let injected = 0;
  return withChrome(
    {
      scripting: {
        executeScript: async () => {
          injected++;
          return [];
        },
      },
    },
    async () => {
      const res = await handleDownloadFile(
        { url: 'https://img.example/a.jpg', filename: 'a.jpg' },
        sender,
      );
      expect(res.success).toBe(true);
      expect(injected).toBe(1);
    },
  );
});
