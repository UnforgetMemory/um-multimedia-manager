import { debugLog } from './logger';

export type EventType = 'record:updated' | 'record:deleted' | 'settings:changed' | 'sync:completed';

export interface EventBusMessage {
  type: 'EVENT_BUS';
  event: EventType;
  data?: unknown;
}

// ==================== Background 端 ====================

/**
 * `lastError` from a fire-and-forget send. "Nobody was listening" is the
 * normal outcome (most tabs have no subscriber for most events); anything
 * else is a real messaging failure worth surfacing.
 */
function noteSendResult(): void {
  const lastError = chrome.runtime.lastError;
  const message = lastError?.message ?? '';
  if (
    lastError &&
    !message.includes('Could not establish connection') &&
    !message.includes('Receiving end does not exist')
  ) {
    // Routed through the logger: a bare console.* here hides behind the
    // console:check baseline instead of the single diagnostic outlet.
    debugLog('[EventBus] broadcast failed:', lastError.message);
  }
}

/** Callback form so a missing receiver cannot become an unhandled rejection. */
function sendSilently(message: EventBusMessage): void {
  try {
    chrome.runtime.sendMessage(message, noteSendResult);
  } catch {
    // Context invalidated (extension updated/disabled) — fire and forget
  }
}

/**
 * Host patterns a content script can actually be injected into, read from the
 * manifest so the list has exactly one source.
 *
 * This is `content_scripts[].matches`, NOT `host_permissions`: the latter also
 * carries WebDAV provider origins the extension only ever fetches from the
 * background, and a tab sitting on one of those has no script to receive
 * anything. Using the narrower, authoritative list also keeps the matcher
 * uniform — every match pattern is `*://host/path`, whereas host_permissions
 * mixes in scheme-specific entries a conservative parser would have to reject.
 */
