/**
 * File download handler — uses MAIN world fetch for Referer-gated CDNs.
 */

import { errorMessage } from '@/libraries/utils/error-message';
import { withTimeout } from '@/libraries/utils/fetch-timeout';

/** Injection round-trip budget; guarantees sendResponse even if executeScript hangs. */
export const DOWNLOAD_HANDLER_TIMEOUT_MS = 30_000;

/** Only these URL schemes may reach the in-page fetch/anchor. */
const ALLOWED_DOWNLOAD_PROTOCOLS: ReadonlySet<string> = new Set(['http:', 'https:']);

/**
 * Gate the download URL before it reaches the MAIN-world injection.
 *
 * The url is scraped from host page DOM, and the injected anchor fallback does
 * `a.href = url; a.click()` in the host page principal — so a planted
 * `javascript:`/`data:` scheme would execute there. Parse and accept http(s)
 * only; an unparseable value is rejected too.
 */
export function isSafeDownloadUrl(url: string): boolean {
  try {
    return ALLOWED_DOWNLOAD_PROTOCOLS.has(new URL(url).protocol);
  } catch {
    return false;
  }
}

/**
 * Self-contained (serialized into the page — no closure/module references).
 * The in-page fetch deadline is hardcoded for the same reason.
 */
export async function downloadFileInPage(url: string, filename: string): Promise<void> {
  try {
    const r = await fetch(url, { credentials: 'include', signal: AbortSignal.timeout(60_000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const blob = await r.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
  } catch {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}

export async function handleDownloadFile(
  payload: { url?: string; filename?: string },
  sender: chrome.runtime.MessageSender,
  timeoutMs: number = DOWNLOAD_HANDLER_TIMEOUT_MS,
): Promise<{ success: boolean; error?: string }> {
  const { url, filename } = payload ?? {};
  if (!url || !filename || !sender.tab?.id) {
    return { success: false, error: 'Missing params or tab' };
  }
  // Reject non-http(s) schemes before injecting into the page's MAIN world.
  if (!isSafeDownloadUrl(url)) {
    return { success: false, error: 'Unsupported download URL scheme' };
  }

  try {
    await withTimeout(
      chrome.scripting.executeScript({
        target: { tabId: sender.tab.id },
        world: 'MAIN',
        args: [url, filename],
        func: downloadFileInPage,
      }),
      timeoutMs,
      'Download injection timed out',
    );
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: errorMessage(err) };
  }
}
