/**
 * WebDAV 写操作单飞锁（ADR-027 R1）。
 *
 * 为什么需要：`DataScheduler` 的超时只 reject「等待」、**不中止已开始的操作**
 * （见 `engine/data-scheduler/data-scheduler.ts` 的 `Promise.race` 语义），因此一次
 * 超时的同步仍在后台继续写。用户看到失败后重试，第二次任务就会与第一次并发，
 * 两次 PUT 交错会让远端落在任一次的中间状态。预检指纹只能挡住「先写、后启动」的
 * 那一次（第二个任务重算即失配），挡不住同刻启动。
 *
 * 作用域 = service worker 进程内（模块级布尔）：SW 被回收时锁自然复位。
 * 锁只应覆盖真实的写期间，故调用方必须在 `finally` 中释放，且**在取锁失败时
 * 直接回报而不是排队**（排队会把「用户以为失败 → 重试」变成双重执行）。
 */

let writeInFlight = false;

/** 尝试取锁；已有写在飞返回 false。 */
export function tryAcquireWebdavWrite(): boolean {
  if (writeInFlight) return false;
  writeInFlight = true;
  return true;
}

/** 释放锁（幂等：重复释放无副作用）。 */
export function releaseWebdavWrite(): void {
  writeInFlight = false;
}
