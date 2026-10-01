import { getCurrentInstance, onUnmounted } from 'vue';
import { Store } from '@/engine/database';
import type { StoreRecord } from '@/types';
import { initEventBus, onEvent } from '@/libraries/utils/event-bus';

/** The identity subset needed to build a `douban_records` key. */
export interface RefreshableIdentity {
  type: string;
  providerId: string;
}

/** Record lifecycle events a badge must react to: a write and a removal. */
export type RecordEvent = 'record:updated' | 'record:deleted';

/** Narrow a record event payload to the fields we consume. */
export function isRecordUpdatedPayload(data: unknown): data is { storeName: string; key?: string } {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as { storeName?: unknown };
  return typeof d.storeName === 'string';
}

/** Injectable bus/DB seams (record-cache-core StoreApi precedent) for tests. */
export interface RecordRefreshDeps {
  subscribe: (event: RecordEvent, handler: (data: unknown) => void) => () => void;
  loadRecord: (key: string) => Promise<StoreRecord | null>;
}

const defaultDeps: RecordRefreshDeps = {
  subscribe: (event, handler) => {
    initEventBus();
    return onEvent(event, handler);
  },
  loadRecord: (key) => Store.dbGet('douban_records', key),
};

/**
 * Subscribe to background `record:updated` / `record:deleted` broadcasts
 * (ADR-015) and re-read this page's own douban record when the event matches.
 * A removal reports `null` to `onRecord` so the badge clears; a write that
 * cannot be read back leaves the current state alone (no flicker). Call inside
 * component setup for automatic release on unmount; outside a component (e.g.
 * tests) call the returned unsubscribe.
 */
export function useRecordRefresh(
  getIdentity: () => RefreshableIdentity | null | undefined,
  onRecord: (record: StoreRecord | null) => void,
  deps: RecordRefreshDeps = defaultDeps,
): () => void {
  function handleRecordEvent(event: RecordEvent, data: unknown): void {
    const identity = getIdentity();
    if (!identity) return;
    if (!isRecordUpdatedPayload(data) || data.storeName !== 'douban_records') return;
    const key = `${identity.type}::${identity.providerId}`;
    // Missing/'*' key → treat as bulk update, reload unconditionally.
    if (data.key && data.key !== '*' && data.key !== key) return;
    void (async () => {
      try {
        const updated = await deps.loadRecord(key);
        if (updated) onRecord(updated);
        else if (event === 'record:deleted') onRecord(null);
      } catch (e: unknown) {
        console.warn('[UMM] useRecordRefresh reload failed:', e);
      }
    })();
  }

  let unsubscribe = (): void => {};
  try {
    const release = [
      deps.subscribe('record:updated', (data) => handleRecordEvent('record:updated', data)),
      deps.subscribe('record:deleted', (data) => handleRecordEvent('record:deleted', data)),
    ];
    unsubscribe = () => {
      for (const off of release) off();
    };
  } catch (e: unknown) {
    // Bus unavailable (e.g. non-browser test env) — no live refresh.
    console.warn('[UMM] useRecordRefresh subscribe failed:', e);
  }
  if (getCurrentInstance()) onUnmounted(unsubscribe);
  return unsubscribe;
}
