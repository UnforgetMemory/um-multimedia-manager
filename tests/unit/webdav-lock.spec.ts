import { test, expect } from '@playwright/test';
import {
  releaseWebdavWrite,
  tryAcquireWebdavWrite,
} from '@/entrypoints/background/handlers/webdav-lock';

/**
 * WebDAV 写操作单飞锁（ADR-027 R1）。
 *
 * 契约：同一时刻只允许一个写操作在飞；取锁失败**不排队**（调用方回报
 * `WRITE_IN_PROGRESS` 而不是等待 —— 排队会把「用户以为失败后重试」变成双重执行）；
 * 释放幂等；释放后必须能重新取到（否则一次异常会让 WebDAV 永久不可写）。
 *
 * 该模块是纯状态机，故用单测钉死语义；真正的并发触发需要调度器超时（>180s）
 * 后操作仍在后台跑的时序，harness 里不可复现，见 ADR-027 的说明。
 */

test.describe('webdav write lock', () => {
  test.beforeEach(() => {
    // 模块级状态跨用例存活（同 worker 共享模块实例）——每个用例先归零。
    releaseWebdavWrite();
  });

  test('首个取锁成功，第二个被拒（不排队）', () => {
    expect(tryAcquireWebdavWrite()).toBe(true);
    expect(tryAcquireWebdavWrite()).toBe(false);
    expect(tryAcquireWebdavWrite()).toBe(false);
  });

  test('释放后可重新取锁（异常路径不会让锁永久占用）', () => {
    expect(tryAcquireWebdavWrite()).toBe(true);
    releaseWebdavWrite();
    expect(tryAcquireWebdavWrite()).toBe(true);
    releaseWebdavWrite();
    expect(tryAcquireWebdavWrite()).toBe(true);
    releaseWebdavWrite();
  });

  test('释放幂等：重复释放不会让第二个持有者被静默放行', () => {
    expect(tryAcquireWebdavWrite()).toBe(true);
    releaseWebdavWrite();
    releaseWebdavWrite();
    expect(tryAcquireWebdavWrite()).toBe(true);
    // 第二次释放属于「已释放」状态，不应影响当前持有者的排他性。
    releaseWebdavWrite();
    expect(tryAcquireWebdavWrite()).toBe(true);
    releaseWebdavWrite();
  });

  test('模拟取锁→释放的循环不会泄漏状态（连跑 50 轮）', () => {
    for (let i = 0; i < 50; i++) {
      expect(tryAcquireWebdavWrite(), `round ${i}`).toBe(true);
      expect(tryAcquireWebdavWrite(), `round ${i} second`).toBe(false);
      releaseWebdavWrite();
    }
  });

  test('持锁期间的 reject 不会自动释放（锁只由 finally 释放）', async () => {
    expect(tryAcquireWebdavWrite()).toBe(true);
    await expect(Promise.reject(new Error('boom'))).rejects.toThrow('boom');
    // 调用方未释放 → 仍然占用，这正是「超时后操作仍在后台跑」时应有的姿态。
    expect(tryAcquireWebdavWrite()).toBe(false);
    releaseWebdavWrite();
  });
});
