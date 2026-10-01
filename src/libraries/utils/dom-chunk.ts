/**
 * rAF-chunked DOM write scheduler (ADR-026 req: avoid one-shot bulk host-page
 * mutations causing long tasks). Pure — injectable `schedule` for tests.
 */

export interface ChunkOptions {
  /** Items written per animation frame. */
  chunkSize?: number;
  /** Injectable for tests / non-browser envs; defaults to requestAnimationFrame. */
  schedule?: (task: () => void) => () => void;
}

export interface ChunkResult {
  /** Items whose `write` completed without throwing. */
  done: number;
  /** Items whose `write` threw; the batch continues past them. */
  failed: number;
  /** Thrown values in write order — kept so callers can report, never swallowed. */
  errors: unknown[];
}

export interface ChunkedRun {
  /** ALWAYS settles (drain, empty input, or cancel) so awaiting callers cannot hang. */
  promise: Promise<void>;
  /**
   * Live failure tally — final once `promise` settles. On the object (not the
   * promise value) because call sites store this as `Promise<void>`.
   */
  readonly result: ChunkResult;
  /** Stop before the next chunk; already-flushed chunks are not rolled back. */
  cancel: () => void;
}

const defaultSchedule = (task: () => void): (() => void) => {
  let rafId = 0;
  let cancelled = false;
  rafId = requestAnimationFrame(() => {
    if (!cancelled) task();
  });
  return () => {
    cancelled = true;
    cancelAnimationFrame(rafId);
  };
};

/**
 * Apply `write` to items in per-frame chunks so a large batch (e.g. dimming
 * ~100 torrent rows) never blocks one frame. Sequential writes keep DOM
 * ordering deterministic. Empty input resolves immediately. A throwing `write`
 * is counted into `result` and cannot abort the batch or strand the promise.
 */
export function runChunked<T>(
  items: readonly T[],
  write: (item: T, index: number) => void,
  options: ChunkOptions = {},
): ChunkedRun {
  const chunkSize = Math.max(1, options.chunkSize ?? 20);
  const schedule = options.schedule ?? defaultSchedule;
  let stop: (() => void) | undefined;
  let cancelled = false;
  let settle: () => void = () => {};
  const result: ChunkResult = { done: 0, failed: 0, errors: [] };

  const promise = new Promise<void>((resolve) => {
    settle = resolve;
    let i = 0;
    const step = (): void => {
      if (cancelled) {
        settle();
        return;
      }
      const from = i;
      const end = Math.min(from + chunkSize, items.length);
      i = end;
      // WHY per-item catch: one throwing write escaping into the rAF callback would
      // leave `step` unarmed and the promise unsettled — every awaiting caller
      // (PT dimmer passes, runActiveProcess's pendingClear) would hang forever.
      items.slice(from, end).forEach((item, offset) => {
        try {
          write(item, from + offset);
          result.done++;
        } catch (err: unknown) {
          result.failed++;
          result.errors.push(err);
        }
      });
      if (i >= items.length) {
        settle();
        return;
      }
      stop = schedule(step);
    };
    step();
  });

  return {
    promise,
    result,
    cancel: () => {
      cancelled = true;
      stop?.();
      // WHY: `stop` drops the pending frame so `step` never runs again — resolving
      // here is the only way an awaiting caller (a pass chained after this one)
      // cannot deadlock on a cancelled run.
      settle();
    },
  };
}
