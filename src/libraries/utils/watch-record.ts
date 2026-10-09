import { initEventBus, onEvent, type EventType } from './event-bus';

/** Bus seam; production uses the real singleton, tests inject their own. */
export interface WatchRecordDeps {
  subscribe: (event: EventType, handler: (data: unknown) => void) => () => void;
}

const defaultDeps: WatchRecordDeps = {
  subscribe: (event, handler) => {
    initEventBus();
    return onEvent(event, handler);
  },
};

/**
 * Single-key (or whole-store) record watch for non-Vue consumers.
 *
 * The Douban overlays get live refresh through `useRecordCache` /
 * `useRecordRefresh`; legacy content scripts have no Vue lifecycle to hang on,
 * and a record written from the popup, another tab or a sync run mutates NO host
 * DOM — so a DOM observer can never notice it. This is that missing leg.
 *
 * The bus envelope's `key` is `{type}::{providerId}`; a background bulk write
 * arrives as `key: '*'` (or without a key) and must always re-check rather than
 * be filtered out.
 */
export function watchRecord(
  storeName: string,
  key: string | undefined,
  onChange: () => void,
  deps: WatchRecordDeps = defaultDeps,
): () => void {
  const handler = (data: unknown): void => {
    const payload = data as { storeName?: unknown; key?: unknown } | undefined;
    if (payload?.storeName !== storeName) return;
    const eventKey = typeof payload.key === 'string' ? payload.key : undefined;
    // No key in the event, no key watched, or the exact key: re-check.
    if (!eventKey || eventKey === '*' || !key || eventKey === key) onChange();
  };
  const offUpdated = deps.subscribe('record:updated', handler);
  const offDeleted = deps.subscribe('record:deleted', handler);
  return () => {
    offUpdated();
    offDeleted();
  };
}
