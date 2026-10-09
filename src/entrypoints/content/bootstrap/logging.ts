/**
 * Shared per-entry logging bootstrap.
 *
 * Why this exists: the logger's default is `import.meta.env.DEV` (production =
 * silent), and the Options page's 「调试日志」 switch + 日志级别 selector only
 * write `chrome.storage.local`. A context that never reads those two keys into
 * `configureLogging()` therefore ignores the user's setting outright — the
 * switch looks wired but emits nothing, and no diagnostics can be collected
 * from that context. Only background and the legacy content script had the
 * wiring; the video entrypoints (bilibili / bilibili-homepage / youtube) did
 * not. One implementation, every entry.
 */

import type { LogLevel } from '@/types';
import { STORAGE_KEYS } from '@/libraries/config';
import { configureLogging } from '@/libraries/utils/logger';
import { settingsItems } from '@/engine/settings/items';

type StorageChangeHandler = (
  changes: Record<string, chrome.storage.StorageChange>,
  area: string,
) => void;

/** The storage event bus object — its identity is the registration key. */
type StorageEventBus = typeof chrome.storage.onChanged;

// Idempotence keyed by bus identity, not a bare boolean: a swapped bus (test
// fixture, reloaded context) must re-register instead of silently going dead.
let registered: { bus: StorageEventBus; release: () => void } | null = null;

/**
 * Keep the logger in step with the Options page. Registers at most one
 * listener per event bus and returns its disposer (a page-lifetime caller can
 * ignore it; a route-scoped caller must release it like any other observer).
 */
export function startLoggingSync(): () => void {
  const bus = chrome.storage.onChanged;
  if (registered && registered.bus === bus) return registered.release;

  const handler: StorageChangeHandler = (changes, area) => {
    if (area !== 'local') return;
    const enabledChange = changes[STORAGE_KEYS.DEBUG_ENABLED];
    const levelChange = changes[STORAGE_KEYS.LOG_LEVEL];
    if (!enabledChange && !levelChange) return;
    configureLogging({
      enabled: enabledChange?.newValue as boolean | undefined,
      level: levelChange?.newValue as LogLevel | undefined,
    });
  };
  bus.addListener(handler);
  const release = (): void => {
    bus.removeListener(handler);
    if (registered && registered.release === release) registered = null;
  };
  registered = { bus, release };
  return release;
}

/**
 * Apply the stored logging settings and keep following changes.
 *
 * Never throws: fixture contexts and non-extension pages without
 * `chrome.storage` must still run their own initialization — a bootstrap that
 * takes the entry down with it is worse than a silent one.
 */
export async function bootstrapLogging(): Promise<() => void> {
  let release = (): void => {};
  try {
    release = startLoggingSync();
  } catch {
    /* no storage event bus here — nothing to keep in sync */
  }
  try {
    const items = settingsItems();
    const [debugEnabled, level] = await Promise.all([
      items.debugEnabled.getValue(),
      items.logLevel.getValue(),
    ]);
    configureLogging({ enabled: debugEnabled, level });
  } catch {
    /* keep logger defaults */
  }
  return release;
}
