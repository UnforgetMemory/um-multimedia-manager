import { test, expect } from '@playwright/test';
import { MTeamHandler } from '@/entrypoints/content/enhancers/pt/dimmer/mteam';

/**
 * X9-B 分片写入契约（MTeamHandler.processMTeamRows）：
 * 首轮 ~100 行的 setAttribute/classList 同步批量写会在宿主页面产生长任务，
 * 现改为 runChunked 逐帧写入。本 spec 用可注入 schedule 手动驱动"帧"，锁定：
 * 1. 每帧写入行数 ≤ chunkSize（首块在调用帧内同步完成，与 dom-chunk 一致）；
 * 2. cancel-on-restart：新 pass 启动即取消在途旧 pass——旧 pass 不再写任何行，
 *    其 promise 照常 resolve（调用方 await 不死锁），已打标行由签名去重跳过，
 *    每个最终行恰好被写一次。
 */

const ORIGIN = 'https://m-team.cc';
const MOVIE_DOUBAN_HREF = 'https://www.douban.com/subject/1001/';

/** Playwright 单测跑在 Node，无 location 全局 —— 桩一个 origin 供 URL 归一化。 */
test.beforeAll(() => {
  (globalThis as { location?: { origin: string } }).location = { origin: ORIGIN };
});

// Workers are shared across spec files; the location stub must not outlive this one.
const ORIGINAL_LOCATION = Object.getOwnPropertyDescriptor(globalThis, 'location');
test.afterAll(() => {
  if (ORIGINAL_LOCATION) Object.defineProperty(globalThis, 'location', ORIGINAL_LOCATION);
  else delete (globalThis as Record<string, unknown>).location;
});

class FakeLink {
  readonly href: string;
  constructor(href: string) {
    this.href = href;
  }
  getAttribute(name: string): string | null {
    return name === 'href' ? this.href : null;
  }
}

/** 结构桩行：仅实现 processMTeamRows 写路径所需的 DOM 表面。 */
class FakeRow {
  attrs = new Map<string, string>();
  dataset: Record<string, string> = {};
  /** umm-dimmed 添加历史（锁定“写过 dim”，与最终是否仍在 dim 态无关） */
  dimmedClasses: string[] = [];
  /** 当前类集合：undim（D1）需真实 remove，故用 Set 建模而非纯追加日志 */
  classes = new Set<string>();
  /** data-umm-mteam-matched 写入次数（每行恰好一次 = 无重复写/无旧 pass 补写） */
  stampWrites = 0;
  classList = {
    add: (cls: string) => {
      this.classes.add(cls);
      this.dimmedClasses.push(cls);
    },
    remove: (cls: string) => {
      this.classes.delete(cls);
    },
    contains: (cls: string) => this.classes.has(cls),
  };

  readonly links: FakeLink[];

  constructor(links: FakeLink[]) {
    this.links = links;
  }

  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
    if (name === 'data-umm-mteam-matched') this.stampWrites++;
  }

  querySelectorAll(selector: string): FakeLink[] {
    if (selector === 'a[href]') return this.links;
    const fragment = selector.match(/\[href\*="([^"]+)"\]/)?.[1];
    if (!fragment) return [];
    return this.links.filter((link) => link.href.includes(fragment));
  }

  querySelector(selector: string): FakeLink | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }
}

/** 匹配行：含豆瓣 subject 链接（ID 命中已看集合）+ 唯一 detail 链接（签名去重）。 */
function makeMatchedRow(index: number): FakeRow {
  return new FakeRow([
    new FakeLink(MOVIE_DOUBAN_HREF),
    new FakeLink(`${ORIGIN}/detail/${1000 + index}`),
  ]);
}

function asElements(rows: FakeRow[]): Element[] {
  return rows as unknown as Element[];
}

/** 可注入的同步"帧"时钟：每次 schedule = 一帧，tick 驱动下一帧。 */
function makeClock() {
  const queue: (() => void)[] = [];
  return {
    schedule: (task: () => void) => {
      queue.push(task);
      return () => {
        const i = queue.indexOf(task);
        if (i >= 0) queue.splice(i, 1);
      };
    },
    tick: () => {
      const task = queue.shift();
      task?.();
    },
    pendingFrames: () => queue.length,
    drain: () => {
      while (queue.length > 0) {
        queue.shift()!();
      }
    },
  };
}

const MOVIE = new Set(['1001']);
const MUSIC = new Set<string>();
const IMDB = new Set<string>();

