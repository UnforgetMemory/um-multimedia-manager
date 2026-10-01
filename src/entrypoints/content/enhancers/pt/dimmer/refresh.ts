/**
 * PT Dimmer 实时刷新纯函数。
 *
 * 事件路径（record:updated / record:deleted）在既有 MutationObserver 之上叠加：
 * 1. clearResolvedAttributes —— 清除行上的 resolved 标记，使 process 可重新评估；
 * 2. createDebouncedScheduler —— 300ms 尾沿防抖，合并批量导入等事件风暴
 *    （基元已下沉 `libraries/utils/debounced-scheduler`，此处 re-export 保持
 *    PT 侧与 mukaku 既有导入路径稳定）。
 *
 * 两函数均通过注入（元素 / 计时器）解耦 DOM 与真实时钟，便于单元测试。
 */

export {
  createDebouncedScheduler,
  type TimerAdapter,
  type DebouncedScheduler,
} from '@/libraries/utils/debounced-scheduler';

/** 最小结构类型：能移除 resolved 标记的元素（Element 满足此形状）。 */
export type MarkerElement = { removeAttribute(name: string): void };

/**
 * 移除行上的两套 resolved 标记（data-umm-resolved / data-umm-mteam-resolved）。
 * 若不清除，nexusphp.ts / mteam.ts 会永久跳过已解决行，事件后的重跑对其是 no-op。
 */
export function clearResolvedAttributes(el: MarkerElement): void {
  el.removeAttribute('data-umm-resolved');
  el.removeAttribute('data-umm-mteam-resolved');
}

/**
 * Whether a single-key `record:updated`/`record:deleted` event can affect
 * this row. `key === '*'` (bulk import) always re-checks. A composite key
 * `movie::1292052` re-checks rows whose markup mentions the provider id.
 * Rows we cannot prove unrelated are re-checked (fail-open for correctness).
 */
export function rowMightMatchKey(rowHtml: string, key: string): boolean {
  if (key === '*' || key === '') return true;
  const id = key.includes('::') ? key.slice(key.lastIndexOf('::') + 2) : key;
  if (!id) return true;
  return rowHtml.includes(id);
}