function injectableHostPatterns(): string[] {
  const chromeLike = (
    globalThis as unknown as {
      chrome?: {
        runtime?: {
          getManifest?: () => {
            content_scripts?: Array<{ matches?: unknown }>;
            host_permissions?: unknown;
          };
        };
      };
    }
  ).chrome;
  try {
    const manifest = chromeLike?.runtime?.getManifest?.();
    if (manifest?.content_scripts) {
      const patterns: string[] = [];
      for (const script of manifest.content_scripts) {
        if (Array.isArray(script.matches)) {
          for (const p of script.matches) if (typeof p === 'string') patterns.push(p);
        }
      }
      if (patterns.length > 0) return patterns;
    }
    const hp = manifest?.host_permissions;
    return Array.isArray(hp) ? hp.filter((p): p is string => typeof p === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Build a host matcher from Chrome match patterns. Returns null unless EVERY
 * pattern is of the `*://host/part` shape this extension actually ships, so an
 * unexpected pattern disables filtering instead of silently dropping tabs.
 */
function buildHostMatcher(patterns: string[]): RegExp | null {
  if (patterns.length === 0) return null;
  const escape = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const alts: string[] = [];
  for (const pattern of patterns) {
    const m = /^\*:\/\/([^/]+)\/.*$/.exec(pattern);
    const host = m?.[1];
    if (host === undefined) return null;
    if (host.startsWith('*.')) {
      // `*.host` means "host plus any number of subdomain levels".
      alts.push(`(?:.*\\.)?${escape(host.slice(2))}`);
    } else {
      alts.push(escape(host));
    }
  }
  // Content scripts only ever run on http(s), and `*://` never matches
  // chrome:// — so pinning the scheme here is equivalent, not narrower. The
  // lookahead stops a suffix-padded host such as movie.douban.com.evil.test.
  return new RegExp(`^https?:\\/\\/(?:${alts.join('|')})(?=[/?#]|$)`);
}

async function sendToTabs(message: EventBusMessage): Promise<void> {
  // Read through globalThis: background handlers are also imported by Node-side
  // unit tests where no `chrome` binding exists, and a bare reference would throw
  // ReferenceError inside this async function (unhandled rejection).
  const tabsApi = (globalThis as unknown as { chrome?: typeof chrome }).chrome?.tabs;
  if (!tabsApi?.sendMessage) return;
  // Built per call rather than cached: it is one regex compile per broadcast
  // (microseconds against the sendMessage cost), and a module-level cache would
  // also outlive the manifest a test installs.
  const patterns = injectableHostPatterns();
  const matcher = buildHostMatcher(patterns);

  // An import can write hundreds of records and each one broadcasts, so without
  // a filter every open tab pays one sendMessage per write — including tabs this
  // extension cannot be injected into and discarded tabs with no live script.
  //
  // Chrome's own url filter is the primary mechanism, not a JS check: outside
  // `host_permissions` a tab's `url` is not exposed without the `tabs`
  // permission, and this manifest has neither — so a JS-side filter would see
  // `undefined` for exactly the irrelevant tabs it wants to drop, and by the
  // "never lose a delivery" rule must still send to them. Matching on the
  // injection hosts is legal because those are hosts whose URLs we may read.
  let tabs: chrome.tabs.Tab[];
  try {
    tabs = await tabsApi.query({});
  } catch {
    return;
  }
  // NOT `query({ url: patterns })`, which looks cheaper: measured in the real
  // extension it returns an EMPTY list — without the `tabs` permission Chrome
  // cannot match on tab.url at all, so the tabs leg silently stops delivering
  // and three live-refresh e2e specs go red (badges never flip, dimming never
  // updates). The saving actually needs the `tabs` permission added to the
  // manifest, which is a permission-surface change and therefore a user call.
  for (const tab of tabs) {
    if (typeof tab.id !== 'number') continue;
    if (tab.discarded === true) continue;
    // A tab whose url is not exposed stays delivered: not knowing is not the
    // same as knowing it is irrelevant, and dropping this leg silently is the
    // failure the e2e suite already caught once (ADR-015).
    if (matcher && typeof tab.url === 'string' && !matcher.test(tab.url)) continue;
    try {
      tabsApi.sendMessage(tab.id, message, noteSendResult);
    } catch {
      // Context invalidated mid-flight
    }
  }
}

/**
 * Broadcast an event to every context of this extension: extension pages
 * (popup / options) AND injected content scripts.
 *
 * WHY two channels: `chrome.runtime.sendMessage` from the service worker is
 * delivered to extension pages only — content scripts never receive it (they
 * get runtime messages sent by *other* content scripts, not by the background).
 * ADR-015 live refresh in injected UIs (douban badges, PT dimmer, mukaku)
 * therefore needs the per-tab `chrome.tabs.sendMessage` leg; verified by the
 * extension e2e suite (`tests/e2e/book-home-live-refresh.spec.ts`).
 */
export function broadcast(event: EventType, data?: unknown): void {
  const message: EventBusMessage = { type: 'EVENT_BUS', event, data };
  sendSilently(message);
  void sendToTabs(message);
}

// ==================== Content Script 端 ====================

const subscribers = new Map<EventType, Set<(data: unknown) => void>>();
let initialized = false;

/** Initialize the message listener (call once in content script main) */
export function initEventBus(): void {
  if (initialized) return;
  // Flag flips only after successful registration: test envs throw here, and a
  // pre-set flag would leave the bus "initialized" with no listener attached.
  chrome.runtime.onMessage.addListener((message: unknown, sender: chrome.runtime.MessageSender) => {
    if (sender.id !== chrome.runtime.id) return;
    const msg = message as EventBusMessage;
    if (msg.type !== 'EVENT_BUS') return;
    const callbacks = subscribers.get(msg.event);
    if (callbacks) {
      for (const cb of callbacks) {
        try {
          cb(msg.data);
        } catch (e: unknown) {
          console.error('[EventBus] Subscriber error:', e);
        }
      }
    }
  });
  initialized = true;
}

/** Subscribe to a background event. Returns an unsubscribe function. */
export function onEvent(event: EventType, callback: (data: unknown) => void): () => void {
  const set = subscribers.get(event) ?? new Set<(data: unknown) => void>();
  set.add(callback);
  subscribers.set(event, set);
  return () => {
    set.delete(callback);
  };
}
