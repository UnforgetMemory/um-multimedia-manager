import { test, expect } from '@playwright/test'
import {
  clearResolvedAttributes,
  createDebouncedScheduler,
  type MarkerElement,
  type TimerAdapter,
} from '@/entrypoints/content/enhancers/pt/dimmer/refresh'

/**
 * PT Dimmer 实时刷新纯函数单元测试。
 *
 * 背景（ROOT CAUSE 已核实）：dimmer/index.ts 的 event 回调只置空 this.idCache，
 * 但 idCache 在 process 时被按值捕获进 ctx，且 MTeamHandler 有实例级 setsExpiry
 * （+30s）缓存、NexusPHPHandler 在 ctx 上自缓存（+30s）。同时已处理的行会被
 * data-umm-resolved="true" / data-umm-mteam-resolved="true" 永久跳过。
 * 因此 record:updated/record:deleted 事件后，即使重跑 process 对已解决行也是 no-op。
 *
 * 修复策略（事件路径，叠加在 MutationObserver 之上）：
 * 1. clearResolvedAttributes —— 清除两套 resolved 标记，使已解决行可被重新评估；
 * 2. createDebouncedScheduler —— 300ms 尾沿防抖，合并批量导入等事件风暴。
 * 两个 helper 都通过注入（元素 / 计时器）解耦 DOM 与真实时钟，本 spec 做行为锁定。
 */

test.describe('clearResolvedAttributes', () => {
  test('移除 data-umm-resolved 与 data-umm-mteam-resolved 两个标记', () => {
    const removed: string[] = []
    const el: MarkerElement = {
      removeAttribute: (name: string) => {
        removed.push(name)
      },
    }

    clearResolvedAttributes(el)

    expect(removed).toEqual(['data-umm-resolved', 'data-umm-mteam-resolved'])
  })

  test('不触碰其他属性（仅清除 resolved 标记）', () => {
    const removed: string[] = []
    const el: MarkerElement = {
      removeAttribute: (name: string) => {
        removed.push(name)
      },
    }

    clearResolvedAttributes(el)

    expect(removed.some((n) => n !== 'data-umm-resolved' && n !== 'data-umm-mteam-resolved')).toBe(
      false
    )
  })

  test('对同一元素重复调用幂等（第二次不再移除任何标记）', () => {
    // 模拟真实 DOM：removeAttribute 对不存在的属性是 no-op，不产生可观察状态变化
    const attrs = new Set(['data-umm-resolved', 'data-umm-mteam-resolved'])
    const removed: string[] = []
    const el: MarkerElement = {
      removeAttribute: (name: string) => {
        if (attrs.delete(name)) removed.push(name)
      },
    }

    clearResolvedAttributes(el)
    clearResolvedAttributes(el)

    expect(removed).toEqual(['data-umm-resolved', 'data-umm-mteam-resolved'])
  })
})

/** 可控假时钟：手动推进时间，按截止时间触发已到期的任务。 */
function createFakeTimer() {
  let now = 0
  let nextId = 1
  const pending = new Map<number, { at: number; cb: () => void }>()

  const adapter: TimerAdapter = {
    setTimeout(cb: () => void, ms: number): number {
      const id = nextId++
      pending.set(id, { at: now + ms, cb })
      return id
    },
    clearTimeout(handle: number): void {
      pending.delete(handle)
    },
  }

  return {
    adapter,
    advance(ms: number): void {
      now += ms
      const due = [...pending.entries()]
        .filter(([, task]) => task.at <= now)
        .sort((a, b) => a[1].at - b[1].at)
      for (const [id] of due) pending.delete(id)
      for (const [, task] of due) task.cb()
    },
    pendingCount(): number {
      return pending.size
    },
  }
}

test.describe('createDebouncedScheduler', () => {
  test('调度后经 delay 毫秒触发回调', () => {
    const clock = createFakeTimer()
    const scheduler = createDebouncedScheduler(300, clock.adapter)
    let fired = 0

    scheduler.schedule(() => {
      fired++
    })

    expect(fired).toBe(0)
    clock.advance(299)
    expect(fired).toBe(0)
    clock.advance(1)
    expect(fired).toBe(1)
  })

  test('防抖合并：delay 内多次调度只触发最后一次（尾沿）', () => {
    const clock = createFakeTimer()
    const scheduler = createDebouncedScheduler(300, clock.adapter)
    const calls: string[] = []

    scheduler.schedule(() => calls.push('first'))
    clock.advance(100)
    scheduler.schedule(() => calls.push('second'))
    clock.advance(100)
    scheduler.schedule(() => calls.push('third'))

    clock.advance(300)

    expect(calls).toEqual(['third'])
  })

  test('触发后再次调度可再触发（可重复使用）', () => {
    const clock = createFakeTimer()
    const scheduler = createDebouncedScheduler(300, clock.adapter)
    let fired = 0

    scheduler.schedule(() => fired++)
    clock.advance(300)
    scheduler.schedule(() => fired++)
    clock.advance(300)

    expect(fired).toBe(2)
  })

  test('cancel 阻止已排队的回调触发', () => {
    const clock = createFakeTimer()
    const scheduler = createDebouncedScheduler(300, clock.adapter)
    let fired = 0

    scheduler.schedule(() => fired++)
    scheduler.cancel()
    clock.advance(1000)

    expect(fired).toBe(0)
    expect(clock.pendingCount()).toBe(0)
  })
})
