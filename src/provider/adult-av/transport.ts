/**
 * Adult-AV provider — transport layer.
 *
 * Message-RPC client to the background handlers (content scripts must never
 * touch IndexedDB directly). Pure id-normalization/matching rules live in
 * `./models.ts`; this file only speaks chrome.runtime messages.
 *
 * Failure policy per method: writers and full-list reads reject (a caller that
 * acts on the data must see the error); the two dimmer/statistics reads resolve
 * with an explicit `ok` flag instead of swallowing — `has()` keeps its legacy
 * boolean contract.
 */

import type {
  AdultAvId,
  AdultAvIdInput,
  MessageType,
  MessagePayloadMap,
  MessageSuccess,
  RuntimeMessageEnvelope,
} from '@/types';
import { safeSendMessage } from '@/libraries/utils/context';
import { errorMessage } from '@/libraries/utils/error-message';
import { matchesBaseId, normalizeWatchedIds } from './models';

/**
 * Three-segment watched counts. `ok:false` means the background never gave a
 * complete answer: the numbers are placeholders and MUST NOT be cached or
 * painted as a verdict (a fabricated 0/0/0 otherwise sticks for the page's
 * whole life — the reason this read used to be unretryable).
 */
export interface AdultAvStatsResult {
  ok: boolean;
  jp: number;
  us: number;
  tid: number;
  error?: string;
}

/**
 * Watched-id batch answer: a Set (dim-only callers keep using `.has()`) tagged
 * with whether the answer is authoritative. `ok:false` ⇒ the empty set means
 * "the read failed", not "nothing watched".
 */
export interface AdultAvWatchedSet extends Set<string> {
  ok: boolean;
  error?: string;
}

function tagWatched(watched: Set<string>, ok: boolean, error?: string): AdultAvWatchedSet {
  return error === undefined
    ? Object.assign(watched, { ok })
    : Object.assign(watched, { ok, error });
}

function failedStats(error: string): AdultAvStatsResult {
  return { ok: false, jp: 0, us: 0, tid: 0, error };
}

async function sendMsg<K extends MessageType>(
  type: K,
  payload: MessagePayloadMap[K],
): Promise<MessageSuccess<K>> {
  // The generic pair is per-K constrained but not provably a member of the
  // whole envelope union — one documented assertion at this boundary.
  const res = await safeSendMessage<K>(
    { type, payload } as Extract<RuntimeMessageEnvelope, { type: K }>,
    { timeout: 8000, retries: 1 },
  );
  if (!res) throw new Error(`${type} failed: no response`);
  if (!res.success) {
    const err = res as { error?: string };
    throw new Error(err.error || `${type} failed`);
  }
  // Narrowed by the guard above; the generic indexed access is not
  // distributive in TS, hence the documented cast.
  return res as unknown as MessageSuccess<K>;
}

export const AdultAvStore = {
  async getAll(source?: string): Promise<AdultAvId[]> {
    const res = await sendMsg('ADULT_AV_GET_ALL', source ? { source } : {});
    return res.items || [];
  },

  async has(id: string): Promise<boolean> {
    try {
      const res = await sendMsg('ADULT_AV_CHECK', { id });
      return !!(res?.exists ?? res?.watched ?? false);
    } catch {
      return false;
    }
  },

  /**
   * Batch check: one message for all IDs, answered set tagged with `ok` so a
   * dead background is never mistaken for "nothing watched". Never rejects —
   * these are fire-and-forget calls from content scripts.
   */
  async batchCheckExists(ids: string[]): Promise<AdultAvWatchedSet> {
    if (ids.length === 0) return tagWatched(new Set<string>(), true);
    try {
      const res = await sendMsg('ADULT_AV_CHECK_BATCH', { ids });
      if (!Array.isArray(res.watched)) {
        // success:true without a usable array is a broken answer, not a verdict.
        return tagWatched(
          new Set<string>(),
          false,
          'ADULT_AV_CHECK_BATCH failed: success response without watched array',
        );
      }
      return tagWatched(normalizeWatchedIds(res.watched), true);
    } catch (err: unknown) {
      return tagWatched(new Set<string>(), false, errorMessage(err));
    }
  },

  async add(source: string, id: string, rating: number = 0, url: string = ''): Promise<void> {
    await sendMsg('ADULT_AV_ADD', { source, id, rating, url });
  },

  /**
   * 三段已看统计（ADR-025 D5 各自按表计数）：日系 / 美欧 / 帖子。
   * `ok:false` 专用于「没读到」——调用方必须把它与真实的 0/0/0 区分开，
   * 不得作为结论缓存或渲染（失败一次即永久显示假数字是既往缺陷）。
   */
  async stats(): Promise<AdultAvStatsResult> {
    try {
      const res = await sendMsg('ADULT_AV_STATS', {});
      const { jp, us, tid } = res;
      if (typeof jp !== 'number' || typeof us !== 'number' || typeof tid !== 'number') {
        return failedStats('ADULT_AV_STATS failed: success response without complete counts');
      }
      return { ok: true, jp, us, tid };
    } catch (err: unknown) {
      return failedStats(errorMessage(err));
    }
  },

  async batchAdd(source: string, items: AdultAvIdInput[]): Promise<number> {
    const res = await sendMsg('ADULT_AV_BATCH_ADD', { source, items });
    return res.addedCount || 0;
  },

  /** Find all records matching a base ID (handles UC/C suffix variants) */
  async findByBaseId(baseId: string): Promise<AdultAvId[]> {
    const all = await this.getAll();
    // Matching rule (suffix/base-id equivalence) is a pure models.ts concern.
    return all.filter((item) => matchesBaseId(item.id, baseId));
  },
};
