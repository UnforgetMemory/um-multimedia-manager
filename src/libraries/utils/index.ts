/**
 * 工具函数模块
 *
 * Utils 单例仅保留仍被外部消费的两个评分方法（2026-08-29 死代码清理：
 * safeParse/normalizeStatus/nowISO/normalizeUrl/旧 delegate/waitForElement/
 * dimElement/getRandomDelay/canonicalArrayMap/toArrayOfObjects/formatRelativeTime
 * 均无外部引用，见 docs/audit/research-architecture-perf-typed-2026-08-29.md §4.3）。
 */

export const Utils = {
  /**
   * 限制评分范围(0-10,步长0.5)
   */
  clampRating10(value: unknown): number {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) {
      return 0;
    }
    const normalized = Math.max(0, Math.min(10, Math.round(num * 2) / 2));
    return Number(normalized.toFixed(1));
  },

  /**
   * 格式化评分显示
   */
  formatRating10(value: unknown): string {
    const rating = Utils.clampRating10(value);
    if (!rating) {
      return '';
    }
    return Number.isInteger(rating) ? String(rating) : rating.toFixed(1);
  },
};

// `never[]` param keeps the constraint maximally permissive (contravariance):
// every callable signature satisfies it, same acceptance as the old unchecked form.
/**
 * 节流函数（带 trailing edge）
 * 确保函数在指定间隔内至少执行一次，且最后一次调用会在延迟后执行。
 */
/**
 * Trailing-edge throttle.
 *
 * The returned function carries `cancel()`: without it the pending trailing
 * call is unreachable from outside the closure, so a route/overlay teardown
 * cannot stop a write that is already scheduled — the released page's DOM gets
 * modified, and a background read fires after the owner is gone. Every caller
 * that owns a teardown path should cancel it there.
 */
export interface Cancellable<T extends (...args: never[]) => void> {
  (...args: Parameters<T>): void;
  cancel(): void;
}

export function throttle<T extends (...args: never[]) => void>(
  fn: T,
  delay: number,
): Cancellable<T> {
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const throttled = (...args: Parameters<T>): void => {
    const now = Date.now();
    if (now - last >= delay) {
      last = now;
      fn(...args);
      return;
    }
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(
      () => {
        timer = null;
        last = Date.now();
        fn(...args);
      },
      delay - (now - last),
    );
  };

  throttled.cancel = (): void => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return throttled;
}

/**
 * 防抖函数
 * 在连续调用中，只在最后一次调用后的延迟时间到达时执行。
 */
export function debounce<T extends (...args: never[]) => void>(fn: T, delay: number): T {
  let timer: ReturnType<typeof setTimeout> | null = null;

  return ((...args: Parameters<T>) => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => fn(...args), delay);
  }) as T;
}

/**
 * 延迟执行
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 本地时区 YYYY-MM-DD 日期键（用于按天聚合统计）
 */
export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