test.describe('MTeamHandler.processMTeamRows 分片契约（X9-B）', () => {
  test('45 行 chunkSize=10：每帧至多写 10 行，写满即止', async () => {
    const clock = makeClock();
    const handler = new MTeamHandler();
    const rows = Array.from({ length: 45 }, (_, i) => makeMatchedRow(i));

    const done = handler.processMTeamRows(asElements(rows), MOVIE, MUSIC, IMDB, {
      chunkSize: 10,
      schedule: clock.schedule,
    });

    // 首块在调用帧内同步写入
    expect(rows.filter((r) => r.stampWrites > 0)).toHaveLength(10);
    expect(clock.pendingFrames()).toBe(1);

    clock.tick();
    expect(rows.filter((r) => r.stampWrites > 0)).toHaveLength(20);
    clock.tick();
    expect(rows.filter((r) => r.stampWrites > 0)).toHaveLength(30);
    clock.tick();
    expect(rows.filter((r) => r.stampWrites > 0)).toHaveLength(40);
    clock.tick();
    expect(rows.filter((r) => r.stampWrites > 0)).toHaveLength(45);

    await done;
    expect(clock.pendingFrames()).toBe(0);
    // 全部行最终 resolved + dimmed（行为与同步版一致，仅调度变化）
    for (const row of rows) {
      expect(row.getAttribute('data-umm-mteam-resolved')).toBe('true');
      expect(row.dimmedClasses).toContain('umm-dimmed');
      expect(row.stampWrites).toBe(1);
    }
  });

  test('cancel-on-restart：新 pass 取消在途旧 pass，每行恰好写一次且旧 promise 不挂起', async () => {
    const clock = makeClock();
    const handler = new MTeamHandler();
    const rows = Array.from({ length: 25 }, (_, i) => makeMatchedRow(i));

    // 旧 pass A：写出前 10 行后停在帧间
    const runA = handler.processMTeamRows(asElements(rows), MOVIE, MUSIC, IMDB, {
      chunkSize: 10,
      schedule: clock.schedule,
    });
    expect(rows.filter((r) => r.stampWrites > 0)).toHaveLength(10);

    // 新 pass B 启动 → A 的在途帧必须被取消（队列里只允许剩 B 的 1 帧）
    const runB = handler.processMTeamRows(asElements(rows), MOVIE, MUSIC, IMDB, {
      chunkSize: 10,
      schedule: clock.schedule,
    });
    expect(clock.pendingFrames()).toBe(1);

    // A 被取消后 promise 仍 resolve（内容脚本侧 await 链不死锁）
    await runA;

    // B 的后续帧：每帧 10 行；已打标的 0-9 行经签名去重跳过，不重复写
    clock.drain();
    await runB;

    expect(rows.filter((r) => r.stampWrites > 0)).toHaveLength(25);
    for (const row of rows) {
      expect(row.stampWrites).toBe(1);
      expect(row.getAttribute('data-umm-mteam-resolved')).toBe('true');
    }
  });

  test('teardown 取消在途 pass，剩余行不再被写', async () => {
    const clock = makeClock();
    const handler = new MTeamHandler();
    const rows = Array.from({ length: 30 }, (_, i) => makeMatchedRow(i));

    const done = handler.processMTeamRows(asElements(rows), MOVIE, MUSIC, IMDB, {
      chunkSize: 10,
      schedule: clock.schedule,
    });
    handler.teardown();
    clock.drain();
    await done;

    // 仅首帧的 10 行落盘，teardown 后不再补写
    expect(rows.filter((r) => r.stampWrites > 0)).toHaveLength(10);
  });
});

/**
 * D1 un-dim 规则（processMTeamRows）：行级"未看过"新判定必须撤下 .umm-dimmed；
 * 无直接 ID 的行本 pass 仅是"未知"（判定属 applyCacheFallback），类保持不动，
 * 避免每轮事件把 cache-resolved 的淡化行闪一下。
 */
test.describe('MTeamHandler.processMTeamRows un-dim 规则（D1）', () => {
  test('带未命中直接 ID 的已淡化行被 un-dim；无 ID 行的类保持不动', async () => {
    const clock = makeClock();
    const handler = new MTeamHandler();

    // 直接豆瓣 ID 9999 不在 MOVIE 集合 → 本轮判定"未看过" → 撤下 umm-dimmed
    // （首链接即命中早退，9999 必须排在 1001 之前）
    const idRow = new FakeRow([
      new FakeLink('https://www.douban.com/subject/9999/'),
      new FakeLink(`${ORIGIN}/detail/9999`),
    ]);
    // 无 douban/imdb 链接（仅 detail）→ 本 pass 无判定 → 类不清掉
    const idlessRow = new FakeRow([new FakeLink(`${ORIGIN}/detail/8888`)]);
    for (const row of [idRow, idlessRow]) {
      row.classList.add('umm-dimmed');
    }

    await handler.processMTeamRows(asElements([idRow, idlessRow]), MOVIE, MUSIC, IMDB, {
      chunkSize: 10,
      schedule: clock.schedule,
    });
    clock.drain();

    expect(idRow.classes.has('umm-dimmed')).toBe(false);
    expect(idlessRow.classes.has('umm-dimmed')).toBe(true);
    // 两行本轮都写了 matched=false
    expect(idRow.getAttribute('data-umm-mteam-matched')).toBe('false');
    expect(idlessRow.getAttribute('data-umm-mteam-matched')).toBe('false');
  });
});
