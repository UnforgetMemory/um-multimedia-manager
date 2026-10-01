import { getCurrentInstance, onUnmounted, ref, toValue, watch } from 'vue';
import type { MaybeRefOrGetter } from 'vue';
import type { StoreRecord } from '@/types';
import { loadRecordEntries } from '../record-cache-core';
import { matchesVisibleId } from '../subject-keys';
import { initEventBus, onEvent } from '@/libraries/utils/event-bus';
import { isRecordUpdatedPayload, type RecordEvent } from './use-record-refresh';
import { createDebouncedScheduler, type TimerAdapter } from '@/libraries/utils/debounced-scheduler';

/** Injectable bus/DB seams (record-cache-core StoreApi precedent) for tests. */
export interface RecordCacheDeps {
  subscribe: (event: RecordEvent, handler: (data: unknown) => void) => () => void;
  loadEntries: (prefix?: string, ids?: string[]) => Promise<Map<string, StoreRecord>>;
  /** Timer surface for the event-storm debounce; defaults to the real clock. */
  timer?: TimerAdapter;
}

/**
 * Event-storm settle window. A bulk import / WebDAV restore emits one
 * `record:updated` per store (often `key:'*'`), and without coalescing each
 * one forces a full re-read of the visible id set — the same "UI 运算过于
 * 集中" class as the host-DOM batch writes, just measured in DB round trips
 * and Vue re-renders instead of frames. Matches the PT dimmer's 300ms
 * trailing-edge debounce (single source: `createDebouncedScheduler`).
 */
export const RECORD_CACHE_RELOAD_DEBOUNCE_MS = 300;

const defaultDeps: RecordCacheDeps = {
  subscribe: (event, handler) => {
    initEventBus();
    return onEvent(event, handler);
  },
  loadEntries: (prefix, ids) => loadRecordEntries(prefix, ids),
};

/**
 * Reactive record map for a set of visible subjects, live-refreshed by the
 * background's record broadcasts (ADR-015).
 *
 * `initialRecords` lets a page that already read the map during `beforeMount`
 * seed the first paint, so subscribing costs no extra round trip before render.
 */
export function useRecordCache(
  prefix?: string,
  ids?: MaybeRefOrGetter<string[]>,
  initialRecords?: Map<string, StoreRecord>,
  deps: RecordCacheDeps = defaultDeps,
) {
  const records = ref(initialRecords ?? new Map<string, StoreRecord>());
  const loading = ref(initialRecords === undefined);
  let lastLoadedKey: string | undefined;

  const resolveIds = (): string[] | undefined =>
    ids ? Array.from(new Set(toValue(ids) ?? [])) : undefined;
  const keyOf = (resolved: string[]): string => `${prefix ?? ''}|${[...resolved].sort().join(',')}`;

  async function load(force = false) {
    const resolved = resolveIds();
    // Explicit empty id list → nothing to fetch. NEVER fall back to a full-store scan.
    if (resolved !== undefined && resolved.length === 0) {
      records.value = new Map();
      loading.value = false;
      lastLoadedKey = undefined;
      return;
    }
    // Skip reloads when the visible id set is unchanged (dedup growth triggers).
    const key = resolved !== undefined ? keyOf(resolved) : undefined;
    if (!force && resolved !== undefined && key === lastLoadedKey) return;
    lastLoadedKey = key;
    loading.value = true;
    try {
      records.value = await deps.loadEntries(prefix, resolved);
    } catch (error: unknown) {
      console.error('[UMM] Failed to load douban records:', error);
    } finally {
      loading.value = false;
    }
  }

  /** Reload, bypassing the unchanged-ids dedup when `force` is set. */
  function refresh(force = false) {
    return load(force);
  }

  function clear() {
    records.value = new Map();
  }

  // Rows that arrive after mount (pagination, infinite scroll, SPA soft-nav) are
  // not in the seed map, so the read follows the visible id set instead. The
  // watched value is the sorted id string — a re-render over the same set, or in
  // a different order, stays inert (load() would dedup it anyway).
  const stopIdsWatch = ids
    ? watch(
        () => {
          const resolved = resolveIds();
          return resolved === undefined ? undefined : keyOf(resolved);
        },
        () => void load(),
      )
    : undefined;

  const defaultTimer: TimerAdapter = {
    setTimeout: (cb, ms) => globalThis.setTimeout(cb, ms) as unknown as number,
    clearTimeout: (handle) => globalThis.clearTimeout(handle),
  };
  const reloadScheduler = createDebouncedScheduler(
    RECORD_CACHE_RELOAD_DEBOUNCE_MS,
    deps.timer ?? defaultTimer,
  );

  function onRecordEvent(data: unknown): void {
    if (!isRecordUpdatedPayload(data) || data.storeName !== 'douban_records') return;
    const resolved = ids ? toValue(ids) : undefined;
    // No id list → full-scan mode; missing key → bulk write. Both reload all.
    if (resolved === undefined || !data.key || matchesVisibleId(resolved, data.key)) {
      // Trailing-edge debounce: a storm of per-record broadcasts collapses into
      // one re-read of the visible set. Id-set growth stays on the immediate
      // `watch` path above — that is a structural change, not an event storm.
      reloadScheduler.schedule(() => void load(true));
    }
  }

  // Live badge refresh: reload when a record for a currently-visible subject is
  // written or deleted elsewhere (background broadcasts `record:updated` /
  // `record:deleted`). Both events take the same path — the re-read decides what
  // the badge shows, so a delete lands as "no record" without extra logic.
  let unsubscribe = (): void => {
    reloadScheduler.cancel();
    stopIdsWatch?.();
  };
  try {
    // Collect incrementally so a throw on the second subscribe cannot leak the
    // first off() handle (array literal evaluates left-to-right and discards it).
    const release: Array<() => void> = [];
    try {
      release.push(deps.subscribe('record:updated', onRecordEvent));
      release.push(deps.subscribe('record:deleted', onRecordEvent));
    } catch (inner) {
      for (const off of release) off();
      throw inner;
    }
    unsubscribe = () => {
      reloadScheduler.cancel();
      stopIdsWatch?.();
      for (const off of release) off();
    };
  } catch (e: unknown) {
    // Bus unavailable (e.g. non-browser test env) — no live reload, but say so.
    console.warn('[UMM] useRecordCache subscribe failed:', e);
  }
  // Released for good at unmount: the overlay lives in a page that can be
  // soft-navigated, and a stale subscriber would reload a dead map.
  if (getCurrentInstance()) onUnmounted(unsubscribe);

  return { records, loading, load, clear, refresh, unsubscribe };
}
