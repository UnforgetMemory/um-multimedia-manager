/**
 * Sehuatang overlay reads that go to the background service worker.
 *
 * A read that was never answered is NOT an answer. While the worker is asleep
 * or mid-IndexedDB-open the mount-time watched check and the global statistics
 * row used to come back "nothing watched" / "0, 0, 0", get cached as if they
 * were verdicts, and stuck for the rest of the page's life (the consumer's
 * retry branch was unreachable because the provider never reported failure).
 * Both reads therefore keep the failure signal and re-issue on a short ladder;
 * only an answered read ever reaches the statistics cache.
 */

import { AdultAvStore } from '@/provider/adult-av';
import { classifyAvId, normalizeAvId } from '@/provider/adult-av/models';
import { errorMessage } from '@/libraries/utils/error-message';
import { sleep } from '@/libraries/utils';

/** Three-segment watched counts (JP / US / thread posts). */
export interface AvStats {
  jp: number;
  us: number;
  tid: number;
}

export interface StatsRead {
  ok: boolean;
  stats: AvStats | null;
  error?: string;
}

export interface WatchedRead {
  ok: boolean;
  /** Empty on `ok:false` — that means "unread", never "nothing watched". */
  watched: Set<string>;
  error?: string;
}

export interface ReadRetryOptions {
  attempts?: number;
  /** Injectable backoff so tests drive the ladder without sleeping. */
  wait?: (ms: number) => Promise<void>;
}

/** A cold worker usually answers on the second or third shot; more attempts
 *  would only stretch the time a skeleton stays on screen (each attempt can
 *  itself wait out the 8s message timeout). */
const ATTEMPTS = 3;
const BACKOFF_MS = [400, 1200] as const;

/** Rendered instead of a number while the statistics read has no answer —
 *  digits would be a claim we cannot support. */
export const STATS_UNKNOWN = '—';

function backoffFor(index: number): number {
  return BACKOFF_MS[Math.min(index, BACKOFF_MS.length - 1)]!;
}

/** Watched-id batch read with the ladder applied; never rejects. */
export async function readWatchedIds(
  ids: string[],
  opts: ReadRetryOptions = {},
): Promise<WatchedRead> {
  if (ids.length === 0) return { ok: true, watched: new Set<string>() };
  const attempts = opts.attempts ?? ATTEMPTS;
  const wait = opts.wait ?? sleep;
  let error = 'no attempt made';
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await wait(backoffFor(attempt - 1));
    try {
      const res = await AdultAvStore.batchCheckExists(ids);
      if (res.ok) return { ok: true, watched: res };
      error = res.error ?? 'unread';
    } catch (err: unknown) {
      error = errorMessage(err);
    }
  }
  return { ok: false, watched: new Set<string>(), error };
}

// Statistics cache: `null` means "no answer yet", which is deliberately
// different from an answered 0/0/0. Bumped on local saves, dropped on remote
// record changes and on every page re-run.
let cachedStats: AvStats | null = null;
let inFlight: Promise<StatsRead> | null = null;
// A dropped read must not repopulate the cache after it went stale.
let generation = 0;

export function getCachedGlobalStats(): AvStats | null {
  return cachedStats;
}

/** Drop the cached answer (and any in-flight read) so the next refresh re-reads. */
export function invalidateGlobalStats(): void {
  cachedStats = null;
  inFlight = null;
  generation += 1;
}

/** Local marks grow the displayed totals without waiting for a full re-read. */
export function bumpGlobalStats(ids: string[]): void {
  if (!cachedStats) return;
  for (const id of ids) {
    const kind = classifyAvId(normalizeAvId(id));
    if (kind === 'us') cachedStats.us += 1;
    else if (kind === 'tid') cachedStats.tid += 1;
    else cachedStats.jp += 1;
  }
}

/**
 * Read the global statistics, retrying a failed ladder run, and cache only an
 * answered result. A warm cache costs no message — callers that know the
 * numbers went stale call invalidateGlobalStats() first. Concurrent callers
 * share one read; a settled failure leaves the cache untouched so the next
 * refresh tries again.
 */
export function loadGlobalStats(opts: ReadRetryOptions = {}): Promise<StatsRead> {
  if (cachedStats) return Promise.resolve({ ok: true, stats: cachedStats });
  if (inFlight) return inFlight;
  const startedGeneration = generation;
  const pending: Promise<StatsRead> = readGlobalStatsOnce(opts).then((res) => {
    // Free the slot before resolving so a chained caller can start a fresh read.
    if (inFlight === pending) inFlight = null;
    if (res.ok && res.stats && startedGeneration === generation) cachedStats = res.stats;
    return res;
  });
  inFlight = pending;
  return pending;
}

async function readGlobalStatsOnce(opts: ReadRetryOptions): Promise<StatsRead> {
  const attempts = opts.attempts ?? ATTEMPTS;
  const wait = opts.wait ?? sleep;
  let error = 'no attempt made';
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await wait(backoffFor(attempt - 1));
    try {
      const res = await AdultAvStore.stats();
      if (res.ok) return { ok: true, stats: { jp: res.jp, us: res.us, tid: res.tid } };
      error = res.error ?? 'unread';
    } catch (err: unknown) {
      error = errorMessage(err);
    }
  }
  return { ok: false, stats: null, error };
}
