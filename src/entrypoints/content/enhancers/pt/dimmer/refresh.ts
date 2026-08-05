/**
 * PT Dimmer 实时刷新纯函数。
 *
 * 事件路径（record:updated / record:deleted）在既有 MutationObserver 之上叠加：
 * 1. clearResolvedAttributes —— 清除行上的 resolved 标记，使 process 可重新评估；
 * 2. createDebouncedScheduler —— 300ms 尾沿防抖，合并批量导入等事件风暴。
 *
 * 两函数均通过注入（元素 / 计时器）解耦 DOM 与真实时钟，便于单元测试。
 */

/** 最小结构类型：能移除 resolved 标记的元素（Element 满足此形状）。 */
export type MarkerElement = { removeAttribute(name: string): void }

/**
 * 移除行上的两套 resolved 标记（data-umm-resolved / data-umm-mteam-resolved）。
 * 若不清除，nexusphp.ts / mteam.ts 会永久跳过已解决行，事件后的重跑对其是 no-op。
 */
export function clearResolvedAttributes(el: MarkerElement): void {
  el.removeAttribute('data-umm-resolved')
  el.removeAttribute('data-umm-mteam-resolved')
}

/** 注入的计时器表面（生产环境为 window.setTimeout / window.clearTimeout）。 */
export interface TimerAdapter {
  setTimeout(callback: () => void, ms: number): number
  clearTimeout(handle: number): void
}

/**
 * 尾沿防抖调度器：`schedule` 在 delay 窗口内合并多次调用，只保留最后一次
 * （最新的 callback 在静默 delay 毫秒后触发）。`cancel` 取消已排队回调。
 */
export function createDebouncedScheduler(delay: number, timer: TimerAdapter): {
  schedule(callback: () => void): void
  cancel(): void
} {
  let handle: number | null = null
  return {
    schedule(callback: () => void): void {
      if (handle !== null) timer.clearTimeout(handle)
      handle = timer.setTimeout(() => {
        handle = null
        callback()
      }, delay)
    },
    cancel(): void {
      if (handle !== null) {
        timer.clearTimeout(handle)
        handle = null
      }
    },
  }
}
