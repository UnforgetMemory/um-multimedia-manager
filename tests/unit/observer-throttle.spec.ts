import { test, expect } from '@playwright/test';
import { sleep, throttle } from '@/libraries/utils';

/**
 * throttle（trailing 语义）契约 —— 内容脚本 MutationObserver 回调统一收口
 * 到该工具（audit §P-C：youtube-homepage / bilibili-homepage / javdb /
 * sehuatang 分页同步）。观察器回调均为「触发即批量重扫」，节流丢中间事件
 * 不丢最终状态，前提是 trailing 调用必然发生且携带最新参数。
 */

test.describe('throttle — leading + trailing 语义', () => {
  test('窗口内首次立即执行（leading），不发火中间调用', async () => {
    const seen: number[] = [];
    const fn = throttle((n: number) => {
      seen.push(n);
    }, 60);
    fn(1);
    expect(seen).toEqual([1]); // leading 同步执行
    fn(2);
    fn(3);
    expect(seen).toEqual([1]); // 窗口内被合并
    await sleep(150);
    expect(seen).toEqual([1, 3]); // trailing：窗口到期恰好补一次，携带最新参数
  });

  test('持续高频触发下执行次数受窗口约束（MutationObserver 风暴模拟）', async () => {
    let calls = 0;
    const fn = throttle(() => {
      calls += 1;
    }, 50);
    for (let i = 0; i < 100; i++) fn(); // 同一宏任务批量涌入（模拟微任务批合并回调）
    expect(calls).toBe(1);
    await sleep(120);
    expect(calls).toBe(2); // 只补一次 trailing，而非 100 次
  });

  test('窗口过期后再次立即放行（不退化为 debounce）', async () => {
    const seen: number[] = [];
    const fn = throttle((n: number) => {
      seen.push(n);
    }, 40);
    fn(1);
    await sleep(100);
    fn(2);
    expect(seen).toEqual([1, 2]); // 第二次调用同步执行，无额外延迟
    await sleep(100);
    expect(seen).toEqual([1, 2]); // 未被合并吞掉，也不重复 trailing
  });
});
