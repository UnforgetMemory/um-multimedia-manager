import { test, expect } from '@playwright/test'
import {
  clearMukakuMarkers,
  clearProcessedMarkers,
  createDebouncedScheduler,
  isDetailContextStale,
  shouldRefreshForEvent,
  type TimerAdapter,
} from '@/entrypoints/content/handlers/mukaku/refresh'

/**
 * Mukaku Dimmer 实时刷新纯函数单元测试。
 *
 * 背景（S1/S4）：handler.ts 在卡片上打 data-umm-mukaku-processed="true" 标记并加
 * umm-dimmed 类。路由切换后旧页卡片残留 processed 标记导致新页不再评估（S1），
 * record 事件（record:updated/deleted）后已处理卡片需要重评估才能即时取消变暗（S4）。
 *
 * 修复策略：
 * 1. clearMukakuMarkers / clearProcessedMarkers —— 清除标记与 dim 类，使卡片重评估；
 * 2. shouldRefreshForEvent —— 仅 douban/imdb store 的 record 事件值得触发刷新；
 * 3. isDetailContextStale —— 路由切换后 mvId 变了（或无 mvId）即上下文过期；
 * 4. createDebouncedScheduler —— 300ms 尾沿防抖（自 pt/dimmer/refresh 重导出）。
 */

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

test.describe('clearMukakuMarkers', () => {
  test('同时移除 data-umm-mukaku-processed 属性与 umm-dimmed 类', () => {
    const removedAttrs: string[] = []
    const removedClasses: string[] = []
    const el = {
      removeAttribute: (name: string) => {
        removedAttrs.push(name)
      },
      classList: {
        remove: (className: string) => {
          removedClasses.push(className)
        },
      },
    }

    clearMukakuMarkers(el)

    expect(removedAttrs).toEqual(['data-umm-mukaku-processed'])
    expect(removedClasses).toEqual(['umm-dimmed'])
  })

  test('对同一元素重复调用幂等（第二次不再产生可观察变化）', () => {
    // 模拟真实 DOM：removeAttribute / classList.remove 对不存在的值是 no-op
    const attrs = new Set(['data-umm-mukaku-processed'])
    const classes = new Set(['umm-dimmed'])
    const removedAttrs: string[] = []
    const removedClasses: string[] = []
    const el = {
      removeAttribute: (name: string) => {
        if (attrs.delete(name)) removedAttrs.push(name)
      },
      classList: {
        remove: (className: string) => {
          if (classes.delete(className)) removedClasses.push(className)
        },
      },
    }

    clearMukakuMarkers(el)
    clearMukakuMarkers(el)

    expect(removedAttrs).toEqual(['data-umm-mukaku-processed'])
    expect(removedClasses).toEqual(['umm-dimmed'])
  })

  test('缺少 classList 时不抛错，属性仍被移除', () => {
    const removedAttrs: string[] = []
    const el = {
      removeAttribute: (name: string) => {
        removedAttrs.push(name)
      },
    }

    clearMukakuMarkers(el)

    expect(removedAttrs).toEqual(['data-umm-mukaku-processed'])
  })
})

test.describe('clearProcessedMarkers', () => {
  test('清除所有匹配 data-umm-mukaku-processed="true" 的元素的标记与类', () => {
    const removals: { attrs: string[]; classes: string[] }[] = []
    const els = Array.from({ length: 3 }, () => {
      const rec = { attrs: [] as string[], classes: [] as string[] }
      removals.push(rec)
      return {
        removeAttribute: (name: string) => {
          rec.attrs.push(name)
        },
        classList: {
          remove: (className: string) => {
            rec.classes.push(className)
          },
        },
      }
    })
    const root = {
      querySelectorAll: (selector: string) => {
        expect(selector).toBe('[data-umm-mukaku-processed="true"]')
        return els
      },
    } as unknown as Pick<Document, 'querySelectorAll'>

    clearProcessedMarkers(root)

    expect(removals).toHaveLength(3)
    for (const r of removals) {
      expect(r.attrs).toEqual(['data-umm-mukaku-processed'])
      expect(r.classes).toEqual(['umm-dimmed'])
    }
  })
})

test.describe('shouldRefreshForEvent', () => {
  test('douban_records store 的事件应触发刷新', () => {
    expect(shouldRefreshForEvent({ storeName: 'douban_records' })).toBe(true)
  })

  test('imdb_records store 的事件应触发刷新', () => {
    expect(shouldRefreshForEvent({ storeName: 'imdb_records' })).toBe(true)
  })

  test('其他 store 不触发刷新', () => {
    expect(shouldRefreshForEvent({ storeName: 'neodb_records' })).toBe(false)
  })

  test('storeName 非字符串不触发刷新', () => {
    expect(shouldRefreshForEvent({ storeName: 42 })).toBe(false)
    expect(shouldRefreshForEvent({})).toBe(false)
  })

  test('null 与 undefined 不触发刷新', () => {
    expect(shouldRefreshForEvent(null)).toBe(false)
    expect(shouldRefreshForEvent(undefined)).toBe(false)
  })

  test('非对象（字符串/数组）不触发刷新', () => {
    expect(shouldRefreshForEvent('douban_records')).toBe(false)
    expect(shouldRefreshForEvent(['douban_records'])).toBe(false)
  })
})

test.describe('isDetailContextStale', () => {
  test('currentHref 中 mvId 与 originalMvId 相同则不过期', () => {
    expect(isDetailContextStale('123', 'https://www.mukaku.com/mv/123')).toBe(false)
  })

  test('mvId 匹配不区分大小写（与站点 regex /i 一致）', () => {
    expect(isDetailContextStale('123', 'https://www.mukaku.com/MV/123')).toBe(false)
  })

  test('mvId 不同则过期', () => {
    expect(isDetailContextStale('123', 'https://www.mukaku.com/mv/456')).toBe(true)
  })

  test('currentHref 中无 mvId 则过期', () => {
    expect(isDetailContextStale('123', 'https://www.mukaku.com/actor/foo')).toBe(true)
  })
})

test.describe('createDebouncedScheduler（自 pt/dimmer/refresh 重导出）', () => {
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
